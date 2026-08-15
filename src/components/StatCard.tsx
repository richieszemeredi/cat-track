import { type ReactNode } from 'react'

/**
 * A labelled figure. Deliberately NOT a card: stats sit side by side inside
 * one surface, separated by a hairline, so a screen reads as a page rather
 * than a stack of identical tiles.
 *
 * `tone` colours the value text only — the palette keeps green and red for
 * meaning, never for decoration.
 */
export type StatTone = 'plain' | 'positive'

export function StatCard({
  label,
  value,
  sub,
  tone = 'plain',
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: StatTone
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="section-label">{label}</div>
      <div
        className={`text-2xl font-bold tabular-nums ${tone === 'positive' ? 'text-positive' : 'text-ink'}`}
      >
        {value}
      </div>
      {sub === undefined ? null : <div className="text-sm text-ink-soft">{sub}</div>}
    </div>
  )
}
