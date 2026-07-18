import { lifeStageFromAge, mer, type LifeStage } from './catmath'
import { type Cat } from './schemas'

/** The stage used for calorie math: explicit setting wins, else derived from age. */
export function effectiveLifeStage(cat: Cat, now: Date): LifeStage {
  return cat.lifeStage ?? lifeStageFromAge(cat.birthDate, now, cat.neutered)
}

/**
 * Daily kcal target (MER) for the cat at its latest known weight.
 * Returns null until a first weigh-in exists — the UI should nudge for one.
 */
export function dailyKcalTarget(cat: Cat, latestWeightKg: number | null, now: Date): number | null {
  if (latestWeightKg === null || latestWeightKg <= 0) return null
  return mer({
    weightKg: latestWeightKg,
    lifeStage: effectiveLifeStage(cat, now),
    idealWeightKg: cat.idealWeightKg,
    merMultiplierOverride: cat.merMultiplierOverride,
  })
}

export function sumKcal(entries: readonly { kcal: number }[]): number {
  return entries.reduce((total, entry) => total + entry.kcal, 0)
}

export function sumGrams(entries: readonly { amountG: number }[]): number {
  return entries.reduce((total, entry) => total + entry.amountG, 0)
}
