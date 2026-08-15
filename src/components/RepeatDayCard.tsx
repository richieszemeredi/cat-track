import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { useState } from 'react'
import { roundGrams, roundKcal } from '../lib/catmath'
import {
  addFeeding,
  addFeedings,
  awaitOrQueued,
  recentFeedingsQueryOptions,
  useRecentFeedingsLive,
  type Feeding,
} from '../lib/db'
import { lastLoggedDay, relativeDayLabel, repeatOnDay } from '../lib/repeat'
import { sumKcal } from '../lib/target'

/**
 * "Same as yesterday" shortcut. A cat eats the same two or three things every
 * day, so re-picking food + grams + time for each bowl is the app's most
 * repetitive act. Copies the last day that has meals onto today, keeping each
 * meal's time of day; individual meals can be copied one at a time too.
 */
export function RepeatDayCard({
  hid,
  catId,
  uid,
  todayStart,
}: {
  hid: string
  catId: string
  uid: string
  todayStart: Date
}) {
  const recentQuery = useQuery(recentFeedingsQueryOptions(hid, catId))
  useRecentFeedingsLive(hid, catId)

  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const previous = lastLoggedDay(recentQuery.data ?? [], todayStart)
  if (previous === null) return null

  const label = relativeDayLabel(previous.day, todayStart)
  const mealCount = previous.feedings.length

  async function copyAll(): Promise<void> {
    if (previous === null) return
    setError(null)
    setBusy('all')
    try {
      await awaitOrQueued(
        addFeedings(
          hid,
          catId,
          uid,
          previous.feedings.map((feeding) => repeatOnDay(feeding, todayStart)),
        ),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not copy those meals.')
    } finally {
      setBusy(null)
    }
  }

  async function copyOne(feeding: Feeding): Promise<void> {
    setError(null)
    setBusy(feeding.id)
    try {
      await awaitOrQueued(addFeeding(hid, catId, uid, repeatOnDay(feeding, todayStart)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not copy that meal.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section data-testid="repeat-day" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="section-label">Same as {label.toLowerCase()}</h2>
        <p className="text-sm text-ink-soft tabular-nums">
          {mealCount} {mealCount === 1 ? 'meal' : 'meals'} · {roundKcal(sumKcal(previous.feedings))}{' '}
          kcal
        </p>
      </div>

      <ul className="surface divide-y divide-sand">
        {previous.feedings.map((feeding) => (
          <li key={feeding.id} className="flex items-center gap-3 px-4 py-3">
            <span className="text-sm text-ink-soft tabular-nums">
              {format(feeding.datetime, 'HH:mm')}
            </span>
            <span className="min-w-0 flex-1 truncate font-medium">{feeding.foodNameSnapshot}</span>
            <span className="shrink-0 text-sm text-ink-soft tabular-nums">
              {roundGrams(feeding.amountG)} g
            </span>
            <button
              type="button"
              aria-label={`Log ${feeding.foodNameSnapshot} again`}
              disabled={busy !== null}
              onClick={() => {
                void copyOne(feeding)
              }}
              className="btn-chip shrink-0"
            >
              Add
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        data-testid="repeat-day-all"
        disabled={busy !== null}
        onClick={() => {
          void copyAll()
        }}
        className="btn-primary"
      >
        {busy === 'all' ? 'Copying…' : `Log all ${String(mealCount)} again`}
      </button>

      {error === null ? null : (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </section>
  )
}
