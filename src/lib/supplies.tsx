import { useQueries, useQuery } from '@tanstack/react-query'
import { startOfDay } from 'date-fns'
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import {
  feedingsSinceQueryOptions,
  foodsQueryOptions,
  foodStockQueryOptions,
  litterBoxesQueryOptions,
  littersQueryOptions,
  litterStockQueryOptions,
  planItemsQueryOptions,
  plansQueryOptions,
  useFeedingsSinceLive,
  useFoodsLive,
  useFoodStocksLive,
  useLitterBoxesLive,
  useLittersLive,
  useLitterStockLive,
  usePlanItemsLiveForPlans,
  usePlansLiveForCats,
  type Feeding,
  type Food,
  type FoodStockEvent,
  type LitterBox,
  type LitterKind,
  type LitterStockEvent,
  type PlanItem,
} from './db'
import { useHousehold } from './household'
import {
  foodStockSince,
  foodStockState,
  litterBoxesOfKind,
  litterEventsOfKind,
  litterStockState,
  type FoodStockState,
  type LitterStockState,
} from './stock'
import { anySupplyLow, supplyAlerts, type SupplyAlert } from './supply-alerts'
import { useToday } from './use-today'

export type { SupplyAlert }

// The household's supplies, loaded once for the whole app: Home's "Needs
// attention", the Supplies screen and the tab bar's dot all read the same
// figures, so they can never disagree. All Firestore access stays in db.ts.

export interface FoodSupply {
  food: Food
  /** This food's stock log, oldest first. */
  events: FoodStockEvent[]
  state: FoodStockState
}

export interface LitterKindSupply {
  litter: LitterKind
  /** This kind's stock log, oldest first. */
  events: LitterStockEvent[]
  /** The boxes that take this kind. */
  boxes: LitterBox[]
  state: LitterStockState
}

export interface SuppliesState {
  /** Every household food, archived included, by name. */
  foods: Food[]
  /** The foods not archived, by name. */
  activeFoods: Food[]
  /** Stock per ACTIVE food, by food id (archived foods aren't tracked). */
  foodSupplies: ReadonlyMap<string, FoodSupply>
  /** Every litter kind, archived included, by name. */
  litterKinds: LitterKind[]
  /** The litter kinds not archived, by name. */
  activeLitterKinds: LitterKind[]
  /** Stock per ACTIVE litter kind, by name (archived kinds aren't tracked). */
  litters: LitterKindSupply[]
  /** Every litter box, oldest first, whatever kind it takes. */
  boxes: LitterBox[]
  /** Food low, then each litter kind low, then overdue boxes. */
  alerts: SupplyAlert[]
  /** Any food or litter low — the Supplies tab's dot. Overdue boxes don't count. */
  anyLow: boolean
  /** True until foods, litters, stock logs, boxes, plans and feedings have all loaded once. */
  loading: boolean
  /** Any of those reads failed. */
  isError: boolean
}

const SuppliesContext = createContext<SuppliesState | null>(null)

const EMPTY_FOODS: Food[] = []
const EMPTY_LITTERS: LitterKind[] = []
const EMPTY_FOOD_EVENTS: FoodStockEvent[] = []
const EMPTY_LITTER_EVENTS: LitterStockEvent[] = []
const EMPTY_BOXES: LitterBox[] = []

