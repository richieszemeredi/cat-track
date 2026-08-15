import { useState, type SubmitEvent } from 'react'
import { roundKcal } from '../lib/catmath'
import { addFood, awaitOrQueued, updateFood, type Food } from '../lib/db'
import { DECIMAL_INPUT_PROPS, parseDecimal } from '../lib/numbers'
import { type FoodType } from '../lib/schemas'

const INPUT_CLASS = 'field'

export function FoodForm({
  hid,
  catId,
  uid,
  existing,
  onDone,
}: {
  hid: string
  catId: string
  uid: string
  existing?: Food
  onDone: () => void
}) {
  const [name, setName] = useState(existing?.name ?? '')
  const [brand, setBrand] = useState(existing?.brand ?? '')
  const [type, setType] = useState<FoodType>(existing?.type ?? 'dry')
  const [kcalPerGram, setKcalPerGram] = useState(existing ? String(existing.kcalPerGram) : '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const kcalNum = parseDecimal(kcalPerGram)
  const kcalValid = kcalNum !== null && kcalNum >= 0.01 && kcalNum <= 10

  async function submit(): Promise<void> {
    const trimmedName = name.trim()
    if (trimmedName === '') {
      setError('Give the food a name.')
      return
    }
    if (kcalNum === null || !kcalValid) {
      setError('kcal per gram must be between 0.01 and 10.')
      return
    }
    setError(null)
    setSaving(true)
    const trimmedBrand = brand.trim()
    const input = {
      name: trimmedName,
      brand: trimmedBrand === '' ? null : trimmedBrand,
      type,
      kcalPerGram: kcalNum,
    }
    try {
      // 'confirmed' and 'queued' both count as success (offline-first).
      await awaitOrQueued(
        existing ? updateFood(hid, catId, existing.id, input) : addFood(hid, catId, uid, input),
      )
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the food — please try again.')
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
      className="flex flex-col gap-3 rounded-xl border border-sand bg-cream p-3"
    >
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Name
        <input
          data-testid="food-name"
          type="text"
          maxLength={80}
          value={name}
          onChange={(e) => {
            setName(e.target.value)
          }}
          className={INPUT_CLASS}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-semibold">
        Brand (optional)
        <input
          type="text"
          maxLength={80}
          value={brand}
          onChange={(e) => {
            setBrand(e.target.value)
          }}
          className={INPUT_CLASS}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-semibold">
        Type
        <select
          data-testid="food-type"
          value={type}
          onChange={(e) => {
            const v = e.target.value
            if (v === 'dry' || v === 'wet' || v === 'treat') setType(v)
          }}
          className={INPUT_CLASS}
        >
          <option value="dry">Dry</option>
          <option value="wet">Wet</option>
          <option value="treat">Treat</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm font-semibold">
        kcal per gram
        <input
          {...DECIMAL_INPUT_PROPS}
          data-testid="food-kcal-per-gram"
          value={kcalPerGram}
          placeholder="e.g. 3,5"
          onChange={(e) => {
            setKcalPerGram(e.target.value)
          }}
          className={INPUT_CLASS}
        />
        <span className="text-xs font-normal text-ink-soft">
          Tip: labels often state kcal per 100 g — divide by 100
        </span>
        {kcalValid ? (
          <span className="text-xs font-semibold text-positive">
            ≈ {String(roundKcal(kcalNum * 100))} kcal per 100 g
          </span>
        ) : null}
      </label>

      {error === null ? null : (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          data-testid="food-save"
          disabled={saving}
          className="btn-primary flex-1"
        >
          {existing ? 'Save changes' : 'Add food'}
        </button>
        <button type="button" onClick={onDone} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  )
}
