import { format, isValid, parse } from 'date-fns'
import { useEffect, useState, type SubmitEvent } from 'react'
import { addWeightEntry, awaitOrQueued, type WeightInput } from '../lib/db'

const BCS_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9]

function todayStr(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

/** Add-a-weigh-in form. Offline-friendly: 'queued' counts as success. */
export function WeighForm({ hid, catId, uid }: { hid: string; catId: string; uid: string }) {
  const [weightStr, setWeightStr] = useState('')
  const [dateStr, setDateStr] = useState(todayStr)
  const [bcsStr, setBcsStr] = useState('')
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

    const weightKg = Number(weightStr)
    if (weightStr.trim() === '' || !Number.isFinite(weightKg) || weightKg < 0.05 || weightKg > 30) {
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
    const bcs = bcsStr === '' ? null : Number(bcsStr)
    const trimmedNote = note.trim()
    const input: WeightInput = {
      date,
      weightKg,
      bodyConditionScore: bcs,
      note: trimmedNote === '' ? null : trimmedNote,
    }

    setBusy(true)
    awaitOrQueued(addWeightEntry(hid, catId, uid, input))
      .then(() => {
        // Both 'confirmed' and 'queued' mean the entry is on its way.
        setWeightStr('')
        setBcsStr('')
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
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm font-semibold">
          Weight (kg)
          <input
            data-testid="weight-kg"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.05"
            max="30"
            required
            value={weightStr}
            onChange={(event) => {
              setWeightStr(event.target.value)
            }}
            className="mt-1 w-full rounded-xl border border-coral-soft bg-white px-3 py-2 text-base"
          />
        </label>
        <label className="text-sm font-semibold">
          Date
          <input
            type="date"
            required
            value={dateStr}
            onChange={(event) => {
              setDateStr(event.target.value)
            }}
            className="mt-1 w-full rounded-xl border border-coral-soft bg-white px-3 py-2 text-base"
          />
        </label>
      </div>
      <label className="text-sm font-semibold">
        Body condition score (optional)
        <select
          value={bcsStr}
          onChange={(event) => {
            setBcsStr(event.target.value)
          }}
          className="mt-1 w-full rounded-xl border border-coral-soft bg-white px-3 py-2 text-base"
        >
          <option value="">—</option>
          {BCS_VALUES.map((n) => (
            <option key={n} value={String(n)}>
              {n}/9
            </option>
          ))}
        </select>
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
          className="mt-1 w-full rounded-xl border border-coral-soft bg-white px-3 py-2 text-base"
        />
      </label>
      <button
        type="submit"
        data-testid="weight-save"
        disabled={busy}
        className="rounded-full bg-coral px-6 py-3 font-extrabold text-ink active:scale-95 disabled:opacity-60"
      >
        Save weigh-in
      </button>
      {saved ? (
        <p className="text-sm font-semibold text-mint-deep">
          Saved! <span aria-hidden="true">✨</span>
        </p>
      ) : null}
      {error === null ? null : (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </form>
  )
}
