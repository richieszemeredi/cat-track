import { useId, useState } from 'react'

const STEP_BUTTON =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-sand-deep ' +
  'bg-surface text-xl leading-none text-ink hover:bg-sand active:scale-95 disabled:opacity-40 ' +
  'transition-[scale,background-color,opacity] duration-150 ease-squishy'

/**
 * A whole-number picker: − and + for the usual one-or-two nudge, and the
 * number itself is a field, so 24 tins is typed rather than tapped 23 times.
 * The question is its visible label. Always clamps to [min, max].
 */
export function Stepper({
  label,
  value,
  min,
  max,
  unit,
  onChange,
  testId,
}: {
  label: string
  value: number
  min: number
  max: number
  /** What is being counted, after the number: "tins". */
  unit: string
  onChange: (value: number) => void
  testId: string
}) {
  const id = useId()
  // What is typed, while it is being typed: an empty field mid-edit must not
  // snap back to the minimum under the thumb.
  const [draft, setDraft] = useState<string | null>(null)

  function clamp(n: number): number {
    return Math.min(max, Math.max(min, n))
  }

  function step(by: number): void {
    setDraft(null)
    onChange(clamp(value + by))
  }

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="One fewer"
          data-testid={`${testId}-down`}
          disabled={value <= min}
          onClick={() => {
            step(-1)
          }}
          className={STEP_BUTTON}
        >
          −
        </button>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          data-testid={testId}
          value={draft ?? String(value)}
          onChange={(e) => {
            const raw = e.target.value
            setDraft(raw)
            const trimmed = raw.trim()
            if (/^\d+$/.test(trimmed)) onChange(clamp(Number(trimmed)))
          }}
          onBlur={() => {
            setDraft(null)
          }}
          className="field w-20 text-center text-2xl font-bold tabular-nums"
        />
        <button
          type="button"
          aria-label="One more"
          data-testid={`${testId}-up`}
          disabled={value >= max}
          onClick={() => {
            step(1)
          }}
          className={STEP_BUTTON}
        >
          +
        </button>
        <span className="text-ink-soft">{unit}</span>
      </div>
    </div>
  )
}
