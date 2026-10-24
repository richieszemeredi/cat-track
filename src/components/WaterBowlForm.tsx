import { useState, type SubmitEvent } from 'react'
import {
  addWaterBowl,
  awaitOrQueued,
  deleteWaterBowl,
  updateWaterBowl,
  type WaterBowl,
} from '../lib/db'

const FIELD_CLASS = 'field mt-1'

/**
 * Add a water bowl (its water counts as fresh from now), or (with `existing`)
 * rename it. Offline-friendly: 'queued' counts as success.
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

    setBusy(true)
    awaitOrQueued(
      existing === undefined
        ? addWaterBowl(hid, uid, { location: trimmed, lastChangedAt: new Date() })
        : updateWaterBowl(hid, existing.id, { location: trimmed }),
    )
      .then(() => {
        if (existing === undefined) setLocation('')
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
