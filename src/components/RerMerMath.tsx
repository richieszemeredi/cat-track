import { LIFE_STAGE_LABELS, MER_MULTIPLIERS, mer, rer, roundKcal, roundKg } from '../lib/catmath'
import { type Cat } from '../lib/db'
import { effectiveLifeStage } from '../lib/target'

/** RER / MER explainer: how the daily target is worked out from her weight. */
export function RerMerMath({
  cat,
  latestWeightKg,
  now,
}: {
  cat: Cat
  latestWeightKg: number | null
  now: Date
}) {
  const stage = effectiveLifeStage(cat, now)
  const multiplier = cat.merMultiplierOverride ?? MER_MULTIPLIERS[stage]

  if (latestWeightKg === null) {
    return (
      <p className="text-sm text-ink-soft">
        Once you log a weight, the resting (RER) and daily (MER) calorie math shows up here.
      </p>
    )
  }

  const merValue = mer({
    weightKg: latestWeightKg,
    lifeStage: stage,
    idealWeightKg: cat.idealWeightKg,
    merMultiplierOverride: cat.merMultiplierOverride,
  })

  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm">
        <span className="font-semibold">RER</span> (resting) = 70 × kg
        <sup aria-hidden="true">0.75</sup> ≈{' '}
        <span className="font-semibold">{roundKcal(rer(latestWeightKg))} kcal/day</span> at{' '}
        {roundKg(latestWeightKg)} kg
      </p>
      <p className="text-sm">
        <span className="font-semibold">MER</span> (daily target) = {multiplier} × RER ≈{' '}
        <span className="font-semibold">{roundKcal(merValue)} kcal/day</span> —{' '}
        {LIFE_STAGE_LABELS[stage]}
      </p>
      {stage === 'weight_loss' && cat.idealWeightKg !== null ? (
        <p className="text-xs text-ink-soft">
          For weight loss the RER is based on the ideal weight ({roundKg(cat.idealWeightKg)} kg).
        </p>
      ) : null}
    </div>
  )
}
