import { useAnimatedNumber, usePopOnChange } from '../lib/use-animated-number'

/**
 * A big figure that tweens to its new value. Text only — no element of its
 * own, so it drops inside the span that already carries the figure's styling
 * and data-testid. A component rather than the hook called in place because
 * the tween re-renders every frame: this way that is one text node, not a
 * screen with a growth chart on it.
 */
export function AnimatedNumber({
  value,
  format,
}: {
  value: number
  format: (value: number) => string
}) {
  const shown = useAnimatedNumber(value)
  return <>{format(shown)}</>
}

/**
 * A small count ("2 of 3 meals") that pops when it changes. Its own component
 * so "after mount" means after THIS span mounted: a figure that appears with
 * its value already changed — the plan arriving after the feedings — is
 * opening the screen, not news.
 */
export function PoppingNumber({ value }: { value: number }) {
  const scope = usePopOnChange<HTMLSpanElement>(value)
  return (
    <span ref={scope} className="inline-block">
      {value}
    </span>
  )
}
