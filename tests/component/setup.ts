import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
})

// jsdom has no layout or animation frames worth waiting on: every Motion
// animation (an AnimatePresence exit included) completes immediately.
MotionGlobalConfig.skipAnimations = true
