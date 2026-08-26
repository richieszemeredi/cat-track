import { differenceInCalendarDays, differenceInDays, differenceInMonths } from 'date-fns'

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

// ---------- energy from a label that states no kcal ----------

export const FOOD_TYPES = ['dry', 'wet', 'treat'] as const
export type FoodType = (typeof FOOD_TYPES)[number]

/**
 * The analytical constituents printed on a European pet-food label
 * ("Analytical constituents" / "Analitikai összetevők"), as a percentage of
 * the food as fed.
 */
export interface FoodAnalysis {
  proteinPct: number
  fatPct: number
  ashPct: number
  fibrePct: number
  moisturePct: number
}

/**
 * Modified Atwater factors, kcal per gram. Lower than the human Atwater
 * factors because pet food is less digestible. This is the calculation FEDIAF
 * prescribes when a label declares no energy content — which is most of the
 * Hungarian market, where labels give constituents and a gram-per-day table
 * instead.
 */
const ATWATER_PROTEIN = 3.5
const ATWATER_FAT = 8.5
const ATWATER_NFE = 3.5

/**
 * Crude ash and crude fibre are the two constituents most often left off a
 * label even though the calculation needs them. These are ordinary values per
 * category, used when the label is silent: both carry the small NFE factor, so
 * a typical value costs far less accuracy than assuming zero would.
 */
export const TYPICAL_ASH_PCT: Record<FoodType, number> = { dry: 7, wet: 2.5, treat: 5 }
export const TYPICAL_FIBRE_PCT: Record<FoodType, number> = { dry: 2.5, wet: 0.5, treat: 1 }

/** What the five declared constituents add up to. Over 100 means a typo. */
export function analysisSumPct(a: FoodAnalysis): number {
  return a.proteinPct + a.fatPct + a.ashPct + a.fibrePct + a.moisturePct
}

/**
 * Carbohydrate, as nitrogen-free extract: whatever the declared constituents
 * leave over. Clamped at 0 — labels round each constituent up, so the five can
 * legitimately sum a shade past 100.
 */
export function nfePct(a: FoodAnalysis): number {
  return Math.max(0, 100 - analysisSumPct(a))
}

/**
 * Metabolisable energy in kcal/100 g. Typically within ~10% of a measured
 * value, erring low on high-meat foods whose real digestibility beats the
 * fixed factors.
 */
export function kcalPer100gFromAnalysis(a: FoodAnalysis): number {
  return a.proteinPct * ATWATER_PROTEIN + a.fatPct * ATWATER_FAT + nfePct(a) * ATWATER_NFE
}

export function kcalPerGramFromAnalysis(a: FoodAnalysis): number {
  return kcalPer100gFromAnalysis(a) / 100
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

// ---------- week-over-week change ----------

/**
 * The shortest span a weekly rate may be derived from. A weigh-in the next
 * morning says nothing about a week: dividing by one day and multiplying by
 * seven would scale kitchen-scale noise (±10 g on a kitten) up sevenfold and
 * report a thriving kitten as losing 70 g a week.
 */
export const MIN_TREND_SPAN_DAYS = 5

export interface WeightPoint {
  date: Date
  weightKg: number
}

export interface WeightTrend {
  /** Change per 7 days across the span, in kg — negative when losing. */
  kgPerWeek: number
  /** The weigh-in the rate is measured from. */
  from: Date
  /** Whole days between that weigh-in and the latest one. */
  spanDays: number
}

/**
 * Week-over-week change, measured between the latest weigh-in and an earlier
 * one — the figure that says whether a kitten is growing, rather than the raw
 * gap-dependent delta between the last two entries.
 *
 * The baseline is the entry whose span is CLOSEST to 7 days (ties going to the
 * longer span, which dilutes scale noise rather than amplifying it), not
 * simply the previous entry: weighing twice in one week should sharpen the
 * figure, never shorten the window it is derived from. Returns null while
 * every entry sits inside MIN_TREND_SPAN_DAYS of the latest — there is nothing
 * honest to say per week yet, and the caller shows the raw change instead.
 */
export function weeklyWeightTrend(entries: readonly WeightPoint[]): WeightTrend | null {
  let latest: WeightPoint | null = null
  for (const entry of entries) {
    if (latest === null || entry.date.getTime() >= latest.date.getTime()) latest = entry
  }
  if (latest === null) return null
  const anchor = latest

  // Calendar days, not elapsed hours: a weigh-in is a dated event, and the
  // hour it happened to be taken at must not move the divisor (nor may a DST
  // change turn a 7-day span into 6.96).
  let best: { entry: WeightPoint; spanDays: number } | null = null
  for (const entry of entries) {
    if (entry === anchor) continue
    const spanDays = differenceInCalendarDays(anchor.date, entry.date)
    if (spanDays < MIN_TREND_SPAN_DAYS) continue
    const closer = best === null || Math.abs(spanDays - 7) < Math.abs(best.spanDays - 7)
    const tieOnTheLongerSpan =
      best !== null &&
      Math.abs(spanDays - 7) === Math.abs(best.spanDays - 7) &&
      spanDays > best.spanDays
    if (closer || tieOnTheLongerSpan) best = { entry, spanDays }
  }
  if (best === null) return null

  return {
    kgPerWeek: ((anchor.weightKg - best.entry.weightKg) / best.spanDays) * 7,
    from: best.entry.date,
    spanDays: best.spanDays,
  }
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

// Under 1 kg, "0.09 kg" reads worse than "90 g" — a newborn kitten's weight
// and the week-to-week gain of an older one both live in that range.
// Math.abs so a negative delta (a kitten that lost weight) still switches
// unit at the same 1 kg threshold instead of only when it grows.
export function formatWeightKg(kg: number): string {
  return Math.abs(kg) < 1 ? `${String(roundGrams(kg * 1000))} g` : `${roundKg(kg).toFixed(2)} kg`
}
