import { differenceInMinutes, format, isSameDay, subDays } from 'date-fns'
import { type FoodType } from './catmath'
import {
  unitFor,
  unitNoun,
  type FoodStockState,
  type LitterStockState,
  type StockLevel,
  type StockUnit,
} from './stock'

// The words under each figure on the Supplies screen. Pure, so the phrasing
// of every case is pinned by a unit test rather than by eye.

const TYPE_LABEL: Record<FoodType, string> = { dry: 'Dry', wet: 'Wet', treat: 'Treat' }

/** Short date, as the rest of the app writes one: "Nov 18". */
function shortDate(date: Date): string {
  return format(date, 'MMM d')
}

/** "today's", "yesterday's", "the Nov 8" — for "since the … count". */
function sinceDay(date: Date, now: Date): string {
  if (isSameDay(date, now)) return 'today’s'
  if (isSameDay(date, subDays(now, 1))) return 'yesterday’s'
  return `the ${shortDate(date)}`
}

/** "today", "yesterday", "Nov 8". */
function dayWord(date: Date, now: Date): string {
  if (isSameDay(date, now)) return 'today'
  if (isSameDay(date, subDays(now, 1))) return 'yesterday'
  return shortDate(date)
}

/**
 * When the figure was last known for sure: "counted just now", "counted Nov
 * 8", "estimated since the Nov 8 count" — or, with no count yet, since the
 * first purchase.
 */
export function stockWhen(stock: StockLevel, now: Date): string {
  if (stock.countedAt === null) return `estimated since ${sinceDay(stock.since, now)} purchase`
  if (!stock.exact) return `estimated since ${sinceDay(stock.countedAt, now)} count`
  if (differenceInMinutes(now, stock.countedAt) < 5) return 'counted just now'
  return `counted ${dayWord(stock.countedAt, now)}`
}

interface FoodLike {
  type: FoodType
  brand: string | null
  unit: StockUnit | null
  unitSizeG: number | null
}

/** "Wet · Premiere · 400 g tins"; without a size, "Wet · Premiere · in tins". */
export function foodMeta(food: FoodLike): string {
  const plural = unitNoun(unitFor(food), 2)
  const size =
    food.unitSizeG === null
      ? `in ${plural}`
      : `${String(Math.round(food.unitSizeG * 10) / 10)} g ${plural}`
  const brand = food.brand?.trim() ?? ''
  return [TYPE_LABEL[food.type], brand === '' ? null : brand, size]
    .filter((part) => part !== null)
    .join(' · ')
}

/**
 * "runs out around Nov 18 · estimated since the Nov 8 count", "not on a plan
 * · counted Nov 8". Null while the food isn't counted yet.
 */
export function foodSubLine(food: FoodLike, state: FoodStockState, now: Date): string | null {
  const { stock } = state
  if (stock === null) return null
  let outlook: string | null = null
  if (stock.level <= 0) outlook = 'run out'
  else if (state.dailyGrams === 0) outlook = 'not on a plan'
  else if (food.unitSizeG === null) outlook = `no ${unitFor(food)} size`
  else if (state.daysLeft === 0) outlook = 'runs out today'
  else if (state.runsOutOn !== null) outlook = `runs out around ${shortDate(state.runsOutOn)}`
  return [outlook, stockWhen(stock, now)].filter((part) => part !== null).join(' · ')
}

/** "About 3 days left — time to order"; null unless the food is low. */
export function foodLowLine(state: FoodStockState): string | null {
  if (!state.low || state.daysLeft === null) return null
  if (state.stock !== null && state.stock.level <= 0) return 'Run out — time to order'
  if (state.daysLeft === 0) return 'Runs out today — time to order'
  const days = state.daysLeft
  return `About ${String(days)} ${days === 1 ? 'day' : 'days'} left — time to order`
}

/** "enough for 1 full swap · counted Nov 1". Null while litter isn't counted yet. */
export function litterSubLine(state: LitterStockState, now: Date): string | null {
  if (state.stock === null) return null
  const swaps =
    state.swapsLeft === null
      ? null
      : `enough for ${String(state.swapsLeft)} full ${state.swapsLeft === 1 ? 'swap' : 'swaps'}`
  return [swaps, stockWhen(state.stock, now)].filter((part) => part !== null).join(' · ')
}

/** Null unless litter is low: after this week's swaps there'd be no full swap left. */
export function litterLowLine(state: LitterStockState): string | null {
  if (!state.low) return null
  if (state.dueSoonBags === 0) return 'Not enough for a full swap — time to order'
  return `The swaps due by ${shortDate(state.dueBy)} leave none spare — time to order`
}
