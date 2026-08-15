import { defineConfig, devices } from '@playwright/test'

// E2E + visual flows on the two phones this household actually uses. Run only
// via `npm run test:e2e` (everything) or `npm run test:visual` (layout only),
// both of which wrap this in `firebase emulators:exec`.
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
    // The bigger phone runs the full suite: journey, PWA plumbing and layout.
    {
      name: 'iphone-14-pro',
      use: { ...devices['iPhone 14 Pro'] },
    },
    // The smaller phone runs the layout pass only — it is the width things
    // break at, and re-running the 4-minute journey on it buys nothing.
    {
      name: 'iphone-12-mini',
      use: { ...devices['iPhone 12 Mini'] },
      testMatch: /layout\.spec\.ts/,
    },
  ],
  webServer: {
    command: 'npm run build:emu && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env['CI'],
    timeout: 240_000,
  },
})
