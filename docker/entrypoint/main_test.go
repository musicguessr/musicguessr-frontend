package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestNormalizeAPIURL(t *testing.T) {
	tests := []struct{ in, want string }{
		{"", "http://localhost:8080"},
		{"api.example.com", "http://api.example.com"},
		{"http://api.example.com", "http://api.example.com"},
		{"https://api.example.com", "https://api.example.com"},
	}
	for _, tc := range tests {
		if got := normalizeAPIURL(tc.in); got != tc.want {
			t.Errorf("normalizeAPIURL(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestNormalizeSiteURL(t *testing.T) {
	tests := []struct{ in, want string }{
		{"", "https://example.com"},
		{"musicguessr.app", "https://musicguessr.app"},
		{"musicguessr.app/", "https://musicguessr.app"},
		{"https://musicguessr.app/", "https://musicguessr.app"},
		{"http://localhost:4200", "http://localhost:4200"},
	}
	for _, tc := range tests {
		if got := normalizeSiteURL(tc.in); got != tc.want {
			t.Errorf("normalizeSiteURL(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestWriteRuntimeConfig(t *testing.T) {
	htmlDir = t.TempDir()
	// A value containing a quote/backslash must not corrupt the JSON output —
	// exactly the class of bug the old sed/heredoc approach was exposed to.
	if err := writeRuntimeConfig(`http://evil"};alert(1);//`, `client"id`, `token\with\backslashes`); err != nil {
		t.Fatalf("writeRuntimeConfig: %v", err)
	}
	data, err := os.ReadFile(filepath.Join(htmlDir, "config.json"))
	if err != nil {
		t.Fatalf("read config.json: %v", err)
	}
	var got runtimeConfig
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatalf("config.json is not valid JSON: %v\ncontent: %s", err, data)
	}
	if got.APIURL != `http://evil"};alert(1);//` || got.SpotifyClientID != `client"id` {
		t.Errorf("round-tripped values don't match: %+v", got)
	}
}

func TestWriteVersionInfo(t *testing.T) {
	htmlDir = t.TempDir()
	if err := writeVersionInfo("abc123", "2026-09-13"); err != nil {
		t.Fatalf("writeVersionInfo: %v", err)
	}
	data, err := os.ReadFile(filepath.Join(htmlDir, "version.json"))
	if err != nil {
		t.Fatalf("read version.json: %v", err)
	}
	var got versionInfo
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatalf("version.json is not valid JSON: %v\ncontent: %s", err, data)
	}
	if got.Commit != "abc123" || got.BuildDate != "2026-09-13" {
		t.Errorf("round-tripped values don't match: %+v", got)
	}
}

func TestPatchPlaceholders_MissingFileIsNotError(t *testing.T) {
	htmlDir = t.TempDir()
	err := patchPlaceholders(filepath.Join(htmlDir, "robots.txt"), map[string]string{"__SITE_URL__": "https://x.example"})
	if err != nil {
		t.Errorf("expected nil error for missing file, got %v", err)
	}
}

func TestPatchPlaceholders_ReplacesAndIsIdempotent(t *testing.T) {
	htmlDir = t.TempDir()
	path := filepath.Join(htmlDir, "index.html")
	if err := os.WriteFile(path, []byte(`<link rel="canonical" href="__SITE_URL__">`), 0o644); err != nil {
		t.Fatal(err)
	}
	repl := map[string]string{"__SITE_URL__": "https://musicguessr.app"}
	if err := patchPlaceholders(path, repl); err != nil {
		t.Fatalf("first patch: %v", err)
	}
	got, _ := os.ReadFile(path)
	want := `<link rel="canonical" href="https://musicguessr.app">`
	if string(got) != want {
		t.Errorf("after patch: got %q, want %q", got, want)
	}
	// Second pass over an already-patched file must not error (placeholder no
	// longer present — same as the old sed-based behavior).
	if err := patchPlaceholders(path, repl); err != nil {
		t.Fatalf("second (idempotent) patch: %v", err)
	}
	got2, _ := os.ReadFile(path)
	if string(got2) != want {
		t.Errorf("after second patch: got %q, want unchanged %q", got2, want)
	}
}

func TestFindIndexHTMLFiles(t *testing.T) {
	dir := t.TempDir()
	paths := []string{
		"index.html",
		"index.csr.html",
		filepath.Join("how-to-play", "index.html"),
		filepath.Join("faq", "index.html"),
		filepath.Join("deck", "123", "index.html"), // hypothetical nested route
		filepath.Join("assets", "not-index.html"),
	}
	for _, p := range paths {
		full := filepath.Join(dir, p)
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte("<html></html>"), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	got, err := findIndexHTMLFiles(dir)
	if err != nil {
		t.Fatalf("findIndexHTMLFiles: %v", err)
	}
	if len(got) != 5 {
		t.Fatalf("expected 5 HTML shell files, got %d: %v", len(got), got)
	}
	for _, p := range got {
		if b := filepath.Base(p); b != "index.html" && b != "index.csr.html" {
			t.Errorf("unexpected non-index.html file returned: %s", p)
		}
	}
}

func TestMakeNginxTempDirs(t *testing.T) {
	dir := t.TempDir()
	orig := nginxTempDirs
	defer func() { nginxTempDirs = orig }()
	nginxTempDirs = []string{filepath.Join(dir, "a"), filepath.Join(dir, "b", "c")}
	if err := makeNginxTempDirs(); err != nil {
		t.Fatalf("makeNginxTempDirs: %v", err)
	}
	for _, d := range nginxTempDirs {
		if info, err := os.Stat(d); err != nil || !info.IsDir() {
			t.Errorf("expected directory %s to exist", d)
		}
	}
}

// The service worker refuses to serve an app version whose files don't match
// the hashes recorded at build time — and this entrypoint rewrites exactly
// those files at container start. Without the rehash the PWA would install
// and then permanently fail to update, which is worse than shipping no
// worker at all.
func TestRehashServiceWorkerManifest(t *testing.T) {
	htmlDir = t.TempDir()

	indexPath := filepath.Join(htmlDir, "index.html")
	if err := os.WriteFile(indexPath, []byte(`<link href="__SITE_URL__" rel="canonical" />`), 0o644); err != nil {
		t.Fatalf("write index.html: %v", err)
	}
	routeDir := filepath.Join(htmlDir, "faq")
	if err := os.MkdirAll(routeDir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	routeIndex := filepath.Join(routeDir, "index.html")
	if err := os.WriteFile(routeIndex, []byte(`<meta content="__SITE_URL__" property="og:url" />`), 0o644); err != nil {
		t.Fatalf("write faq/index.html: %v", err)
	}
	// Untouched by the entrypoint: its hash must survive verbatim.
	assetPath := filepath.Join(htmlDir, "main-ABC123.js")
	if err := os.WriteFile(assetPath, []byte("console.log(1)"), 0o644); err != nil {
		t.Fatalf("write asset: %v", err)
	}
	assetHash, err := sha1File(assetPath)
	if err != nil {
		t.Fatalf("sha1File: %v", err)
	}

	manifest := map[string]any{
		"configVersion": 1,
		"index":         "/index.html",
		"hashTable": map[string]any{
			"/index.html":     "stale0000000000000000000000000000000000",
			"/faq/index.html": "stale1111111111111111111111111111111111",
			"/main-ABC123.js": assetHash,
		},
	}
	manifestPath := filepath.Join(htmlDir, "ngsw.json")
	data, err := json.Marshal(manifest)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if err := os.WriteFile(manifestPath, data, 0o644); err != nil {
		t.Fatalf("write ngsw.json: %v", err)
	}

	// Patch exactly as main() does, then rehash.
	repl := map[string]string{"__SITE_URL__": "https://musicguessr.app"}
	for _, p := range []string{indexPath, routeIndex} {
		if err := patchPlaceholders(p, repl); err != nil {
			t.Fatalf("patchPlaceholders: %v", err)
		}
	}
	robots := filepath.Join(htmlDir, "robots.txt")
	if err := os.WriteFile(robots, []byte("Sitemap: __SITE_URL__/sitemap.xml"), 0o644); err != nil {
		t.Fatalf("write robots.txt: %v", err)
	}
	if err := rehashServiceWorkerManifest([]string{indexPath, routeIndex, robots}); err != nil {
		t.Fatalf("rehashServiceWorkerManifest: %v", err)
	}

	var got map[string]any
	out, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatalf("read ngsw.json: %v", err)
	}
	if err := json.Unmarshal(out, &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	hashTable, ok := got["hashTable"].(map[string]any)
	if !ok {
		t.Fatal("hashTable missing after rehash")
	}

	for _, tc := range []struct{ key, path string }{
		{"/index.html", indexPath},
		{"/faq/index.html", routeIndex},
	} {
		want, err := sha1File(tc.path)
		if err != nil {
			t.Fatalf("sha1File(%s): %v", tc.path, err)
		}
		if hashTable[tc.key] != want {
			t.Errorf("hashTable[%q] = %v, want %v (hash of the patched file on disk)", tc.key, hashTable[tc.key], want)
		}
	}

	if hashTable["/main-ABC123.js"] != assetHash {
		t.Errorf("untouched asset hash was modified: got %v, want %v", hashTable["/main-ABC123.js"], assetHash)
	}
	// robots.txt isn't in any asset group, so it must not be added.
	if _, present := hashTable["/robots.txt"]; present {
		t.Error("robots.txt was added to hashTable; only files already tracked should be updated")
	}
	// Unrelated top-level fields must survive the round-trip.
	if got["index"] != "/index.html" {
		t.Errorf("index field = %v, want /index.html", got["index"])
	}
}

func TestRehashServiceWorkerManifest_NoManifestIsNotError(t *testing.T) {
	htmlDir = t.TempDir()
	if err := rehashServiceWorkerManifest([]string{filepath.Join(htmlDir, "index.html")}); err != nil {
		t.Fatalf("expected no error for a build without a service worker, got %v", err)
	}
}
