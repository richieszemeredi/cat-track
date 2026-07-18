import { defineConfig, devices } from '@playwright/test'

// E2E flows on an iPhone viewport. Run only via `npm run test:e2e`, which
// wraps this in `firebase emulators:exec` (Auth + Firestore emulators).
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  retries: process.env['CI'] ? 2 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'iphone', use: { ...devices['iPhone 13'] } }],
  webServer: {
    command: 'npm run build:emu && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env['CI'],
    timeout: 240_000,
  },
})
