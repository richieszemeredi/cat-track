import { defineConfig, devices } from '@playwright/test'

// The app is opened in two places: Safari on the household's iPhones, and
// Chrome on a desktop. Both engines are covered here — Playwright's `iPhone`
// devices are WebKit, `Desktop Chrome`/`Pixel 7` are Chromium.
//
// Caveat worth knowing: Playwright's WebKit is NOT iOS Safari. It sizes
// `input[type=date|time]` correctly where a real iPhone does not, so form
// controls that fit here can still punch out of their card on the phone.
// Layout findings from a real device belong in tests/e2e/layout.spec.ts as
// explicit assertions, not as trust in the emulated engine.
//
// Run everything: `npm run test:e2e`. Layout pass only: `npm run test:visual`.
const LAYOUT_ONLY = /layout\.spec\.ts/

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  retries: process.env['CI'] ? 2 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [
    // The phone the household actually uses: full suite.
    {
      name: 'safari-iphone-14-pro',
      use: { ...devices['iPhone 14 Pro'] },
    },
    // The narrower phone. Layout only — it is the width things break at, and
    // re-running the whole journey on it buys nothing.
    {
      name: 'safari-iphone-12-mini',
      use: { ...devices['iPhone 12 Mini'] },
      testMatch: LAYOUT_ONLY,
    },
    // Chrome, at a phone width and on the desktop. Full suite on the phone
    // width so Chromium sees the real flows too.
    {
      name: 'chrome-phone',
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'chrome-desktop',
      use: { ...devices['Desktop Chrome'] },
      testMatch: LAYOUT_ONLY,
    },
  ],
  webServer: {
    command: 'npm run build:emu && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env['CI'],
    timeout: 240_000,
  },
})
