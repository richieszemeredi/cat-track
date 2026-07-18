import { useEffect, useRef, useState, type SubmitEvent } from 'react'
import { kcalForGrams, roundKcal } from '../lib/catmath'
import { addFeeding, awaitOrQueued, type Food } from '../lib/db'
import { type MealType } from '../lib/schemas'

const MEAL_TYPES: { value: MealType; label: string; emoji: string }[] = [
  { value: 'breakfast', label: 'Breakfast', emoji: '🌅' },
  { value: 'lunch', label: 'Lunch', emoji: '☀️' },
  { value: 'dinner', label: 'Dinner', emoji: '🌙' },
  { value: 'snack', label: 'Snack', emoji: '🍬' },
]

const INPUT_CLASS = 'rounded-xl border border-coral-soft bg-white px-3 py-2 font-normal'

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
  const [mealType, setMealType] = useState<MealType | null>(null)
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
  const gramsNum = Number(grams)
  const gramsValid =
    grams.trim() !== '' && Number.isFinite(gramsNum) && gramsNum >= 1 && gramsNum <= 500
  const previewKcal =
    gramsValid && selectedFood !== undefined
      ? roundKcal(kcalForGrams(gramsNum, selectedFood.kcalPerGram))
      : null

  async function submit(): Promise<void> {
    if (selectedFood === undefined) {
      setError('Pick a food first.')
      return
    }
    if (!gramsValid) {
      setError('Amount must be between 1 and 500 grams.')
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
          datetime: new Date(),
          foodId: selectedFood.id,
          foodNameSnapshot: selectedFood.name,
          amountG: gramsNum,
          kcal,
          mealType,
          note: trimmedNote === '' ? null : trimmedNote,
        }),
      )
      // 'confirmed' and 'queued' both count as success (offline-first).
      setGrams('')
      setNote('')
      setMealType(null)
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

      <div className="flex items-end gap-3">
        <label className="flex flex-1 flex-col gap-1 text-sm font-semibold">
          Amount (g)
          <input
            data-testid="meal-grams"
            type="number"
            inputMode="decimal"
            min={1}
            max={500}
            step="1"
            value={grams}
            onChange={(e) => {
              setGrams(e.target.value)
            }}
            className={INPUT_CLASS}
          />
        </label>
        <p data-testid="meal-kcal-preview" className="pb-2 text-sm font-bold text-ink-soft">
          {previewKcal === null ? '— kcal' : `≈ ${String(previewKcal)} kcal`}
        </p>
      </div>

      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-semibold">Meal (optional)</legend>
        <div className="flex flex-wrap gap-2">
          {MEAL_TYPES.map(({ value, label, emoji }) => (
            <button
              key={value}
              type="button"
              aria-pressed={mealType === value}
              onClick={() => {
                setMealType((prev) => (prev === value ? null : value))
              }}
              className={`rounded-full px-3 py-1.5 text-sm font-bold active:scale-95 ${
                mealType === value ? 'bg-coral text-white' : 'bg-coral-soft text-coral-deep'
              }`}
            >
              <span aria-hidden="true">{emoji}</span> {label}
            </button>
          ))}
        </div>
      </fieldset>

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

      <button
        type="submit"
        data-testid="meal-save"
        disabled={saving}
        className="rounded-full bg-coral px-5 py-3 font-extrabold text-white active:scale-95 disabled:opacity-60"
      >
        Log meal <span aria-hidden="true">🐾</span>
      </button>

      {justLogged ? (
        <p role="status" className="text-center text-sm font-bold text-mint-deep">
          Logged! <span aria-hidden="true">✨</span>
        </p>
      ) : null}
    </form>
  )
}
