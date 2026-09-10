// Command entrypoint replaces the old shell-based entrypoint.sh.
//
// The "default" (hardened) Red Hat Hardened Images nginx variant ships with
// no shell, no package manager, and no coreutils — RUN/CMD scripts written
// as POSIX sh simply cannot execute in that image. This statically compiled,
// stdlib-only binary does the same runtime job (write config.json from env
// vars, patch SEO placeholders, create nginx's writable temp dirs) without
// requiring a shell, then execs into nginx as PID 1 so signals (graceful
// shutdown, reload) still reach it directly.
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"syscall"
)

// htmlDir is a var (not const) so tests can point it at a temp directory.
var htmlDir = "/usr/share/nginx/html"

// Temp dirs referenced by nginx.conf's *_temp_path directives — nginx
// requires the top-level directory to already exist; it only creates the
// hashed subdirectories on demand. These live under /tmp, which may be a
// fresh empty volume/tmpfs mount at every container start (common for
// read-only-root-filesystem deployments), so they must be created here at
// runtime rather than baked into the image.
var nginxTempDirs = []string{
	"/tmp/nginx_client",
	"/tmp/nginx_proxy",
	"/tmp/nginx_fastcgi",
	"/tmp/nginx_uwsgi",
	"/tmp/nginx_scgi",
}

type runtimeConfig struct {
	APIURL          string `json:"apiUrl"`
	SpotifyClientID string `json:"spotifyClientId"`
	AppleDevToken   string `json:"appleDevToken"`
}

func main() {
	log.SetFlags(0)
	logf("starting entrypoint")

	apiURL := normalizeAPIURL(os.Getenv("API_URL"))
	siteURL := normalizeSiteURL(os.Getenv("SITE_URL"))
	spotifyClientID := os.Getenv("SPOTIFY_CLIENT_ID")
	appleDevToken := os.Getenv("APPLE_DEV_TOKEN")
	googleVerification := os.Getenv("GOOGLE_SITE_VERIFICATION")
	bingVerification := os.Getenv("BING_SITE_VERIFICATION")
	gaMeasurementID := os.Getenv("GA_MEASUREMENT_ID")

	logf("API_URL (raw)=%q normalized=%q", os.Getenv("API_URL"), apiURL)
	logf("SITE_URL normalized=%q", siteURL)
	logf("SPOTIFY_CLIENT_ID set=%v APPLE_DEV_TOKEN set=%v", spotifyClientID != "", appleDevToken != "")
	logf("GOOGLE_SITE_VERIFICATION set=%v BING_SITE_VERIFICATION set=%v GA_MEASUREMENT_ID set=%v",
		googleVerification != "", bingVerification != "", gaMeasurementID != "")

	if err := makeNginxTempDirs(); err != nil {
		log.Fatalf("[entrypoint] failed to create nginx temp dirs: %v", err)
	}

	if err := writeRuntimeConfig(apiURL, spotifyClientID, appleDevToken); err != nil {
		log.Fatalf("[entrypoint] failed to write config.json: %v", err)
	}

	replacements := map[string]string{
		"__SITE_URL__":            siteURL,
		"__GOOGLE_VERIFICATION__": googleVerification,
		"__BING_VERIFICATION__":   bingVerification,
		"__GA_MEASUREMENT_ID__":   gaMeasurementID,
	}
	if err := patchPlaceholders(filepath.Join(htmlDir, "index.html"), replacements); err != nil {
		log.Fatalf("[entrypoint] failed to patch index.html: %v", err)
	}
	for _, name := range []string{"robots.txt", "sitemap.xml"} {
		if err := patchPlaceholders(filepath.Join(htmlDir, name), map[string]string{"__SITE_URL__": siteURL}); err != nil {
			log.Fatalf("[entrypoint] failed to patch %s: %v", name, err)
		}
	}

	execNginx()
}

func logf(format string, args ...any) {
	log.Printf("[entrypoint] "+format, args...)
}

// normalizeAPIURL mirrors the previous entrypoint.sh: default to
// http://localhost:8080 when unset, otherwise ensure a scheme is present.
func normalizeAPIURL(raw string) string {
	if raw == "" {
		return "http://localhost:8080"
	}
	if strings.HasPrefix(raw, "http://") || strings.HasPrefix(raw, "https://") {
		return raw
	}
	return "http://" + raw
}

// normalizeSiteURL mirrors the previous entrypoint.sh: default to
// https://example.com when unset, otherwise ensure a scheme and no trailing
// slash.
func normalizeSiteURL(raw string) string {
	if raw == "" {
		return "https://example.com"
	}
	if strings.HasPrefix(raw, "http://") || strings.HasPrefix(raw, "https://") {
		return strings.TrimRight(raw, "/")
	}
	return "https://" + strings.TrimRight(raw, "/")
}

func makeNginxTempDirs() error {
	for _, dir := range nginxTempDirs {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return fmt.Errorf("mkdir %s: %w", dir, err)
		}
	}
	return nil
}

// writeRuntimeConfig writes config.json via encoding/json rather than string
// interpolation into a heredoc — a client ID or token containing a `"` or
// `\` would have produced invalid JSON (or, worse, injected extra fields)
// under the old sed/heredoc approach.
func writeRuntimeConfig(apiURL, spotifyClientID, appleDevToken string) error {
	cfg := runtimeConfig{
		APIURL:          apiURL,
		SpotifyClientID: spotifyClientID,
		AppleDevToken:   appleDevToken,
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	path := filepath.Join(htmlDir, "config.json")
	logf("writing runtime config to %s", path)
	return os.WriteFile(path, data, 0o644)
}

// patchPlaceholders replaces each key in replacements with its value inside
// the file at path. A missing file or an already-patched file (placeholder
// no longer present) is not an error — matches the previous sed-based
// entrypoint.sh, which silently no-op'd in both cases.
func patchPlaceholders(path string, replacements map[string]string) error {
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		logf("skipping %s (not present in this build)", path)
		return nil
	}
	if err != nil {
		return err
	}
	content := string(data)
	for placeholder, value := range replacements {
		content = strings.ReplaceAll(content, placeholder, value)
	}
	logf("patched %s", path)
	return os.WriteFile(path, []byte(content), 0o644)
}

// execNginx replaces this process with nginx, forwarding whatever arguments
// Docker passed us (the image's own CMD, e.g. "-c /etc/nginx/nginx.conf -e
// /dev/stderr -g daemon off;") — nginx becomes PID 1, so it receives
// SIGQUIT/SIGTERM directly for graceful shutdown instead of through a
// forwarding shell.
func execNginx() {
	const nginxPath = "/usr/sbin/nginx"
	argv := append([]string{"nginx"}, os.Args[1:]...)
	logf("exec: %s %v", nginxPath, os.Args[1:])
	if err := syscall.Exec(nginxPath, argv, os.Environ()); err != nil {
		log.Fatalf("[entrypoint] exec nginx failed: %v", err)
	}
}
