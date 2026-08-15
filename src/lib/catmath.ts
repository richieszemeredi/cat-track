import { differenceInDays, differenceInMonths } from 'date-fns'

// Pure calorie / growth math. Everything here mirrors common veterinary
// guidance but is an ESTIMATE — the UI must keep the "consult your vet"
// disclaimer near anything derived from these numbers.

export const LIFE_STAGES = [
  'kitten_0_4',
  'kitten_4_12',
  'adult_intact',
  'adult_neutered',
  'weight_loss',
  'senior',
] as const

export type LifeStage = (typeof LIFE_STAGES)[number]

export const LIFE_STAGE_LABELS: Record<LifeStage, string> = {
  kitten_0_4: 'Kitten (0–4 months)',
  kitten_4_12: 'Kitten (4–12 months)',
  adult_intact: 'Adult (intact)',
  adult_neutered: 'Adult (neutered)',
  weight_loss: 'Weight loss',
  senior: 'Senior',
}

// MER = RER x multiplier, per life stage.
export const MER_MULTIPLIERS: Record<LifeStage, number> = {
  kitten_0_4: 2.5,
  kitten_4_12: 2.0,
  adult_intact: 1.4,
  adult_neutered: 1.2,
  weight_loss: 0.8,
  senior: 1.2,
}

/** Resting Energy Requirement in kcal/day: 70 x kg^0.75. */
export function rer(weightKg: number): number {
  if (weightKg <= 0) throw new RangeError('weightKg must be > 0')
  return 70 * Math.pow(weightKg, 0.75)
}

export interface MerInput {
  weightKg: number
  lifeStage: LifeStage
  /** Required for 'weight_loss' — its RER is computed on the IDEAL weight. */
  idealWeightKg?: number | null
  /** Vet-prescribed multiplier; wins over the life-stage default. */
  merMultiplierOverride?: number | null
}

/** Maintenance Energy Requirement in kcal/day. */
export function mer(input: MerInput): number {
  const multiplier = input.merMultiplierOverride ?? MER_MULTIPLIERS[input.lifeStage]
  const basisKg =
    input.lifeStage === 'weight_loss' && input.idealWeightKg != null && input.idealWeightKg > 0
      ? input.idealWeightKg
      : input.weightKg
  return rer(basisKg) * multiplier
}

export function kcalForGrams(grams: number, kcalPerGram: number): number {
  if (grams < 0 || kcalPerGram < 0) throw new RangeError('grams and kcalPerGram must be >= 0')
  return grams * kcalPerGram
}

export function gramsForKcal(kcal: number, kcalPerGram: number): number {
  if (kcalPerGram <= 0) throw new RangeError('kcalPerGram must be > 0')
  if (kcal < 0) throw new RangeError('kcal must be >= 0')
  return kcal / kcalPerGram
}

/**
 * Full months ELAPSED since birth (not calendar-month index difference —
 * that would count a Sep 25 kitten as 4 months old on Jan 2 and flip the
 * MER multiplier weeks early).
 */
export function ageInMonths(birthDate: Date, now: Date): number {
  return Math.max(0, differenceInMonths(now, birthDate))
}

/**
 * Weeks are the unit that matters for a kitten — growth, vaccination and
 * feeding advice are all quoted in weeks well past the point where "3 mo"
 * stops distinguishing anything. Stay in weeks until 6 months (26 weeks),
 * then switch to months and years.
 */
export const WEEKS_LABEL_CUTOFF = 26

/** Whole weeks elapsed since birth. */
export function ageInWeeks(birthDate: Date, now: Date): number {
  return Math.floor(Math.max(0, differenceInDays(now, birthDate)) / 7)
}

/** "3 wk", "8 mo", "1 yr 2 mo" — friendly age for the dashboard. */
export function ageLabel(birthDate: Date, now: Date): string {
  const weeks = ageInWeeks(birthDate, now)
  if (weeks < WEEKS_LABEL_CUTOFF) return `${String(weeks)} wk`
  const months = ageInMonths(birthDate, now)
  if (months < 12) return `${String(months)} mo`
  const years = Math.floor(months / 12)
  const rest = months % 12
  return rest === 0 ? `${String(years)} yr` : `${String(years)} yr ${String(rest)} mo`
}

/** "3 weeks old", "8 months old", "1 year 2 months old" — for page subtitles. */
export function ageLabelLong(birthDate: Date, now: Date): string {
  const plural = (n: number, unit: string) => `${String(n)} ${unit}${n === 1 ? '' : 's'}`
  const weeks = ageInWeeks(birthDate, now)
  if (weeks < WEEKS_LABEL_CUTOFF) return `${plural(weeks, 'week')} old`
  const months = ageInMonths(birthDate, now)
  if (months < 12) return `${plural(months, 'month')} old`
  const years = Math.floor(months / 12)
  const rest = months % 12
  return rest === 0
    ? `${plural(years, 'year')} old`
    : `${plural(years, 'year')} ${plural(rest, 'month')} old`
}

/** Life stage derived from age + neuter status (weight_loss/senior are manual). */
export function lifeStageFromAge(birthDate: Date, now: Date, neutered: boolean): LifeStage {
  const months = ageInMonths(birthDate, now)
  if (months < 4) return 'kitten_0_4'
  if (months < 12) return 'kitten_4_12'
  return neutered ? 'adult_neutered' : 'adult_intact'
}

export const DEFAULT_ADULT_WEIGHT_KG = 4.0
const BIRTH_WEIGHT_KG = 0.12

export interface GrowthBand {
  lowKg: number
  expectedKg: number
  highKg: number
}

/**
 * Expected kitten growth curve, as a band (±20%) around a simple model:
 * ~100 g/week from birth, ~75% of adult weight at 6 months, plateau at
 * 12 months. `adultWeightKg` defaults to a generic 4 kg cat; pass the
 * cat's idealWeightKg when known.
 */
export function growthBand(ageMonths: number, adultWeightKg?: number | null): GrowthBand {
  const adult = adultWeightKg != null && adultWeightKg > 0 ? adultWeightKg : DEFAULT_ADULT_WEIGHT_KG
  const sixMonthKg = 0.75 * adult
  let expected: number
  if (ageMonths <= 0) {
    expected = BIRTH_WEIGHT_KG
  } else if (ageMonths <= 6) {
    expected = BIRTH_WEIGHT_KG + (sixMonthKg - BIRTH_WEIGHT_KG) * (ageMonths / 6)
  } else if (ageMonths <= 12) {
    expected = sixMonthKg + (adult - sixMonthKg) * ((ageMonths - 6) / 6)
  } else {
    expected = adult
  }
  return { lowKg: expected * 0.8, expectedKg: expected, highKg: expected * 1.2 }
}

/** Round for display: kcal to whole numbers, grams to whole numbers, kg to 2 dp. */
export function roundKcal(kcal: number): number {
  return Math.round(kcal)
}

export function roundGrams(grams: number): number {
  return Math.round(grams)
}

export function roundKg(kg: number): number {
  return Math.round(kg * 100) / 100
}
