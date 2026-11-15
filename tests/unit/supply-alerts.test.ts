import { describe, expect, it } from 'vitest'
import {
  foodStockState,
  litterStockState,
  type FoodStockState,
  type LitterStockState,
} from '../../src/lib/stock'
import { anySupplyLow, supplyAlerts } from '../../src/lib/supply-alerts'

const TODAY = new Date(2026, 10, 15)

function foodState(units: number, dailyGrams = 200): FoodStockState {
  const at = new Date(2026, 10, 15, 8)
  return foodStockState({
    food: { id: 'f1', type: 'wet', unit: 'tin', unitSizeG: 400 },
    events: [{ kind: 'count', units, at, createdAt: at }],
    feedings: [],
    planItems: dailyGrams > 0 ? [{ foodId: 'f1', amountPerDayG: dailyGrams }] : [],
    today: TODAY,
  })
}

function litterState(bags: number | null): LitterStockState {
  const at = new Date(2026, 10, 15, 8)
  return litterStockState({
    events: bags === null ? [] : [{ kind: 'count', bags, at, createdAt: at }],
    boxes: [{ lastChangedAt: new Date(2026, 10, 10), changeEveryWeeks: 4, bagsPerSwap: 2 }],
    today: TODAY,
  })
}

const KITTEN = { id: 'f1', name: 'Premiere Kitten' }
const FRESH_BOX = {
  id: 'b1',
  location: 'Bathroom',
  lastChangedAt: new Date(2026, 10, 10),
  changeEveryWeeks: 4,
}

describe('supplyAlerts', () => {
  it('is empty when nothing is low or due', () => {
    const alerts = supplyAlerts({
      foods: [{ food: KITTEN, state: foodState(10) }],
      litter: litterState(10),
      boxes: [FRESH_BOX],
      today: TODAY,
    })
    expect(alerts).toEqual([])
    expect(anySupplyLow(alerts)).toBe(false)
  })

  it('says how many days a low food has left, or that it has run out', () => {
    const [threeDays] = supplyAlerts({
      foods: [{ food: KITTEN, state: foodState(1.5) }],
      litter: litterState(null),
      boxes: [],
      today: TODAY,
    })
    expect(threeDays).toMatchObject({
      kind: 'food',
      foodId: 'f1',
      title: 'Order Premiere Kitten',
      detail: 'about 3 days left',
      to: '/supplies',
    })
    const [one] = supplyAlerts({
      foods: [{ food: KITTEN, state: foodState(0.5) }],
      litter: litterState(null),
      boxes: [],
      today: TODAY,
    })
    expect(one?.detail).toBe('about 1 day left')
    const [out] = supplyAlerts({
      foods: [{ food: KITTEN, state: foodState(0) }],
      litter: litterState(null),
      boxes: [],
      today: TODAY,
    })
    expect(out?.detail).toBe('run out')
  })

  it('says how many bags of litter are left', () => {
    const alerts = supplyAlerts({ foods: [], litter: litterState(1), boxes: [], today: TODAY })
    expect(alerts).toEqual([
      {
        kind: 'litter',
        key: 'litter',
        title: 'Order litter',
        detail: '1 bag left',
        to: '/supplies',
      },
    ])
    expect(anySupplyLow(alerts)).toBe(true)
  })

  it('lists an overdue box, linking Home, without lighting the supplies dot', () => {
    const alerts = supplyAlerts({
      foods: [],
      litter: litterState(null),
      boxes: [FRESH_BOX, { ...FRESH_BOX, id: 'b2', lastChangedAt: new Date(2026, 9, 1) }],
      today: TODAY,
    })
    expect(alerts).toEqual([
      {
        kind: 'litterBox',
        key: 'box-b2',
        boxId: 'b2',
        title: 'Bathroom',
        detail: 'due for a full clean',
        to: '/',
      },
    ])
    expect(anySupplyLow(alerts)).toBe(false)
  })

  it('orders food, then litter, then boxes', () => {
    const alerts = supplyAlerts({
      foods: [{ food: KITTEN, state: foodState(1) }],
      litter: litterState(0),
      boxes: [{ ...FRESH_BOX, lastChangedAt: new Date(2026, 9, 1) }],
      today: TODAY,
    })
    expect(alerts.map((a) => a.kind)).toEqual(['food', 'litter', 'litterBox'])
  })
})
