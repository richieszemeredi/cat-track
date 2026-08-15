import { format, isValid, parse } from 'date-fns'
import { useEffect, useState, type SubmitEvent } from 'react'
import { addWeightEntry, awaitOrQueued, type WeightInput } from '../lib/db'
import { DECIMAL_INPUT_PROPS, parseDecimal } from '../lib/numbers'

const FIELD_CLASS = 'field mt-1'

function todayStr(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

/** Add-a-weigh-in form. Offline-friendly: 'queued' counts as success. */
export function WeighForm({ hid, catId, uid }: { hid: string; catId: string; uid: string }) {
  const [weightStr, setWeightStr] = useState('')
  const [dateStr, setDateStr] = useState(todayStr)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!saved) return undefined
    const timer = setTimeout(() => {
      setSaved(false)
    }, 2500)
    return () => {
      clearTimeout(timer)
    }
  }, [saved])

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSaved(false)

    // parseDecimal so "4,25" from the iOS keypad is a weight, not a typo.
    const weightKg = parseDecimal(weightStr)
    if (weightKg === null || weightKg < 0.05 || weightKg > 30) {
      setError('Weight must be between 0.05 and 30 kg.')
      return
    }
    // Parse in local time — new Date('yyyy-MM-dd') would land on UTC midnight
    // and show the previous day in western timezones.
    const date = parse(dateStr, 'yyyy-MM-dd', new Date())
    if (!isValid(date)) {
      setError('Pick a valid date.')
      return
    }
    const trimmedNote = note.trim()
    const input: WeightInput = {
      date,
      weightKg,
      note: trimmedNote === '' ? null : trimmedNote,
    }

    setBusy(true)
    awaitOrQueued(addWeightEntry(hid, catId, uid, input))
      .then(() => {
        // Both 'confirmed' and 'queued' mean the entry is on its way.
        setWeightStr('')
        setNote('')
        setDateStr(todayStr())
        setSaved(true)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not save the weigh-in.')
      })
      .finally(() => {
        setBusy(false)
      })
  }

  return (
    // noValidate: the component's own validation shows styled messages —
    // matches LogMealForm/FoodForm instead of native browser bubbles.
    // Fields are stacked, never side by side: a native date picker has a wide
    // minimum width and blew out of a half-width column on a 393pt iPhone.
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="text-sm font-semibold">
        Weight (kg)
        <input
          {...DECIMAL_INPUT_PROPS}
          data-testid="weight-kg"
          required
          value={weightStr}
          placeholder="e.g. 2,4"
          onChange={(event) => {
            setWeightStr(event.target.value)
          }}
          className={FIELD_CLASS}
        />
      </label>
      <label className="text-sm font-semibold">
        Date
        <input
          type="date"
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
        Note (optional)
        <input
          type="text"
          maxLength={500}
          value={note}
          placeholder="e.g. after breakfast"
          onChange={(event) => {
            setNote(event.target.value)
          }}
          className={FIELD_CLASS}
        />
      </label>
      <button type="submit" data-testid="weight-save" disabled={busy} className="btn-primary">
        Save weigh-in
      </button>
      {saved ? <p className="text-sm font-semibold text-positive">Saved!</p> : null}
      {error === null ? null : (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </form>
  )
}
