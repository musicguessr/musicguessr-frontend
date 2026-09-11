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
  ],
});
