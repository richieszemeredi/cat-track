import { format, isValid, parse } from 'date-fns'
import { useEffect, useRef, useState, type SubmitEvent } from 'react'
import { kcalForGrams, roundKcal } from '../lib/catmath'
import { addFeeding, awaitOrQueued, type Food } from '../lib/db'
import { DECIMAL_INPUT_PROPS, parseDecimal } from '../lib/numbers'

const INPUT_CLASS = 'field'

function nowTimeStr(): string {
  return format(new Date(), 'HH:mm')
}

export function LogMealForm({
  hid,
  catId,
  uid,
  foods,
}: {
  hid: string
  catId: string
  uid: string
  foods: Food[]
}) {
  const [foodId, setFoodId] = useState(() => foods[0]?.id ?? '')
  const [grams, setGrams] = useState('')
  // Defaults to the current time and is editable — the list shows times, so
  // "I fed her at 7 but I'm logging it now" has to be expressible.
  const [timeStr, setTimeStr] = useState(nowTimeStr)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [justLogged, setJustLogged] = useState(false)
  const loggedTimerId = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear the "Logged!" timer on unmount so it never sets state on a dead tree.
  useEffect(
    () => () => {
      if (loggedTimerId.current !== null) clearTimeout(loggedTimerId.current)
    },
    [],
  )

  const selectedFood = foods.find((f) => f.id === foodId) ?? foods[0]
  const gramsNum = parseDecimal(grams)
  const gramsValid = gramsNum !== null && gramsNum >= 1 && gramsNum <= 500
  const previewKcal =
    gramsValid && selectedFood !== undefined
      ? roundKcal(kcalForGrams(gramsNum, selectedFood.kcalPerGram))
      : null

  async function submit(): Promise<void> {
    if (selectedFood === undefined) {
      setError('Pick a food first.')
      return
    }
    if (gramsNum === null || !gramsValid) {
      setError('Amount must be between 1 and 500 grams.')
      return
    }
    const datetime = parse(timeStr, 'HH:mm', new Date())
    if (!isValid(datetime)) {
      setError('Pick a valid time.')
      return
    }
    const kcal = kcalForGrams(gramsNum, selectedFood.kcalPerGram)
    if (kcal > 2000) {
      setError('That is over 2000 kcal in one meal — double-check the amount.')
      return
    }
    setError(null)
    setSaving(true)
    try {
      const trimmedNote = note.trim()
      await awaitOrQueued(
        addFeeding(hid, catId, uid, {
          datetime,
          foodId: selectedFood.id,
          foodNameSnapshot: selectedFood.name,
          amountG: gramsNum,
          kcal,
          note: trimmedNote === '' ? null : trimmedNote,
        }),
      )
      // 'confirmed' and 'queued' both count as success (offline-first).
      setGrams('')
      setNote('')
      setTimeStr(nowTimeStr())
      setJustLogged(true)
      if (loggedTimerId.current !== null) clearTimeout(loggedTimerId.current)
      loggedTimerId.current = setTimeout(() => {
        setJustLogged(false)
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log the meal — please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      noValidate
      onSubmit={(e: SubmitEvent<HTMLFormElement>) => {
        e.preventDefault()
        void submit()
      }}
      className="flex flex-col gap-3"
    >
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Food
        <select
          data-testid="meal-food-select"
          value={selectedFood?.id ?? ''}
          onChange={(e) => {
            setFoodId(e.target.value)
          }}
          className={INPUT_CLASS}
        >
          {foods.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>

      {/* The preview sits under the field as helper text. Beside it, the
          amount input was the one control on the page at a different width. */}
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Amount (g)
        <input
          {...DECIMAL_INPUT_PROPS}
          data-testid="meal-grams"
          value={grams}
          placeholder="e.g. 40"
          onChange={(e) => {
            setGrams(e.target.value)
          }}
          className={INPUT_CLASS}
        />
        <span
          data-testid="meal-kcal-preview"
          className={`text-xs font-normal ${previewKcal === null ? 'text-ink-soft' : 'font-semibold text-positive'}`}
        >
          {previewKcal === null ? '— kcal' : `≈ ${String(previewKcal)} kcal`}
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm font-semibold">
        Time
        <input
          data-testid="meal-time"
          type="time"
          required
          value={timeStr}
          onChange={(e) => {
            setTimeStr(e.target.value)
          }}
          className={INPUT_CLASS}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-semibold">
        Note (optional)
        <input
          type="text"
          maxLength={500}
          value={note}
          onChange={(e) => {
            setNote(e.target.value)
          }}
          className={INPUT_CLASS}
        />
      </label>

      {error === null ? null : (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      <button type="submit" data-testid="meal-save" disabled={saving} className="btn-primary">
        Log meal
      </button>

      {justLogged ? (
        <p role="status" className="text-center text-sm font-semibold text-positive">
          Logged!
        </p>
      ) : null}
    </form>
  )
}
