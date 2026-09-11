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
	if len(got) != 4 {
		t.Fatalf("expected 4 index.html files, got %d: %v", len(got), got)
	}
	for _, p := range got {
		if filepath.Base(p) != "index.html" {
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
