import { addDays, differenceInCalendarDays, startOfDay } from 'date-fns'
import { type FoodType } from './catmath'

// Pure supplies maths: how many tins / bags are on the shelf, and when to
// order more. Nothing here is stored — the level is re-derived from an
// append-only log of "bought N" and "count N" events (plus what was eaten or
// swapped out since), so two phones only ever append and never clobber.

/**
 * Warn when a supply would run out within this many days — the owner's
 * delivery lead time. One threshold for food and litter alike.
 */
export const ORDER_LEAD_DAYS = 7

export const STOCK_UNITS = ['tin', 'pouch', 'bag'] as const
export type StockUnit = (typeof STOCK_UNITS)[number]

export const FOOD_STOCK_KINDS = ['bought', 'count'] as const
export type FoodStockKind = (typeof FOOD_STOCK_KINDS)[number]

export const LITTER_STOCK_KINDS = ['bought', 'count', 'swap'] as const
export type LitterStockKind = (typeof LITTER_STOCK_KINDS)[number]

// ---------- units ----------

/** What a food comes in when nobody said: wet is tinned, dry and treats bagged. */
export function defaultUnitForType(type: FoodType): StockUnit {
  return type === 'wet' ? 'tin' : 'bag'
}

/** The food's own unit, else the one its type implies. */
export function unitFor(food: { unit: StockUnit | null; type: FoodType }): StockUnit {
  return food.unit ?? defaultUnitForType(food.type)
}

const PLURALS: Record<StockUnit, string> = { tin: 'tins', pouch: 'pouches', bag: 'bags' }

/** "tin" for exactly one, "tins" for anything else (0 tins, 2 tins). */
export function unitNoun(unit: StockUnit, count: number): string {
  return count === 1 ? unit : PLURALS[unit]
}

/** "1 tin", "5 pouches", "0 bags". */
export function unitCountLabel(count: number, unit: StockUnit): string {
  return `${String(count)} ${unitNoun(unit, count)}`
}

/** "1 bag", "3 bags" — litter is always counted in bags. */
export function bagsLabel(count: number): string {
  return unitCountLabel(count, 'bag')
}

// ---------- the level ----------

interface LevelEvent {
  kind: LitterStockKind
  amount: number
  at: Date
  createdAt: Date
}

function compareEvents(a: LevelEvent, b: LevelEvent): number {
  return a.at.getTime() - b.at.getTime() || a.createdAt.getTime() - b.createdAt.getTime()
}

export interface StockLevel {
  /** Raw derived level in units; may be fractional or negative. */
  level: number
  /** What the screen shows: max(0, round(level)). */
  shown: number
  /** True when nothing was bought or used since the count — "5", not "about 5". */
  exact: boolean
  /** When it was last counted; null if only purchases have been logged. */
  countedAt: Date | null
  /** What the level runs from: the last count, else the first purchase. */
  since: Date
}

interface Anchor {
  event: LevelEvent
  counted: boolean
}

/**
 * The event the level is measured from: the latest count (by `at`, then
 * `createdAt`), else the first purchase. Swaps alone never start tracking —
 * every "Replaced today" writes one, counted or not.
 */
function anchorOf(events: readonly LevelEvent[]): Anchor | null {
  const sorted = events.filter((e) => e.kind !== 'swap').sort(compareEvents)
  let lastCount: LevelEvent | undefined
  for (const e of sorted) if (e.kind === 'count') lastCount = e
  if (lastCount !== undefined) return { event: lastCount, counted: true }
  const first = sorted[0]
  return first === undefined ? null : { event: first, counted: false }
}

/**
 * Level from the log. `usage` reports what was consumed after the anchor (in
 * units), and whether anything was at all — which makes the figure an
 * estimate even when it converts to nothing.
 */
function levelFrom(
  events: readonly LevelEvent[],
  usage: (anchor: LevelEvent) => { used: number; any: boolean },
): StockLevel | null {
  const anchor = anchorOf(events)
  if (anchor === null) return null
  const a = anchor.event
  let base = anchor.counted ? a.amount : 0
  let boughtSince = false
  for (const e of events) {
    if (e.kind !== 'bought') continue
    // With no count, every purchase counts (the first is the anchor itself);
    // with one, only purchases strictly after it.
    if (!anchor.counted || compareEvents(e, a) > 0) {
      base += e.amount
      if (anchor.counted) boughtSince = true
    }
  }
  const { used, any } = usage(a)
  const level = base - used
  return {
    level,
    shown: Math.max(0, Math.round(level)),
    exact: anchor.counted && !boughtSince && !any,
    countedAt: anchor.counted ? a.at : null,
    since: a.at,
  }
}

// ---------- food ----------

export interface FoodStockEventLike {
  kind: FoodStockKind
  units: number
  at: Date
  createdAt: Date
}

export interface FeedingLike {
  foodId: string | null
  amountG: number
  datetime: Date
}

export interface PlanItemLike {
  foodId: string
  amountPerDayG: number
}

/** When this food's level runs from, or null when it isn't tracked yet. */
export function foodStockSince(events: readonly FoodStockEventLike[]): Date | null {
  return anchorOf(events.map(toLevelEvent))?.event.at ?? null
}

function toLevelEvent(e: FoodStockEventLike): LevelEvent {
  return { kind: e.kind, amount: e.units, at: e.at, createdAt: e.createdAt }
}

