import { format, isValid, parse, startOfDay } from 'date-fns'
import { useState, type SubmitEvent } from 'react'
import { roundGrams, roundKcal } from '../lib/catmath'
import { awaitOrQueued, savePlan, type Food, type Plan, type PlanItem } from '../lib/db'
import { DECIMAL_INPUT_PROPS, parseDecimal } from '../lib/numbers'
import {
  MAX_MEALS_PER_DAY,
  MIN_MEALS_PER_DAY,
  isMealTime,
  mealSpacingMinutes,
  mealTimes,
  perMealGrams,
  planDailyGrams,
  planDailyKcal,
  planTargetRatio,
  type PlanItemLike,
} from '../lib/plan'

const INPUT_CLASS = 'field'

const MAX_GRAMS_PER_DAY = 2000

interface DraftItem {
  key: string
  foodId: string
  grams: string
}

let nextKey = 0
function makeKey(): string {
  nextKey += 1
  return `item-${String(nextKey)}`
}

/** "6 h" / "5 h 40" — how far apart the derived meals land. */
function spacingLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${String(rest)} min`
  if (rest === 0) return `${String(hours)} h`
  return `${String(hours)} h ${String(rest)}`
}

/**
 * Author a feeding plan.
 *
 * Every meal is the same, so this asks three things — how many, between when
 * and when, and how much food a day — and derives the rest. Grams are entered
 * per DAY because that is what the tin prints; the serving is shown below.
 */
export function PlanForm({
  hid,
  catId,
  uid,
  foods,
  currentPlan,
  currentItems,
  latestWeightKg,
  targetKcal,
  onDone,
}: {
  hid: string
  catId: string
  uid: string
  foods: Food[]
  currentPlan: Plan | null
  currentItems: PlanItem[]
  latestWeightKg: number | null
  targetKcal: number | null
  onDone: () => void
}) {
  const [mealsPerDay, setMealsPerDay] = useState(() => currentPlan?.mealsPerDay ?? 3)
  const [firstMealAt, setFirstMealAt] = useState(() => currentPlan?.firstMealAt ?? '07:00')
  const [lastMealAt, setLastMealAt] = useState(() => currentPlan?.lastMealAt ?? '19:00')
  const [startsOn, setStartsOn] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [items, setItems] = useState<DraftItem[]>(() =>
    currentItems.length > 0
      ? currentItems.map((item) => ({
          key: makeKey(),
          foodId: item.foodId,
          grams: String(roundGrams(item.amountPerDayG)),
        }))
      : [{ key: makeKey(), foodId: foods[0]?.id ?? '', grams: '' }],
  )

  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const kcalPerGram = new Map(foods.map((food) => [food.id, food.kcalPerGram]))
  const times = mealTimes(mealsPerDay, firstMealAt, lastMealAt)
  const spacing = mealSpacingMinutes(mealsPerDay, firstMealAt, lastMealAt)

  // Only rows that are actually filled in count towards the running total, so
  // an empty row you have not typed into yet does not read as "0 kcal".
  const draftItems: PlanItemLike[] = items.flatMap((item) => {
    const grams = parseDecimal(item.grams)
    const food = foods.find((f) => f.id === item.foodId)
    if (grams === null || grams <= 0 || food === undefined) return []
    return [{ foodId: food.id, foodNameSnapshot: food.name, amountPerDayG: grams }]
  })

  const dailyGrams = planDailyGrams(draftItems)
  const dailyKcal = planDailyKcal(draftItems, kcalPerGram)
  const ratio = planTargetRatio(dailyKcal, targetKcal)

  function patchItem(key: string, patch: Partial<DraftItem>): void {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)))
  }

  async function submit(): Promise<void> {
    if (draftItems.length === 0) {
      setError('Add at least one food with an amount.')
      return
    }
    for (const item of draftItems) {
      if (item.amountPerDayG > MAX_GRAMS_PER_DAY) {
        setError(`Amounts must be under ${String(MAX_GRAMS_PER_DAY)} g a day.`)
        return
      }
    }
    const foodIds = new Set(draftItems.map((item) => item.foodId))
    if (foodIds.size !== draftItems.length) {
      setError('Each food can only appear once — combine the amounts instead.')
      return
    }
    if (!isMealTime(firstMealAt) || !isMealTime(lastMealAt) || times.length !== mealsPerDay) {
      setError('Pick a valid first and last meal time.')
      return
    }

    const start = parse(startsOn, 'yyyy-MM-dd', new Date())
    if (!isValid(start)) {
      setError('Pick a valid start date.')
      return
    }
    const effectiveFrom = startOfDay(start)

    setError(null)
    setSaving(true)
    try {
      await awaitOrQueued(
        savePlan(
          hid,
          catId,
          uid,
          {
            effectiveFrom,
            mealsPerDay,
            firstMealAt,
            lastMealAt,
            setAtWeightKg: latestWeightKg,
            note: null,
          },
          draftItems,
        ),
      )
      // 'confirmed' and 'queued' both count as success (offline-first).
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the plan.')
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
      className="flex flex-col gap-7"
    >
      <section className="flex flex-col gap-3">
        <h2 className="section-label">Meals a day</h2>
        <div className="flex gap-2">
          {Array.from({ length: MAX_MEALS_PER_DAY - MIN_MEALS_PER_DAY + 1 }, (_, index) => {
            const count = MIN_MEALS_PER_DAY + index
            const selected = count === mealsPerDay
            return (
              <button
                key={count}
                type="button"
                data-testid={`plan-meals-${String(count)}`}
                aria-pressed={selected}
                onClick={() => {
                  setMealsPerDay(count)
                }}
                className={`min-h-11 flex-1 rounded-full text-base font-semibold tabular-nums active:scale-[0.98] ${
                  selected ? 'bg-coral' : 'border border-sand-deep bg-surface'
                }`}
              >
                {count}
              </button>
            )
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="section-label">Spread between</h2>
        <div className="surface flex flex-col gap-3 p-4">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs font-normal text-ink-soft">
              First meal
              <input
                data-testid="plan-first-time"
                type="time"
                required
                value={firstMealAt}
                onChange={(e) => {
                  setFirstMealAt(e.target.value)
                }}
                className={INPUT_CLASS}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-normal text-ink-soft">
              Last meal
              <input
                data-testid="plan-last-time"
                type="time"
                required
                value={lastMealAt}
                onChange={(e) => {
                  setLastMealAt(e.target.value)
                }}
                className={INPUT_CLASS}
              />
            </label>
          </div>
          <p data-testid="plan-times" className="text-sm text-ink-soft tabular-nums">
            {times.length === 0
              ? 'Pick a valid window.'
              : spacing === null
                ? times.join(' · ')
                : `${spacingLabel(spacing)} apart — ${times.join(' · ')}`}
          </p>
        </div>
      </section>

      {/* Per DAY, because that is the figure printed on the tin — Hungarian
          labels give a grams-per-day table and no kcal at all. */}
      <section className="flex flex-col gap-3">
        <h2 className="section-label">Food per day</h2>
        <div className="surface flex flex-col gap-2 p-4">
          {items.map((item, index) => (
            <div key={item.key} className="flex items-center gap-2">
              <select
                data-testid={`plan-item-food-${String(index)}`}
                aria-label="Food"
                value={item.foodId}
                onChange={(e) => {
                  patchItem(item.key, { foodId: e.target.value })
                }}
                className={`${INPUT_CLASS} min-w-0 flex-1`}
              >
                <option value="">Pick a food</option>
                {foods.map((food) => (
                  <option key={food.id} value={food.id}>
                    {food.name}
                  </option>
                ))}
              </select>
              <input
                {...DECIMAL_INPUT_PROPS}
                data-testid={`plan-item-grams-${String(index)}`}
                aria-label="Grams a day"
                value={item.grams}
                placeholder="g"
                onChange={(e) => {
                  patchItem(item.key, { grams: e.target.value })
                }}
                className={`${INPUT_CLASS} w-20 shrink-0`}
              />
              {items.length > 1 ? (
                <button
                  type="button"
                  aria-label="Remove food"
                  data-testid={`plan-item-remove-${String(index)}`}
                  onClick={() => {
                    setItems((current) => current.filter((row) => row.key !== item.key))
                  }}
                  className="btn-icon"
                >
                  ×
                </button>
              ) : null}
            </div>
          ))}
          <button
            type="button"
            data-testid="plan-add-food"
            onClick={() => {
              setItems((current) => [...current, { key: makeKey(), foodId: '', grams: '' }])
            }}
            className="btn-chip self-start"
          >
            Add a food
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-1">
        <p className="flex items-baseline gap-2">
          <span
            data-testid="plan-daily-kcal"
            className="text-3xl font-bold tracking-tight tabular-nums"
          >
            {roundKcal(dailyKcal)}
          </span>
          <span className="text-base text-ink-soft tabular-nums">
            kcal a day · {roundGrams(dailyGrams)} g
          </span>
        </p>
        {ratio === null ? (
          <p className="text-sm text-ink-soft">Log a weigh-in to see this against a target.</p>
        ) : (
          <p
            data-testid="plan-target-ratio"
            className={`text-sm font-semibold tabular-nums ${ratio < 1 ? 'text-ink-soft' : 'text-positive'}`}
          >
            {Math.round(ratio * 100)}% of her {roundKcal(targetKcal ?? 0)} kcal target
          </p>
        )}
        {draftItems.length > 0 && mealsPerDay > 0 ? (
          <p data-testid="plan-per-meal" className="text-sm text-ink-soft tabular-nums">
            Each meal:{' '}
            {draftItems
              .map(
                (item) =>
                  `${String(roundGrams(perMealGrams(item.amountPerDayG, mealsPerDay)))} g ${item.foodNameSnapshot}`,
              )
              .join(' + ')}
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="section-label">Starts</h2>
        <div className="surface flex flex-col gap-2 p-4">
          <input
            data-testid="plan-starts"
            type="date"
            required
            value={startsOn}
            onChange={(e) => {
              setStartsOn(e.target.value)
            }}
            className={INPUT_CLASS}
          />
          <p className="text-xs text-ink-soft">
            The plan she was on until now moves into the history.
          </p>
        </div>
      </section>

      {error === null ? null : (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          data-testid="plan-save"
          disabled={saving}
          className="btn-primary flex-1"
        >
          Save plan
        </button>
        <button type="button" onClick={onDone} className="btn-secondary">
          Cancel
        </button>
      </div>

      <p className="text-xs text-ink-soft">Estimates only — always confirm with your vet.</p>
    </form>
  )
}
