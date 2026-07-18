import { useState, type SubmitEvent } from 'react'
import { roundKcal } from '../lib/catmath'
import { addFood, awaitOrQueued, updateFood, type Food } from '../lib/db'
import { type FoodType } from '../lib/schemas'

const INPUT_CLASS = 'rounded-xl border border-coral-soft bg-white px-3 py-2 font-normal'

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
  const [packageSize, setPackageSize] = useState(
    existing?.packageSizeG != null ? String(existing.packageSizeG) : '',
  )
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const kcalNum = Number(kcalPerGram)
  const kcalValid =
    kcalPerGram.trim() !== '' && Number.isFinite(kcalNum) && kcalNum >= 0.01 && kcalNum <= 10

  async function submit(): Promise<void> {
    const trimmedName = name.trim()
    if (trimmedName === '') {
      setError('Give the food a name.')
      return
    }
    if (!kcalValid) {
      setError('kcal per gram must be between 0.01 and 10.')
      return
    }
    let packageSizeG: number | null = null
    const packageText = packageSize.trim()
    if (packageText !== '') {
      const packageNum = Number(packageText)
      if (!Number.isFinite(packageNum) || packageNum <= 0) {
        setError('Package size must be a positive number of grams.')
        return
      }
      packageSizeG = packageNum
    }
    setError(null)
    setSaving(true)
    const trimmedBrand = brand.trim()
    const input = {
      name: trimmedName,
      brand: trimmedBrand === '' ? null : trimmedBrand,
      type,
      kcalPerGram: kcalNum,
      packageSizeG,
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
      className="flex flex-col gap-3 rounded-squishy bg-coral-soft/40 p-3"
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
          data-testid="food-kcal-per-gram"
          type="number"
          inputMode="decimal"
          step="0.01"
          min={0.01}
          max={10}
          value={kcalPerGram}
          onChange={(e) => {
            setKcalPerGram(e.target.value)
          }}
          className={INPUT_CLASS}
        />
        <span className="text-xs font-normal text-ink-soft">
          Tip: labels often state kcal per 100 g — divide by 100
        </span>
        {kcalValid ? (
          <span className="text-xs font-bold text-mint-deep">
            ≈ {String(roundKcal(kcalNum * 100))} kcal per 100 g
          </span>
        ) : null}
      </label>

      <label className="flex flex-col gap-1 text-sm font-semibold">
        Package size (g, optional)
        <input
          type="number"
          inputMode="decimal"
          min={1}
          step="1"
          value={packageSize}
          onChange={(e) => {
            setPackageSize(e.target.value)
          }}
          className={INPUT_CLASS}
        />
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
          className="flex-1 rounded-full bg-coral px-5 py-3 font-extrabold text-white active:scale-95 disabled:opacity-60"
        >
          {existing ? 'Save changes' : 'Add food'} <span aria-hidden="true">🍽️</span>
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-full bg-white px-5 py-3 font-bold text-ink-soft active:scale-95"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