/** Grams a day of this food across every cat's current plan. */
export function dailyGramsFor(foodId: string, planItems: readonly PlanItemLike[]): number {
  let total = 0
  for (const item of planItems) if (item.foodId === foodId) total += item.amountPerDayG
  return total
}

export interface FoodStockState {
  unit: StockUnit
  /** null = never counted or bought: "Not counted yet". */
  stock: StockLevel | null
  /** Σ grams a day across every cat's current plan; 0 when not on a plan. */
  dailyGrams: number
  /** Whole days left; 0 once it has run out; null when it can't be told. */
  daysLeft: number | null
  /** today + daysLeft — only for a food on a plan with a known unit size. */
  runsOutOn: Date | null
  low: boolean
}

export interface FoodStockInput {
  food: { id: string; type: FoodType; unit: StockUnit | null; unitSizeG: number | null }
  events: readonly FoodStockEventLike[]
  /** Feedings of every cat; other foods' are ignored. */
  feedings: readonly FeedingLike[]
  /** Every cat's current plan items; other foods' are ignored. */
  planItems: readonly PlanItemLike[]
  today: Date
}

export function foodStockState({
  food,
  events,
  feedings,
  planItems,
  today,
}: FoodStockInput): FoodStockState {
  const unit = unitFor(food)
  const dailyGrams = dailyGramsFor(food.id, planItems)
  const stock = levelFrom(events.map(toLevelEvent), (anchor) => {
    let grams = 0
    let any = false
    for (const f of feedings) {
      if (f.foodId !== food.id || f.datetime.getTime() <= anchor.at.getTime()) continue
      grams += f.amountG
      any = true
    }
    // No unit size: grams can't be turned into tins, so only counts and
    // purchases move the figure.
    return { used: food.unitSizeG === null ? 0 : grams / food.unitSizeG, any }
  })

  if (stock === null) {
    return { unit, stock, dailyGrams, daysLeft: null, runsOutOn: null, low: false }
  }

  const canProject = food.unitSizeG !== null && dailyGrams > 0
  let daysLeft: number | null = null
  if (stock.level <= 0) daysLeft = 0
  else if (canProject && food.unitSizeG !== null) {
    daysLeft = Math.floor((stock.level * food.unitSizeG) / dailyGrams)
  }
  const runsOutOn = canProject && daysLeft !== null ? addDays(startOfDay(today), daysLeft) : null
  return {
    unit,
    stock,
    dailyGrams,
    daysLeft,
    runsOutOn,
    low: daysLeft !== null && daysLeft < ORDER_LEAD_DAYS,
  }
}

// ---------- litter ----------

export interface LitterStockEventLike {
  kind: LitterStockKind
  bags: number
  at: Date
  createdAt: Date
}

export interface LitterBoxLike {
  lastChangedAt: Date
  changeEveryWeeks: number
  bagsPerSwap: number
}

/** The day a box is due its full clean — calendar days, as litter.ts counts. */
export function litterBoxDueOn(box: LitterBoxLike): Date {
  return addDays(startOfDay(box.lastChangedAt), box.changeEveryWeeks * 7)
}

export interface LitterStockState {
  /** null = never counted or bought: "Not counted yet". */
  stock: StockLevel | null
  /** today + ORDER_LEAD_DAYS: swaps due on or before it are "due soon". */
  dueBy: Date
  /** Σ bagsPerSwap of the boxes due by `dueBy`, overdue ones included. */
  dueSoonBags: number
  /** The biggest box's bagsPerSwap — one full swap of anything; 0 with no boxes. */
  reserve: number
  /** Whole full swaps the stock covers (floor(level / reserve)); null if unknowable. */
  swapsLeft: number | null
  /** After this week's swaps there wouldn't be a full swap left. */
  low: boolean
}

export function litterStockState({
  events,
  boxes,
  today,
}: {
  events: readonly LitterStockEventLike[]
  boxes: readonly LitterBoxLike[]
  today: Date
}): LitterStockState {
  const levelEvents = events.map((e): LevelEvent => ({
    kind: e.kind,
    amount: e.bags,
    at: e.at,
    createdAt: e.createdAt,
  }))
  const stock = levelFrom(levelEvents, (anchor) => {
    // Swaps strictly after the anchor (by at, then createdAt) draw bags off.
    let used = 0
    let any = false
    for (const e of levelEvents) {
      if (e.kind !== 'swap' || compareEvents(e, anchor) <= 0) continue
      used += e.amount
      any = true
    }
    return { used, any }
  })

  const dueBy = addDays(startOfDay(today), ORDER_LEAD_DAYS)
  let dueSoonBags = 0
  let reserve = 0
  for (const box of boxes) {
    reserve = Math.max(reserve, box.bagsPerSwap)
    if (differenceInCalendarDays(dueBy, litterBoxDueOn(box)) >= 0) dueSoonBags += box.bagsPerSwap
  }

  const swapsLeft =
    stock === null || reserve === 0 ? null : Math.floor(Math.max(0, stock.level) / reserve)
  return {
    stock,
    dueBy,
    dueSoonBags,
    reserve,
    swapsLeft,
    low: stock !== null && boxes.length > 0 && stock.level - dueSoonBags < reserve,
  }
}
