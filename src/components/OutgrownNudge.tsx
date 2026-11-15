import { roundGrams, roundKcal, roundKg } from '../lib/catmath'
import { type Plan, type PlanItem } from '../lib/db'
import { scaleItemsToTarget } from '../lib/plan'

/**
 * A kitten outgrows a plan on her own, without anyone editing anything — this
 * is the only thing the app knows that you don't. Shown while the plan in
 * force has drifted past `isOutgrown`'s tolerance from her target.
 */
export function OutgrownNudge({
  plan,
  items,
  kcalPerGram,
  dailyKcal,
  targetKcal,
  latestWeightKg,
  canEdit,
  onBump,
}: {
  plan: Plan
  items: PlanItem[]
  kcalPerGram: ReadonlyMap<string, number>
  dailyKcal: number
  targetKcal: number
  latestWeightKg: number | null
  canEdit: boolean
  onBump: () => void
}) {
  if (items.length === 0) return null

  const suggested = scaleItemsToTarget(items, kcalPerGram, targetKcal, plan.mealsPerDay)
  const share = Math.round((dailyKcal / targetKcal) * 100)

  return (
    <section
      data-testid="plan-outgrown"
      className="mx-4 flex flex-col gap-3 rounded-squishy bg-coral-soft p-4"
    >
      <h2 className="section-label text-coral-ink">
        {share < 100 ? "She's outgrown this plan" : 'This plan is over her target'}
      </h2>
      <p className="text-base">
        {plan.setAtWeightKg === null || latestWeightKg === null
          ? `This plan covers about ${String(share)}% of what she needs now.`
          : `She was ${String(roundKg(plan.setAtWeightKg))} kg when you set this plan and she's ${String(roundKg(latestWeightKg))} kg now. ${String(roundKcal(dailyKcal))} kcal a day covers about ${String(share)}% of what she needs.`}
      </p>
      {suggested === null ? null : (
        <p className="text-sm text-ink-soft tabular-nums">
          {suggested
            .map((item) => `${String(roundGrams(item.amountPerDayG))} g ${item.foodNameSnapshot}`)
            .join(' + ')}{' '}
          a day would put her back on target at {roundKcal(targetKcal)} kcal.
        </p>
      )}
      {canEdit ? (
        <button type="button" onClick={onBump} className="btn-primary self-start">
          Adjust the plan
        </button>
      ) : null}
    </section>
  )
}
