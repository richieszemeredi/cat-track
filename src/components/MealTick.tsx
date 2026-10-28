import { m, type Transition } from 'motion/react'
import { fade, squishy } from '../lib/motion'

// The checkmark starts drawing a beat after the fill, so the bowl reads as
// "filled, then done" rather than one blob. A tween, not the spring: a spring
// that overshoots pathLength below 0 on the way back paints the whole stroke
// for a frame.
const drawIn: Transition = { ...fade, delay: 0.08 }
// Undoing has no beat to wait for — the check leaves as the fill shrinks.
const drawOut: Transition = fade

/**
 * The circle a planned bowl is ticked off with. Purely visual: the button
 * around it owns the label, the pressed state and the hit area.
 *
 * Both layers are always mounted and only ever animate between two values, so
 * a fast tick-undo-tick turns the spring round mid-flight instead of
 * restarting it. `initial={false}` is what keeps a bowl that was already
 * ticked when the page loaded from replaying its tick; a tick that arrives
 * later from the other phone still animates, because it is a change.
 */
export function MealTick({ given }: { given: boolean }) {
  return (
    <span
      aria-hidden="true"
      // The ring fades out under the fill rather than lingering as a hairline
      // halo round the coral edge. CSS skips the transition on first paint.
      className={`relative flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors duration-200 ease-squishy ${
        given ? 'border-transparent' : 'border-sand-deep'
      }`}
    >
      {/* -inset-0.5 reaches over the 2px ring, so the fill is the full 28px
      circle the old filled state was. */}
      <m.span
        className="absolute -inset-0.5 flex items-center justify-center rounded-full bg-coral text-on-coral"
        initial={false}
        animate={{ scale: given ? 1 : 0 }}
        transition={squishy}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          {/* The same check as ever, written from the short stroke up so it draws
          the way a hand would. Opacity rides along with the draw: a round cap
          on a zero-length stroke still paints a dot. */}
          <m.path
            d="M4 12l5 5L20 6"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={false}
            animate={{ pathLength: given ? 1 : 0, opacity: given ? 1 : 0 }}
            transition={given ? drawIn : drawOut}
          />
        </svg>
      </m.span>
    </span>
  )
}
