import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { type DayRange } from './dates'
import {
  feedingsForDayQueryOptions,
  foodsQueryOptions,
  mealTimeOverridesForDayQueryOptions,
  planItemsQueryOptions,
  plansQueryOptions,
  useFeedingsForDayLive,
  useFoodsLive,
  useMealTimeOverridesForDayLive,
  usePlanItemsLive,
  usePlansLive,
  useWeightsLive,
  weightsQueryOptions,
  type Cat,
  type Feeding,
  type Food,
  type MealTimeOverride,
  type Plan,
  type PlanItem,
  type WeightEntry,
} from './db'
import { useHousehold } from './household'
import { adjustedMealTimes, planDailyKcal, planMealTimes, planTargetRatio } from './plan'
import { dailyKcalTarget, sumKcal } from './target'
import { useToday } from './use-today'

/** One cat's plan in force, measured against her target. */
export interface CatPlan {
  /** This render's clock, for anything age- or target-dependent. */
  now: Date

  weightsQuery: UseQueryResult<WeightEntry[]>
  foodsQuery: UseQueryResult<Food[]>
  plansQuery: UseQueryResult<Plan[]>
  planItemsQuery: UseQueryResult<PlanItem[]>

  latestWeightKg: number | null
  /** The daily kcal target (MER), null until she has a weight. */
  target: number | null

  /** The household's whole catalog, archived included. */
  foods: Food[]
  activeFoods: Food[]
  kcalPerGram: ReadonlyMap<string, number>

  /** Newest first: [0] is the plan in force, everything after it history. */
  plans: Plan[]
  plan: Plan | null
  planItems: PlanItem[]
  /** The plan's own clock, before today's nudges. */
  times: string[]
  planDailyKcal: number
  /** Plan kcal as a share of the target; null without a target. */
  ratio: number | null
}

/** Everything one cat's day hangs on: her plan, its bowls, and what has gone down. */
export interface CatDay extends CatPlan {
  /** Today, as `useToday` has it — moves at midnight. */
  day: DayRange
  feedingsQuery: UseQueryResult<Feeding[]>
  feedings: Feeding[]
  /** Feedings that tick off a bowl of THIS plan, by meal index. */
  givenByMeal: ReadonlyMap<number, Feeding[]>
  offPlan: Feeding[]
  givenCount: number
  eatenKcal: number
  overridesForDay: MealTimeOverride[]
  /** When each bowl is due today — or, once ticked, when it happened. */
  adjustedTimes: Date[]
}

/**
 * Load one cat's plan: every revision, the current one's items, the
 * household's foods and her weights (for the target), all kept live.
 */
export function useCatPlan(cat: Cat): CatPlan {
  const { householdId } = useHousehold()
  const now = new Date()

  const weightsQuery = useQuery(weightsQueryOptions(householdId, cat.id))
  useWeightsLive(householdId, cat.id)
  const foodsQuery = useQuery(foodsQueryOptions(householdId))
  useFoodsLive(householdId)
  const plansQuery = useQuery(plansQueryOptions(householdId, cat.id))
  usePlansLive(householdId, cat.id)

  const plans = plansQuery.data ?? []
  // Plans come back newest first and are never edited, so [0] is the one in
  // force and everything after it is history.
  const plan = plans[0] ?? null
  const planItemsQuery = useQuery({
    ...planItemsQueryOptions(householdId, cat.id, plan?.id ?? '__none__'),
    enabled: plan !== null,
  })
  usePlanItemsLive(householdId, cat.id, plan?.id ?? null)

  const latestWeightKg = weightsQuery.data?.at(-1)?.weightKg ?? null
  const target = dailyKcalTarget(cat, latestWeightKg, now)
  const foods = foodsQuery.data ?? []
  const activeFoods = foods.filter((f) => !f.archived)
  const planItems = plan === null ? [] : (planItemsQuery.data ?? [])

  const kcalPerGram = new Map(foods.map((food) => [food.id, food.kcalPerGram]))
  const times = plan === null ? [] : planMealTimes(plan)
  const planDailyKcalValue = planDailyKcal(planItems, kcalPerGram)
  const ratio = planTargetRatio(planDailyKcalValue, target)

  return {
    now,
    weightsQuery,
    foodsQuery,
    plansQuery,
    planItemsQuery,
    latestWeightKg,
    target,
    foods,
    activeFoods,
    kcalPerGram,
    plans,
    plan,
    planItems,
    times,
    planDailyKcal: planDailyKcalValue,
    ratio,
  }
}

