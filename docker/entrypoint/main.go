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
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io/fs"
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
	// Every prerendered route (angular.json/app.config.server.ts:
	// '', 'create-deck', 'how-to-play', 'faq' at last count) gets its own
	// index.html under a route subdirectory (e.g. how-to-play/index.html),
	// not just the top-level one — SeoService also emits __SITE_URL__
	// placeholders into those (canonical link, og:url, JSON-LD) since
	// document.location.origin resolves to Angular's internal prerender
	// placeholder host, not the real domain, at build time. Patching only
	// the root index.html would leave every other prerendered page's
	// canonical/og:url stuck on that fake host forever.
	htmlFiles, err := findIndexHTMLFiles(htmlDir)
	if err != nil {
		log.Fatalf("[entrypoint] failed to list prerendered HTML files: %v", err)
	}
	patched := make([]string, 0, len(htmlFiles)+2)
	for _, path := range htmlFiles {
		if err := patchPlaceholders(path, replacements); err != nil {
			log.Fatalf("[entrypoint] failed to patch %s: %v", path, err)
		}
		patched = append(patched, path)
	}
	for _, name := range []string{"robots.txt", "sitemap.xml"} {
		path := filepath.Join(htmlDir, name)
		if err := patchPlaceholders(path, map[string]string{"__SITE_URL__": siteURL}); err != nil {
			log.Fatalf("[entrypoint] failed to patch %s: %v", name, err)
		}
		patched = append(patched, path)
	}

	// Must run after every patch above: the service worker verifies each file
	// it fetches against a build-time hash, and we just changed those files
	// out from under it.
	if err := rehashServiceWorkerManifest(patched); err != nil {
		log.Fatalf("[entrypoint] failed to update ngsw.json: %v", err)
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

// findIndexHTMLFiles returns the path to every index.html file under dir
// (the root shell plus one per prerendered route subdirectory), so
// patchPlaceholders can be applied to all of them.
func findIndexHTMLFiles(dir string) ([]string, error) {
	var files []string
	err := filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() && d.Name() == "index.html" {
			files = append(files, path)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return files, nil
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

// rehashServiceWorkerManifest rewrites ngsw.json's hashTable entries for the
// files this entrypoint patched at runtime.
//
// Angular's service worker records a SHA1 of every asset at build time and
// verifies each one it fetches against that hash. Because we rewrite
// index.html (and each prerendered route's copy) here — injecting SITE_URL,
// the verification tokens and the analytics id — every one of those files
// stops matching its recorded hash the moment the container starts. The
// worker then treats the whole app version as corrupt and refuses to serve
// it, which is worse than having no worker at all: the PWA would appear to
// install and then permanently fail to update.
//
// Recomputing from disk is correct rather than a workaround, because the
// files on disk are what the build produced plus exactly the substitutions
// we just made. The hash keeps doing its real job — catching a response
// mangled in transit between nginx and the browser.
//
// A build without a service worker (ng build --configuration development)
// has no ngsw.json; that's not an error, just nothing to do.
func rehashServiceWorkerManifest(patchedFiles []string) error {
	manifestPath := filepath.Join(htmlDir, "ngsw.json")
	data, err := os.ReadFile(manifestPath)
	if os.IsNotExist(err) {
		logf("no ngsw.json present, skipping service worker rehash")
		return nil
	}
	if err != nil {
		return err
	}

	// Decoded into a generic map so unknown//future fields survive the
	// round-trip untouched — only hashTable is ours to edit.
	var manifest map[string]any
	if err := json.Unmarshal(data, &manifest); err != nil {
		return fmt.Errorf("parse ngsw.json: %w", err)
	}
	hashTable, ok := manifest["hashTable"].(map[string]any)
	if !ok {
		return fmt.Errorf("ngsw.json has no hashTable object")
	}

	updated := 0
	for _, path := range patchedFiles {
		key, err := manifestKey(path)
		if err != nil {
			return err
		}
		if _, tracked := hashTable[key]; !tracked {
			// Patched but not part of any asset group (robots.txt and
			// sitemap.xml aren't) — nothing to keep in sync.
			continue
		}
		sum, err := sha1File(path)
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return err
		}
		hashTable[key] = sum
		updated++
	}

	out, err := json.Marshal(manifest)
	if err != nil {
		return err
	}
	if err := os.WriteFile(manifestPath, out, 0o644); err != nil {
		return err
	}
	logf("updated %d hash(es) in ngsw.json", updated)
	return nil
}

// manifestKey converts an on-disk path into the root-relative, slash-
// separated URL ngsw.json keys its hashTable by (e.g. "/faq/index.html").
func manifestKey(path string) (string, error) {
	rel, err := filepath.Rel(htmlDir, path)
	if err != nil {
		return "", err
	}
	return "/" + filepath.ToSlash(rel), nil
}

func sha1File(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	sum := sha1.Sum(data)
	return hex.EncodeToString(sum[:]), nil
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
