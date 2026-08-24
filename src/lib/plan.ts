import { differenceInCalendarDays, startOfDay } from 'date-fns'

// The feeding plan, as pure math. A cat eats the same thing every day, so the
// plan stores a COUNT and a WINDOW rather than a list of meals: three meals
// between 07:00 and 19:00 *is* 07:00 / 13:00 / 19:00, and deriving that beats
// storing (and re-typing) it. Grams are held per DAY because that is the figure
// printed on the tin — Hungarian labels give a grams-per-day table, not kcal —
// and the per-meal serving is the derived number.
//
// Firestore I/O lives in db.ts; nothing here touches it.

export const MIN_MEALS_PER_DAY = 1
export const MAX_MEALS_PER_DAY = 6

const MINUTES_PER_DAY = 24 * 60
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

/** A wall-clock "HH:mm" as stored on a plan. */
export function isMealTime(value: string): boolean {
  return TIME_PATTERN.test(value)
}

function toMinutes(hhmm: string): number {
  const [hours, minutes] = hhmm.split(':')
  return Number(hours) * 60 + Number(minutes)
}

function toHhmm(minutes: number): string {
  const wrapped = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  const hours = Math.floor(wrapped / 60)
  return `${String(hours).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`
}

/**
 * The meal times a plan implies, earliest first.
 *
 * One meal sits at `firstMealAt`; the rest are spaced evenly up to
 * `lastMealAt`. A window whose end is at or before its start is read as
 * running past midnight (22:00 -> 02:00), which is unusual but valid.
 * Returns [] for input that could never have come from the form, so a
 * malformed stored plan degrades to an empty checklist instead of throwing.
 */
export function mealTimes(mealsPerDay: number, firstMealAt: string, lastMealAt: string): string[] {
  if (!Number.isInteger(mealsPerDay) || mealsPerDay < MIN_MEALS_PER_DAY) return []
  if (mealsPerDay > MAX_MEALS_PER_DAY) return []
  if (!isMealTime(firstMealAt) || !isMealTime(lastMealAt)) return []

  if (mealsPerDay === 1) return [firstMealAt]

  const first = toMinutes(firstMealAt)
  const last = toMinutes(lastMealAt)
  const end = last <= first ? last + MINUTES_PER_DAY : last
  const step = (end - first) / (mealsPerDay - 1)

  return Array.from({ length: mealsPerDay }, (_, index) => toHhmm(Math.round(first + index * step)))
}

/** Gap between consecutive meals, in minutes; null when there is only one. */
export function mealSpacingMinutes(
  mealsPerDay: number,
  firstMealAt: string,
  lastMealAt: string,
): number | null {
  if (mealsPerDay < 2) return null
  const times = mealTimes(mealsPerDay, firstMealAt, lastMealAt)
  if (times.length < 2) return null

  const first = toMinutes(times[0] ?? '')
  const second = toMinutes(times[1] ?? '')
  return second <= first ? second + MINUTES_PER_DAY - first : second - first
}

/** Minimal shape of a stored plan item — the destination mix, per day. */
export interface PlanItemLike {
  foodId: string
  foodNameSnapshot: string
  amountPerDayG: number
}

/** Enough of a food to price a plan. Keyed by food id. */
export type KcalPerGramById = ReadonlyMap<string, number>

/** One serving of one food, unrounded. */
export function perMealGrams(amountPerDayG: number, mealsPerDay: number): number {
  if (mealsPerDay < 1) return 0
  return amountPerDayG / mealsPerDay
}

export function planDailyGrams(items: readonly PlanItemLike[]): number {
  return items.reduce((total, item) => total + item.amountPerDayG, 0)
}

/**
 * The plan's daily energy. Foods missing from the map contribute nothing —
 * an archived-then-deleted food should not silently inflate the total.
 */
export function planDailyKcal(
  items: readonly PlanItemLike[],
  kcalPerGram: KcalPerGramById,
): number {
  return items.reduce(
    (total, item) => total + item.amountPerDayG * (kcalPerGram.get(item.foodId) ?? 0),
    0,
  )
}

// ---------- transitions ----------

export const TRANSITION_UNITS = ['meal', 'day'] as const
export type TransitionUnit = (typeof TRANSITION_UNITS)[number]

/**
 * A one-way switch onto the plan's food. The plan states the DESTINATION; the
 * transition says where the cat is coming from and how fast. Every intermediate
 * ratio is derived, so a four-day ramp costs one declaration instead of four
 * hand-authored plans.
 *
 * This is a switch, not a rotation: it ends, and afterwards the plan is simply
 * what it always said it was.
 */
export interface PlanTransition {
  fromFoodId: string
  fromFoodNameSnapshot: string
  toFoodId: string
  steps: number
  unit: TransitionUnit
  startedOn: Date
}

