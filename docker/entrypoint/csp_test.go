package main

import "testing"

func TestAPIOrigin(t *testing.T) {
	cases := map[string]string{
		"https://musicguessr.app":           "https://musicguessr.app",
		"https://api.example.com/v1/":       "https://api.example.com",
		"http://localhost:8080":             "http://localhost:8080",
		"http://" + "":                      "'self'",
		"not a url with spaces and no host": "'self'",
	}
	for in, want := range cases {
		if got := apiOrigin(in); got != want {
			t.Errorf("apiOrigin(%q) = %q, want %q", in, got, want)
		}
	}
}