/**
 * Load one cat's day: her current plan and its items, the household's foods,
 * today's feedings and today's meal-time nudges, all kept live. Shared by
 * every screen that shows her bowls, so they agree on what counts as given.
 */
export function useCatDay(cat: Cat): CatDay {
  const { householdId } = useHousehold()
  const day = useToday()
  const catPlan = useCatPlan(cat)
  const { plan, times } = catPlan

  const feedingsQuery = useQuery(
    feedingsForDayQueryOptions(householdId, cat.id, day.start, day.end),
  )
  useFeedingsForDayLive(householdId, cat.id, day.start, day.end)
  const overridesQuery = useQuery(
    mealTimeOverridesForDayQueryOptions(householdId, cat.id, day.start, day.end),
  )
  useMealTimeOverridesForDayLive(householdId, cat.id, day.start, day.end)

  const feedings = feedingsQuery.data ?? []

  // A feeding belongs to a planned bowl only if it names THIS plan — a tick
  // left over from yesterday's plan must not mark today's bowl as given.
  const givenByMeal = new Map<number, Feeding[]>()
  const offPlan: Feeding[] = []
  for (const feeding of feedings) {
    if (plan !== null && feeding.planId === plan.id && feeding.mealIndex !== null) {
      const existing = givenByMeal.get(feeding.mealIndex) ?? []
      givenByMeal.set(feeding.mealIndex, [...existing, feeding])
    } else {
      offPlan.push(feeding)
    }
  }
  const givenCount = [...givenByMeal.keys()].filter((index) => index < times.length).length
  const eatenKcal = sumKcal(feedings)

  // A meal's own actual time, first-feeding-wins (a flavour switch's two
  // lines share one meal and were written with the same datetime) — this is
  // what pushes the rest of the day's not-yet-given bowls off the plan's
  // fixed clock and onto how the day has actually gone.
  const givenAtByMeal = new Map<number, Date>()
  for (const [mealIndex, entries] of givenByMeal) {
    const first = entries[0]
    if (first !== undefined) givenAtByMeal.set(mealIndex, first.datetime)
  }

  // Today's nudges to the plan's clock, keyed like the feedings above: an
  // override only counts for the plan it was written against, since a revision
  // re-times every bowl anyway and its meal 2 need not be the old meal 2.
  const overridesForDay = overridesQuery.data ?? []
  const overrideByMeal = new Map<number, MealTimeOverride>()
  for (const override of overridesForDay) {
    if (override.planId !== plan?.id) continue
    const existing = overrideByMeal.get(override.mealIndex)
    // Two phones nudging the same bowl at once leaves two docs; newest wins.
    if (existing === undefined || override.createdAt > existing.createdAt) {
      overrideByMeal.set(override.mealIndex, override)
    }
  }
  const movedAtByMeal = new Map(
    [...overrideByMeal].map(([mealIndex, override]) => [mealIndex, override.overrideAt]),
  )
  const adjustedTimes = adjustedMealTimes(times, day.start, givenAtByMeal, movedAtByMeal)

  return {
    ...catPlan,
    day,
    feedingsQuery,
    feedings,
    givenByMeal,
    offPlan,
    givenCount,
    eatenKcal,
    overridesForDay,
    adjustedTimes,
  }
}
