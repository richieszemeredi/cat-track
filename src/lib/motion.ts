import type { Transition } from 'motion/react'

// The app's motion vocabulary, shared so every animated thing moves alike.
// CSS does the simple transitions (index.css, `ease-squishy`); Motion is only
// for what CSS cannot do — exits, layout/layoutId moves and interruptible
// springs. Durations stay short: this is a tool used one-handed over a bowl,
// not a showcase.

/** A quick spring that settles with a hint of overshoot. Ticks, pills, pops. */
export const squishy: Transition = { type: 'spring', stiffness: 500, damping: 32, mass: 0.8 }

/** A calmer spring for things that travel: list rows, a pill sliding across. */
export const glide: Transition = { type: 'spring', stiffness: 380, damping: 36 }

/** Plain fades for things appearing and leaving. */
export const fade: Transition = { duration: 0.18, ease: 'easeOut' }
