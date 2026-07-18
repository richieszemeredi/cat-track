import { type ReactNode } from 'react'

const TONES = {
  plain: 'bg-white',
  coral: 'bg-coral-soft',
  mint: 'bg-mint-soft',
  butter: 'bg-butter/60',
} as const

export type StatTone = keyof typeof TONES

export function StatCard({
  label,
  value,
  sub,
  emoji,
  tone = 'plain',
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  emoji?: string
  tone?: StatTone
}) {
  return (
    <div className={`flex flex-col gap-1 rounded-squishy p-4 shadow-squishy ${TONES[tone]}`}>
      <div className="flex items-center gap-1.5 text-sm font-semibold text-ink-soft">
        {emoji === undefined ? null : <span aria-hidden="true">{emoji}</span>}
        {label}
      </div>
      <div className="text-3xl font-extrabold text-ink">{value}</div>
      {sub === undefined ? null : <div className="text-sm text-ink-soft">{sub}</div>}
    </div>
  )
}