export const MAX_TRANSITION_STEPS = 14

/**
 * Share of the NEW food at a given meal, from 0 (all old) to 1 (switch done).
 *
 * Steps are 1-based in effect: a 4-day switch runs 25% / 50% / 75% / 100%, so
 * the last step is the first day fully on the new food. Anything at or after
 * the end of the ramp is 1.
 */
export function transitionProgress(
  transition: PlanTransition,
  mealsPerDay: number,
  day: Date,
  mealIndex: number,
): number {
  if (transition.steps < 1) return 1

  const dayIndex = differenceInCalendarDays(startOfDay(day), startOfDay(transition.startedOn))
  if (dayIndex < 0) return 0

  const stepIndex =
    transition.unit === 'day' ? dayIndex : dayIndex * Math.max(1, mealsPerDay) + mealIndex

  return Math.min(1, (stepIndex + 1) / transition.steps)
}

/** True once every meal of `day` is fully on the new food. */
export function isTransitionComplete(
  transition: PlanTransition,
  mealsPerDay: number,
  day: Date,
): boolean {
  return transitionProgress(transition, mealsPerDay, day, 0) >= 1
}

/** One food in one bowl. */
export interface MealLine {
  foodId: string
  name: string
  grams: number
}

export interface PlanShape {
  mealsPerDay: number
  transition: PlanTransition | null
}

/**
 * What actually goes in the bowl at `mealIndex` on `day`.
 *
 * Normally one line per plan item. While a transition is running, the item it
 * targets splits into two lines — outgoing food first, since early in a ramp
 * that is the bulk of the bowl. Grams are left unrounded; the UI rounds for
 * display so the day's total never drifts by the sum of three roundings.
 */
export function mealComposition(
  plan: PlanShape,
  items: readonly PlanItemLike[],
  day: Date,
  mealIndex: number,
): MealLine[] {
  const { transition } = plan

  return items.flatMap((item) => {
    const serving = perMealGrams(item.amountPerDayG, plan.mealsPerDay)
    const target: MealLine = {
      foodId: item.foodId,
      name: item.foodNameSnapshot,
      grams: serving,
    }

    if (transition?.toFoodId !== item.foodId) return [target]

    const share = transitionProgress(transition, plan.mealsPerDay, day, mealIndex)
    if (share >= 1) return [target]

    return [
      {
        foodId: transition.fromFoodId,
        name: transition.fromFoodNameSnapshot,
        grams: serving * (1 - share),
      },
      { ...target, grams: serving * share },
    ]
  })
}

// ---------- plan vs. the cat ----------

/** Plan energy as a share of the daily target; null until a target exists. */
export function planTargetRatio(dailyKcal: number, targetKcal: number | null): number | null {
  if (targetKcal === null || targetKcal <= 0) return null
  return dailyKcal / targetKcal
}

/**
 * How far the plan may drift from the target before the UI says something.
 *
 * Servings round to 5 g, so a freshly-set plan already lands within ~2% of the
 * target; anything past 8% means the cat has actually moved, which for a kitten
 * is roughly ten days. Slack enough not to nag, tight enough that nobody
 * underfeeds a growing kitten for a fortnight without being told.
 */
export const OUTGROWN_TOLERANCE = 0.08

/**
 * True when the plan no longer matches what the cat needs — which for a kitten
 * happens every few weeks, on its own, without anyone editing anything.
 */
export function isOutgrown(dailyKcal: number, targetKcal: number | null): boolean {
  const ratio = planTargetRatio(dailyKcal, targetKcal)
  if (ratio === null) return false
  return Math.abs(ratio - 1) > OUTGROWN_TOLERANCE
}

/** Round to the nearest `step` grams — nobody spoons out 83.7 g. */
export function roundToStep(grams: number, step = 5): number {
  if (step <= 0) return grams
  return Math.round(grams / step) * step
}

/**
 * The same plan, scaled to hit `targetKcal`. Amounts are rounded to whole
 * servings so the suggestion reads like something you would actually do
 * ("100 g a meal"), not like a calculation.
 */
export function scaleItemsToTarget(
  items: readonly PlanItemLike[],
  kcalPerGram: KcalPerGramById,
  targetKcal: number,
  mealsPerDay: number,
): PlanItemLike[] | null {
  const dailyKcal = planDailyKcal(items, kcalPerGram)
  if (dailyKcal <= 0 || targetKcal <= 0) return null

  const scale = targetKcal / dailyKcal
  const meals = Math.max(1, mealsPerDay)

  return items.map((item) => {
    const perMeal = roundToStep(perMealGrams(item.amountPerDayG * scale, meals))
    return { ...item, amountPerDayG: perMeal * meals }
  })
}
