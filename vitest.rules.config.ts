import { defineConfig } from 'vitest/config'

// Security-rules tests. Run only via `npm run test:rules`, which wraps this
// in `firebase emulators:exec` so the Firestore emulator is up.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/rules/**/*.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
})
