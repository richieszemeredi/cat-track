import { litterAge } from './litter'
import { bagsLabel, type FoodStockState, type LitterStockState } from './stock'

/** One "Needs attention" line: **title** · detail, linking to `to`. */
export type SupplyAlert =
  | { kind: 'food'; key: string; foodId: string; title: string; detail: string; to: '/supplies' }
  | { kind: 'litter'; key: string; title: string; detail: string; to: '/supplies' }
  | { kind: 'litterBox'; key: string; boxId: string; title: string; detail: string; to: '/' }

function foodDetail(daysLeft: number | null): string {
  if (daysLeft === null || daysLeft <= 0) return 'run out'
  return `about ${String(daysLeft)} ${daysLeft === 1 ? 'day' : 'days'} left`
}

/**
 * Home's "Needs attention" lines, in order: each low food, low litter, then
 * each box overdue its full clean (which links to Home, where the boxes are).
 */
export function supplyAlerts({
  foods,
  litter,
  boxes,
  today,
}: {
  foods: Iterable<{ food: { id: string; name: string }; state: FoodStockState }>
  litter: LitterStockState
  boxes: readonly {
    id: string
    location: string
    lastChangedAt: Date
    changeEveryWeeks: number
  }[]
  today: Date
}): SupplyAlert[] {
  const alerts: SupplyAlert[] = []
  for (const { food, state } of foods) {
    if (!state.low) continue
    alerts.push({
      kind: 'food',
      key: `food-${food.id}`,
      foodId: food.id,
      title: `Order ${food.name}`,
      detail: foodDetail(state.daysLeft),
      to: '/supplies',
    })
  }
  if (litter.low && litter.stock !== null) {
    alerts.push({
      kind: 'litter',
      key: 'litter',
      title: 'Order litter',
      detail: `${bagsLabel(litter.stock.shown)} left`,
      to: '/supplies',
    })
  }
  for (const box of boxes) {
    if (!litterAge(box.lastChangedAt, today, box.changeEveryWeeks).overdue) continue
    alerts.push({
      kind: 'litterBox',
      key: `box-${box.id}`,
      boxId: box.id,
      title: box.location,
      detail: 'due for a full clean',
      to: '/',
    })
  }
  return alerts
}

/** The Supplies tab's dot: food or litter low. An overdue box is a chore, not a supply. */
export function anySupplyLow(alerts: readonly SupplyAlert[]): boolean {
  return alerts.some((a) => a.kind !== 'litterBox')
}