export function SuppliesProvider({ children }: { children: ReactNode }) {
  const { householdId: hid, cats } = useHousehold()
  const { start: today } = useToday()
  const catIds = useMemo(() => cats.map((c) => c.id), [cats])

  // ---- foods + their stock logs ----
  const foodsQuery = useQuery(foodsQueryOptions(hid))
  useFoodsLive(hid)
  const foods = foodsQuery.data ?? EMPTY_FOODS
  const activeFoods = useMemo(() => foods.filter((f) => !f.archived), [foods])
  const activeFoodIds = useMemo(() => activeFoods.map((f) => f.id), [activeFoods])

  const stockQueries = useQueries({
    queries: activeFoodIds.map((id) => foodStockQueryOptions(hid, id)),
  })
  useFoodStocksLive(hid, activeFoodIds)

  // ---- litter: the kinds, one shared stock log, the boxes ----
  const littersQuery = useQuery(littersQueryOptions(hid))
  useLittersLive(hid)
  const litterKinds = littersQuery.data ?? EMPTY_LITTERS
  const activeLitterKinds = useMemo(() => litterKinds.filter((l) => !l.archived), [litterKinds])
  const litterStockQuery = useQuery(litterStockQueryOptions(hid))
  useLitterStockLive(hid)
  const boxesQuery = useQuery(litterBoxesQueryOptions(hid))
  useLitterBoxesLive(hid)

  // ---- every cat's current plan + its items ----
  const plansQueries = useQueries({
    queries: catIds.map((catId) => plansQueryOptions(hid, catId)),
  })
  usePlansLiveForCats(hid, catIds)
  const currentPlans = catIds.flatMap((catId, i) => {
    const plan = plansQueries[i]?.data?.[0]
    return plan === undefined ? [] : [{ catId, planId: plan.id }]
  })
  const itemQueries = useQueries({
    queries: currentPlans.map(({ catId, planId }) => planItemsQueryOptions(hid, catId, planId)),
  })
  // Keyed on the ids, so a new array each render doesn't resubscribe.
  usePlanItemsLiveForPlans(hid, currentPlans)

  // ---- feedings since the earliest food anchor, start of that day ----
  const eventsByFood = new Map<string, FoodStockEvent[]>()
  activeFoodIds.forEach((id, i) => {
    eventsByFood.set(id, stockQueries[i]?.data ?? EMPTY_FOOD_EVENTS)
  })
  let earliest: number | null = null
  for (const events of eventsByFood.values()) {
    const since = foodStockSince(events)
    if (since !== null && (earliest === null || since.getTime() < earliest)) {
      earliest = since.getTime()
    }
  }
  // Floored to the day, so the query key only moves when the anchor's day does.
  const since = earliest === null ? null : startOfDay(new Date(earliest))
  const feedingQueries = useQueries({
    queries: catIds.map((catId) => ({
      ...feedingsSinceQueryOptions(hid, catId, since ?? new Date(0)),
      enabled: since !== null,
    })),
  })
  useFeedingsSinceLive(hid, catIds, since)

  // ---- derive ----
  const planItems: PlanItem[] = itemQueries.flatMap((q) => q.data ?? [])
  const feedings: Feeding[] = since === null ? [] : feedingQueries.flatMap((q) => q.data ?? [])
  const litterEvents = litterStockQuery.data ?? EMPTY_LITTER_EVENTS
  const boxes = boxesQuery.data ?? EMPTY_BOXES

  const foodSupplies = new Map<string, FoodSupply>()
  for (const food of activeFoods) {
    const events = eventsByFood.get(food.id) ?? EMPTY_FOOD_EVENTS
    foodSupplies.set(food.id, {
      food,
      events,
      state: foodStockState({ food, events, feedings, planItems, today }),
    })
  }

  // Events naming a kind that doesn't exist (or is archived) count for nothing.
  const litters: LitterKindSupply[] = activeLitterKinds.map((litter) => {
    const events = litterEventsOfKind(litterEvents, litter.id)
    const kindBoxes = litterBoxesOfKind(boxes, litter.id)
    return {
      litter,
      events,
      boxes: kindBoxes,
      state: litterStockState({ events, boxes: kindBoxes, today }),
    }
  })

  const alerts = supplyAlerts({ foods: foodSupplies.values(), litters, boxes, today })

  const all = [
    foodsQuery,
    littersQuery,
    litterStockQuery,
    boxesQuery,
    ...stockQueries,
    ...plansQueries,
    ...itemQueries,
    ...(since === null ? [] : feedingQueries),
  ]

  const value: SuppliesState = {
    foods,
    activeFoods,
    foodSupplies,
    litterKinds,
    activeLitterKinds,
    litters,
    boxes,
    alerts,
    anyLow: anySupplyLow(alerts),
    loading: all.some((q) => q.isLoading),
    isError: all.some((q) => q.isError),
  }

  return <SuppliesContext.Provider value={value}>{children}</SuppliesContext.Provider>
}

export function useSupplies(): SuppliesState {
  const ctx = useContext(SuppliesContext)
  if (ctx === null) throw new Error('useSupplies must be used inside <SuppliesProvider>')
  return ctx
}
