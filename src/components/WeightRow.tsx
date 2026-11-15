import { differenceInCalendarDays, format, startOfDay } from 'date-fns'
import { useState, type SubmitEvent } from 'react'
import { useAuth } from '../lib/auth'
import { formatWeightKg, roundKg, weeklyWeightTrend } from '../lib/catmath'
import { addWeightEntry, awaitOrQueued, type Cat, type WeightEntry } from '../lib/db'
import { useHousehold } from '../lib/household'
import { DECIMAL_INPUT_PROPS, parseDecimal } from '../lib/numbers'
import { effectiveLifeStage } from '../lib/target'

const signed = (kg: number) => `${kg >= 0 ? '+' : ''}${formatWeightKg(kg)}`

/** "today", "yesterday", "Nov 12" — calendar days, like the rest of the app. */
function dayWord(date: Date, today: Date): string {
  const days = differenceInCalendarDays(today, date)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  return format(date, 'MMM d')
}

/**
 * One cat's weight on Home: the latest weigh-in and how it is moving, plus —
 * until she has been weighed today — a kg field to log one without leaving
 * the screen. `named` is the several-cats shape: the cat's name leads and the
 * weight drops to the second line.
 */
export function WeightRow({
  cat,
  weights,
  today,
  named,
}: {
  cat: Cat
  /** Her weigh-ins, oldest first. */
  weights: readonly WeightEntry[]
  /** Start of today (`useToday().start`). */
  today: Date
  named: boolean
}) {
  const { householdId, canEdit } = useHousehold()
  const { user } = useAuth()
  const uid = user?.uid ?? null
  const [kgStr, setKgStr] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const latest = weights.at(-1)
  const previous = weights.at(-2)
  const weighedToday = weights.some((entry) => differenceInCalendarDays(today, entry.date) === 0)

  // Per week wherever a long enough span exists (catmath.weeklyWeightTrend);
  // the raw change since the previous weigh-in only while it doesn't, and the
  // words always say which, so the figure is never ambiguous about what it
  // divided by.
  const trend = weeklyWeightTrend(weights)
  const delta =
    trend !== null
      ? trend.kgPerWeek
      : latest !== undefined && previous !== undefined
        ? latest.weightKg - previous.weightKg
        : null
  const trendText =
    delta === null
      ? null
      : trend !== null
        ? `${signed(delta)}${named ? '/wk' : ' a week'}`
        : `${signed(delta)} since the last weigh-in`
  // Green only means "good" for a kitten putting weight on; for an adult a gain
  // is not automatically good news, so it stays neutral.
  const stage = effectiveLifeStage(cat, today)
  const isKitten = stage === 'kitten_0_4' || stage === 'kitten_4_12'
  const trendClass = delta !== null && delta > 0 && isKitten ? 'text-positive' : 'text-ink-soft'

  const kgText = latest === undefined ? null : `${roundKg(latest.weightKg).toFixed(2)} kg`
  const when = latest === undefined ? null : dayWord(latest.date, today)

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (uid === null) return
    setError(null)
    // parseDecimal so "1,52" from the iOS keypad is a weight, not a typo.
    const weightKg = parseDecimal(kgStr)
    if (weightKg === null || weightKg < 0.05 || weightKg > 30) {
      setError('Weight must be between 0.05 and 30 kg.')
      return
    }
    setBusy(true)
    // The same write the Weight screen's form makes, dated today at local
    // midnight as that form's date field would be.
    awaitOrQueued(
      addWeightEntry(householdId, cat.id, uid, {
        date: startOfDay(new Date()),
        weightKg,
        note: null,
      }),
    )
      .then(() => {
        // Both 'confirmed' and 'queued' mean it is on its way; the row then
        // counts as weighed today and the field goes.
        setKgStr('')
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not save the weigh-in.')
      })
      .finally(() => {
        setBusy(false)
      })
  }

  return (
    <div
      data-testid="home-weight-row"
      className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
    >
      {/* Sized by its content, not squeezed to fit beside the kg field: when
      the two don't fit on one line the field wraps under, rather than a long
      name breaking into three. */}
      <div className="min-w-0 flex-auto">
        {named ? (
          <>
            <p data-testid="home-weight-name" className="font-semibold break-words">
              {cat.name}
            </p>
            <p className="text-sm text-ink-soft tabular-nums">
              {kgText === null ? (
                'No weigh-ins yet'
              ) : (
                <>
                  <span data-testid="home-weight-latest">{kgText}</span> {when}
                  {trendText === null ? null : (
                    <>
                      {' · '}
                      <span data-testid="home-weight-trend" className={trendClass}>
                        {trendText}
                      </span>
                    </>
                  )}
                </>
              )}
            </p>
          </>
        ) : (
          <>
            <p className="tabular-nums">
              {kgText === null ? (
                <span className="text-ink-soft">No weigh-ins yet</span>
              ) : (
                <>
                  <span data-testid="home-weight-latest" className="font-semibold">
                    {kgText}
                  </span>{' '}
                  <span className="text-ink-soft">· {when}</span>
                </>
              )}
            </p>
            {trendText === null ? null : (
              <p data-testid="home-weight-trend" className={`text-sm tabular-nums ${trendClass}`}>
                {trendText}
              </p>
            )}
          </>
        )}
      </div>

      {canEdit && uid !== null && !weighedToday ? (
        <form noValidate onSubmit={handleSubmit} className="flex shrink-0 items-center gap-2">
          <label>
            <span className="sr-only">
              {named ? `${cat.name}’s weight today in kg` : 'Today’s weight in kg'}
            </span>
            <input
              {...DECIMAL_INPUT_PROPS}
              data-testid="home-weight-kg"
              value={kgStr}
              placeholder="kg"
              onChange={(e) => {
                setKgStr(e.target.value)
              }}
              className="field w-20 tabular-nums"
            />
          </label>
          <button
            type="submit"
            data-testid="home-weight-save"
            disabled={busy}
            className="btn-primary px-4 py-2"
          >
            Save
          </button>
        </form>
      ) : null}

      {error === null ? null : (
        <p role="alert" className="basis-full text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
