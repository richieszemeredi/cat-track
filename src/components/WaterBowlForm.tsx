import { format, isAfter, isValid, parse } from 'date-fns'
import { useState, type SubmitEvent } from 'react'
import {
  addWaterBowl,
  awaitOrQueued,
  deleteWaterBowl,
  updateWaterBowl,
  type WaterBowl,
} from '../lib/db'

const FIELD_CLASS = 'field mt-1'

const DATE_FORMAT = 'yyyy-MM-dd'
const TIME_FORMAT = 'HH:mm'
// A phone clock and a typed minute never agree to the second.
const FUTURE_SLACK_MS = 60_000

/**
 * Add a water bowl, or (with `existing`) rename it and fix when its water was
 * replaced — the way back from a morning rush where the bowl was filled but
 * never logged. Left untouched, a new bowl's water counts as fresh from the
 * moment it is saved. Offline-friendly: 'queued' counts as success.
 */
export function WaterBowlForm({
  hid,
  uid,
  existing,
  onDone,
}: {
  hid: string
  uid: string
  existing?: WaterBowl
  onDone?: () => void
}) {
  const [location, setLocation] = useState(existing?.location ?? '')
  const [dateStr, setDateStr] = useState(() =>
    format(existing?.lastChangedAt ?? new Date(), DATE_FORMAT),
  )
  const [timeStr, setTimeStr] = useState(() =>
    format(existing?.lastChangedAt ?? new Date(), TIME_FORMAT),
  )
  // Whether the person touched either field; until then a new bowl takes the
  // time of the save, not the time the form happened to be opened.
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    const trimmed = location.trim()
    if (trimmed === '') {
      setError('Say where this bowl lives.')
      return
    }

    // Local time — new Date('yyyy-MM-dd') lands on UTC midnight.
    const picked = parse(`${dateStr} ${timeStr}`, `${DATE_FORMAT} ${TIME_FORMAT}`, new Date())
    if (!isValid(picked)) {
      setError('Pick a valid date and time.')
      return
    }
    if (isAfter(picked, new Date(Date.now() + FUTURE_SLACK_MS))) {
      setError("That time hasn't happened yet.")
      return
    }

    setBusy(true)
    awaitOrQueued(
      existing === undefined
        ? addWaterBowl(hid, uid, {
            location: trimmed,
            lastChangedAt: touched ? picked : new Date(),
          })
        : updateWaterBowl(hid, existing.id, {
            location: trimmed,
            // Only when changed: the fields hold minutes, the stored time seconds.
            ...(touched ? { lastChangedAt: picked } : {}),
          }),
    )
      .then(() => {
        if (existing === undefined) {
          setLocation('')
          setDateStr(format(new Date(), DATE_FORMAT))
          setTimeStr(format(new Date(), TIME_FORMAT))
          setTouched(false)
        }
        onDone?.()
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not save the water bowl.')
      })
      .finally(() => {
        setBusy(false)
      })
  }

  const handleDelete = () => {
    if (existing === undefined) return
    if (!window.confirm(`Delete the ${existing.location} water bowl?`)) return
    setError(null)
    setBusy(true)
    awaitOrQueued(deleteWaterBowl(hid, existing.id))
      .then(() => {
        onDone?.()
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not delete the water bowl.')
      })
      .finally(() => {
        setBusy(false)
      })
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="text-sm font-semibold">
        Location
        <input
          type="text"
          data-testid="water-location"
          maxLength={60}
          value={location}
          placeholder="e.g. Kitchen"
          onChange={(event) => {
            setLocation(event.target.value)
          }}
          className={FIELD_CLASS}
        />
      </label>
      <label className="text-sm font-semibold">
        Water last replaced
        <input
          type="date"
          data-testid="water-date"
          required
          value={dateStr}
          max={format(new Date(), DATE_FORMAT)}
          onChange={(event) => {
            setDateStr(event.target.value)
            setTouched(true)
          }}
          className={FIELD_CLASS}
        />
      </label>
      <label className="text-sm font-semibold">
        At
        <input
          type="time"
          data-testid="water-time"
          required
          value={timeStr}
          onChange={(event) => {
            setTimeStr(event.target.value)
            setTouched(true)
          }}
          className={FIELD_CLASS}
        />
      </label>
      <button type="submit" data-testid="water-save" disabled={busy} className="btn-primary">
        {existing === undefined ? 'Add water bowl' : 'Save changes'}
      </button>
      {existing === undefined ? null : (
        <button type="button" disabled={busy} onClick={handleDelete} className="btn-secondary">
          Delete water bowl
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
