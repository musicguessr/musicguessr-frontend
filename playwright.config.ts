import { defineConfig, devices } from '@playwright/test';

// A small smoke suite, not a full e2e regression harness — it exists to
// catch the class of bug that unit tests (jsdom, no real rendering) and
// ESLint/Prettier/tsc (never actually render anything) all miss: a page
// that's fine in isolation but silently broken when it actually runs in a
// browser. The torch-icon SVG-geometry bug that shipped to production is a
// concrete example — nothing in this repo's existing CI would have caught it.
//
// Deliberately does not cover the camera/QR-scan flow: driving Chromium's
// fake-video-capture-device against a real page reliably crashed the
// renderer in every container environment tried while building this suite,
// with no config that fixed it — not something to ship unverified. The
// golden path this does cover (TAP TO PLAY -> reveal, see CLAUDE.md's iOS
// autoplay section) is the higher-value target anyway.
//
// Three engines (Chromium/Firefox/WebKit), not just Chromium: the
// this.player.loadVideoById crash that shipped to production happened on
// real Firefox on Android, a browser this suite otherwise never touches.
// These are Playwright's own upstream browser builds, though, not a
// privacy-hardened fork — they won't reproduce fingerprinting-resistance
// behavior (e.g. resistFingerprinting's canvas randomization, see
// webcodecs-qr.ts) since that's an opt-in privacy setting, not the engine's
// default. What this does catch is ordinary per-engine breakage: a DOM API
// used slightly differently, a CSS property unsupported outside Chromium.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4300',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx ng serve --port 4300',
    url: 'http://localhost:4300',
    reuseExistingServer: !process.env['CI'],
    timeout: 120 * 1000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    // A real Firefox engine with privacy.resistFingerprinting turned on —
    // the same preference IronFox and similar hardened forks ship enabled
    // by default, and a supported Playwright launch option, not a spoof.
    // Runs the full suite (still useful, if redundant — none of it touches
    // canvas), but exists specifically for e2e/canvas-fingerprinting.spec.ts,
    // which verifies the actual premise behind webcodecs-qr.ts: that canvas
    // reads are genuinely unusable under this setting, in a real engine,
    // not just asserted in a comment.
    {
      name: 'firefox-rfp',
      use: {
        ...devices['Desktop Firefox'],
        launchOptions: {
          firefoxUserPrefs: { 'privacy.resistFingerprinting': true },
        },
      },
    },
  ],
});
