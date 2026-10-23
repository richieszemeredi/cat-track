import { format, isValid, parse, startOfDay } from 'date-fns'
import { useState, type SubmitEvent } from 'react'
import {
  addLitterBox,
  awaitOrQueued,
  deleteLitterBox,
  updateLitterBox,
  type LitterBox,
} from '../lib/db'
import { DEFAULT_LITTER_CHANGE_EVERY_WEEKS, weeksLabel } from '../lib/litter'

const FIELD_CLASS = 'field mt-1'

const DATE_FORMAT = 'yyyy-MM-dd'

// Twelve weeks covers every litter on the shelf; a box already saved with a
// longer interval keeps it (see the extra option below), the rules allow 52.
const INTERVAL_CHOICES = Array.from({ length: 12 }, (_, i) => i + 1)

function todayStr(): string {
  return format(new Date(), DATE_FORMAT)
}

/**
 * Add a litter box, or (with `existing`) fix its location and last-changed
 * date — the way back when a clean-out went untracked. Offline-friendly:
 * 'queued' counts as success.
 */
export function LitterBoxForm({
  hid,
  uid,
  existing,
  onDone,
}: {
  hid: string
  uid: string
  existing?: LitterBox
  onDone?: () => void
}) {
  const [location, setLocation] = useState(existing?.location ?? '')
  const [dateStr, setDateStr] = useState(
    existing === undefined ? todayStr() : format(existing.lastChangedAt, DATE_FORMAT),
  )
  const [everyWeeks, setEveryWeeks] = useState(
    existing?.changeEveryWeeks ?? DEFAULT_LITTER_CHANGE_EVERY_WEEKS,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    const trimmed = location.trim()
    if (trimmed === '') {
      setError('Say where this box lives.')
      return
    }
    // Local time — new Date('yyyy-MM-dd') lands on UTC midnight and shows the
    // previous day in western timezones.
    const lastChangedAt = startOfDay(parse(dateStr, DATE_FORMAT, new Date()))
    if (!isValid(lastChangedAt)) {
      setError('Pick a valid date.')
      return
    }

    setBusy(true)
    const input = { location: trimmed, lastChangedAt, changeEveryWeeks: everyWeeks }
    awaitOrQueued(
      existing === undefined
        ? addLitterBox(hid, uid, input)
        : updateLitterBox(hid, existing.id, input),
    )
      .then(() => {
        if (existing === undefined) {
          setLocation('')
          setDateStr(todayStr())
          setEveryWeeks(DEFAULT_LITTER_CHANGE_EVERY_WEEKS)
        }
        onDone?.()
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not save the litter box.')
      })
      .finally(() => {
        setBusy(false)
      })
  }

  const handleDelete = () => {
    if (existing === undefined) return
    if (!window.confirm(`Delete the ${existing.location} litter box?`)) return
    setError(null)
    setBusy(true)
    awaitOrQueued(deleteLitterBox(hid, existing.id))
      .then(() => {
        onDone?.()
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not delete the litter box.')
      })
      .finally(() => {
        setBusy(false)
      })
  }

  return (
    // noValidate + stacked fields, as in WeighForm: styled messages instead of
    // native bubbles, and a native date picker is too wide to share a row.
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="text-sm font-semibold">
        Location
        <input
          type="text"
          data-testid="litter-location"
          maxLength={60}
          value={location}
          placeholder="e.g. Bathroom"
          onChange={(event) => {
            setLocation(event.target.value)
          }}
          className={FIELD_CLASS}
        />
      </label>
      <label className="text-sm font-semibold">
        Last fully cleaned
        <input
          type="date"
          data-testid="litter-date"
          required
          value={dateStr}
          max={todayStr()}
          onChange={(event) => {
            setDateStr(event.target.value)
          }}
          className={FIELD_CLASS}
        />
      </label>
      <label className="text-sm font-semibold">
        Full clean every
        <select
          data-testid="litter-interval"
          value={everyWeeks}
          onChange={(event) => {
            setEveryWeeks(Number(event.target.value))
          }}
          className={FIELD_CLASS}
        >
          {(INTERVAL_CHOICES.includes(everyWeeks)
            ? INTERVAL_CHOICES
            : [...INTERVAL_CHOICES, everyWeeks]
          ).map((weeks) => (
            <option key={weeks} value={weeks}>
              {weeksLabel(weeks)}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" data-testid="litter-save" disabled={busy} className="btn-primary">
        {existing === undefined ? 'Add litter box' : 'Save changes'}
      </button>
      {existing === undefined ? null : (
        <button type="button" disabled={busy} onClick={handleDelete} className="btn-secondary">
          Delete litter box
        </button>
      )}
      {error === null ? null : (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </form>
  )
}
