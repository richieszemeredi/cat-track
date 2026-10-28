import { animate, MotionGlobalConfig, useAnimate, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { glide, squishy } from './motion'

// The big numbers move when they change, so a figure the other phone just
// changed is seen to change rather than silently being different. Never on
// first mount: opening the app is not news, and a count-up from zero on every
// launch would make the one figure the screen exists for unreadable for its
// first half-second.

/**
 * The figure to draw for `value`: `value` itself on first render, then a
 * tween from the previous figure whenever it changes. Format the result the
 * same way the plain value is formatted — the tween ends on exactly `value`,
 * so the settled text is identical to what an unanimated render would show.
 *
 * `glide` rather than `squishy`: its overshoot is far below anything a
 * rounded kcal or gram figure can show, where squishy's would flash a weight
 * that was never on the scale.
 */
export function useAnimatedNumber(value: number): number {
  const reduceMotion = useReducedMotion() === true
  // Under Playwright and in component tests Motion jumps every animation to
  // its end; read straight through so the text is final on the same render.
  const instant = reduceMotion || MotionGlobalConfig.skipAnimations === true
  const [shown, setShown] = useState(value)
  // Where the figure is right now, mid-tween included: a second change that
  // lands before the first settles carries on from what is on screen instead
  // of snapping back to the old value first.
  const current = useRef(value)

  useEffect(() => {
    if (instant) {
      current.current = value
      return
    }
    // From an equal value Motion completes at once with one update — which
    // also catches `shown` up if it went stale while motion was reduced.
    const controls = animate(current.current, value, {
      ...glide,
      onUpdate: (latest) => {
        current.current = latest
        setShown(latest)
      },
    })
    return () => {
      controls.stop()
    }
  }, [value, instant])

  return instant ? value : shown
}

/**
 * A one-shot `squishy` pop on the element when `value` changes after mount —
 * for the small "N of M" counts, where a tween from 1 to 2 is only a jump.
 * The element must not be plain inline (transforms ignore it): an
 * `inline-block` span, or a flex item. Reduced motion is handled by
 * `useAnimate` itself, which follows the app's MotionConfig.
 */
export function usePopOnChange<T extends HTMLElement>(value: number) {
  const [scope, animateScope] = useAnimate<T>()
  const previous = useRef(value)

  useEffect(() => {
    if (previous.current === value) return
    previous.current = value
    // Two keyframes, as a spring needs: the new figure lands a touch large
    // and springs back to size — the change of digit hides the snap.
    void animateScope(scope.current, { scale: [1.12, 1] }, squishy)
  }, [value, scope, animateScope])

  return scope
}
