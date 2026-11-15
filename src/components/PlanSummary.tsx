import { roundGrams, roundKcal } from '../lib/catmath'
import { type Plan, type PlanItem } from '../lib/db'
import { isOutgrown, mealComposition } from '../lib/plan'

/**
 * A plan as it reads on paper: how many meals and when, one row per food
 * (a bowl's share and the day's), and its energy against her target. The
 * first rows of a `divide-y` surface — the caller owns the card, so it can
 * add rows of its own (a button, folds) underneath.
 */
export function PlanSummaryRows({
  plan,
  items,
  times,
  dailyKcal,
  targetKcal,
  ratio,
}: {
  plan: Plan
  items: PlanItem[]
  /** The plan's own clock (`planMealTimes`). */
  times: string[]
  dailyKcal: number
  targetKcal: number | null
  ratio: number | null
}) {
  const meals = times.length
  const first = times[0] ?? plan.firstMealAt
  const last = times.at(-1) ?? plan.lastMealAt

  return (
    <>
      <div className="flex flex-col gap-0.5 px-4 py-4">
        <p className="font-semibold tabular-nums">
          {meals} {meals === 1 ? 'meal' : 'meals'}
          {meals === 1 ? `, ${first}` : `, ${first} to ${last}`}
        </p>
        {meals > 1 ? (
          <p className="text-sm text-ink-soft tabular-nums">{times.join(' · ')}</p>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="px-4 py-4 text-sm text-ink-soft">
          This plan has no foods on it — change it to add one.
        </p>
      ) : (
        items.map((item) => (
          <div key={item.id} className="flex items-baseline gap-3 px-4 py-4">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="font-semibold break-words">{item.foodNameSnapshot}</p>
              <p className="text-sm text-ink-soft tabular-nums">
                {perMealLabel(plan, items, item, meals)} a meal
              </p>
            </div>
            <p className="shrink-0 font-semibold tabular-nums">
              {roundGrams(item.amountPerDayG)} g a day
            </p>
          </div>
        ))
      )}

      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <span className="text-sm text-ink-soft tabular-nums">
          {targetKcal === null
            ? `${String(roundKcal(dailyKcal))} kcal a day`
            : `${String(roundKcal(dailyKcal))} kcal of a ${String(roundKcal(targetKcal))} kcal target`}
        </span>
        {ratio === null ? null : (
          <span
            data-testid="plan-ratio"
            className={`shrink-0 text-sm font-semibold tabular-nums ${
              isOutgrown(dailyKcal, targetKcal) ? 'text-coral-ink' : 'text-positive'
            }`}
          >
            {Math.round(ratio * 100)}%
          </span>
        )}
      </div>
    </>
  )
}

/**
 * One food's grams per bowl. Evenly spread meals share the day equally; typed-in
 * times size each bowl by the gap before it, so those show the range.
 */
function perMealLabel(plan: Plan, items: PlanItem[], item: PlanItem, meals: number): string {
  const grams = Array.from({ length: Math.max(1, meals) }, (_, mealIndex) => {
    const line = mealComposition(plan, items, mealIndex).find((l) => l.foodId === item.foodId)
    return roundGrams(line?.grams ?? 0)
  })
  const low = Math.min(...grams)
  const high = Math.max(...grams)
  return low === high ? `${String(low)} g` : `${String(low)}–${String(high)} g`
}
