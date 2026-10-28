import { renderHook, waitFor } from '@testing-library/react'
import type * as motionReact from 'motion/react'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAnimatedNumber, useBounceWhenDone } from '../../src/lib/use-animated-number'

// jsdom has no matchMedia, so Motion can never see a reduced-motion
// preference here — stand one in that each test can flip. useAnimate's
// animate is a spy: what matters about the bounce is WHEN it fires.
const reduced = vi.hoisted(() => ({ value: false }))
const animateScope = vi.hoisted(() => vi.fn(() => Promise.resolve()))
vi.mock('motion/react', async (importOriginal) => ({
  ...(await importOriginal<typeof motionReact>()),
  useReducedMotion: () => reduced.value,
  useAnimate: () => [{ current: null, animations: [] }, animateScope],
}))

const render = (initial: number) =>
  renderHook(({ value }) => useAnimatedNumber(value), { initialProps: { value: initial } })

describe('useAnimatedNumber', () => {
  afterEach(() => {
    reduced.value = false
    MotionGlobalConfig.skipAnimations = true
  })

  describe('with animations skipped (Playwright, component tests)', () => {
    it('shows the exact value on mount and on every change, on the same render', () => {
      const { result, rerender } = render(161.4)
      expect(result.current).toBe(161.4)

      rerender({ value: 242.2 })
      expect(result.current).toBe(242.2)
    })
  })

  describe('with animations running', () => {
    beforeEach(() => {
      MotionGlobalConfig.skipAnimations = false
    })

    // Opening the app is not news: no count-up from zero on load.
    it('starts at the value it mounted with', async () => {
      const { result } = render(1.5)
      expect(result.current).toBe(1.5)
      // Give the frame loop a few ticks to do anything it was going to do.
      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(result.current).toBe(1.5)
    })

    it('tweens through the figures between and settles on exactly the new value', async () => {
      const { result, rerender } = render(81)
      const seen: number[] = []

      rerender({ value: 242 })
      // The render right after the change still shows the old figure — the
      // tween starts from what is on screen, not from the answer.
      expect(result.current).toBe(81)

      await waitFor(() => {
        seen.push(result.current)
        expect(result.current).toBe(242)
      })
      expect(seen.some((n) => n > 81 && n < 242)).toBe(true)
    })

    it('jumps straight to the value under reduced motion', () => {
      reduced.value = true
      const { result, rerender } = render(81)

      rerender({ value: 242 })
      expect(result.current).toBe(242)
    })
  })
})

describe('useBounceWhenDone', () => {
  afterEach(() => {
    animateScope.mockClear()
  })

  const render = (done: boolean) =>
    renderHook(({ done }) => useBounceWhenDone(done), { initialProps: { done } })

  // A day that was finished hours ago is not news.
  it('stays still when the screen opens on a finished day', () => {
    const { rerender } = render(true)
    rerender({ done: true })
    expect(animateScope).not.toHaveBeenCalled()
  })

  it('bounces once when the last bowl goes down, and not again while done', async () => {
    const { rerender } = render(false)
    rerender({ done: true })
    // Up, then down — one bounce.
    await waitFor(() => {
      expect(animateScope).toHaveBeenCalledTimes(2)
    })

    rerender({ done: true })
    expect(animateScope).toHaveBeenCalledTimes(2)
  })
})
