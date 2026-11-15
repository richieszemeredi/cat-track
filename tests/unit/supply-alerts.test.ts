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
const CLUMPING = { id: 'l1', name: 'Clumping' }
const SILICA = { id: 'l2', name: 'Silica' }
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
      litters: [{ litter: CLUMPING, state: litterState(10) }],
      boxes: [FRESH_BOX],
      today: TODAY,
    })
    expect(alerts).toEqual([])
    expect(anySupplyLow(alerts)).toBe(false)
  })

  it('says how many days a low food has left, or that it has run out', () => {
    const [threeDays] = supplyAlerts({
      foods: [{ food: KITTEN, state: foodState(1.5) }],
      litters: [{ litter: CLUMPING, state: litterState(null) }],
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
      litters: [{ litter: CLUMPING, state: litterState(null) }],
      boxes: [],
      today: TODAY,
    })
    expect(one?.detail).toBe('about 1 day left')
    const [out] = supplyAlerts({
      foods: [{ food: KITTEN, state: foodState(0) }],
      litters: [{ litter: CLUMPING, state: litterState(null) }],
      boxes: [],
      today: TODAY,
    })
    expect(out?.detail).toBe('run out')
  })

  it('says how many bags of a low litter kind are left, naming it', () => {
    const alerts = supplyAlerts({
      foods: [],
      litters: [{ litter: CLUMPING, state: litterState(1) }],
      boxes: [],
      today: TODAY,
    })
    expect(alerts).toEqual([
      {
        kind: 'litter',
        key: 'litter-l1',
        litterId: 'l1',
        title: 'Order Clumping',
        detail: '1 bag left',
        to: '/supplies',
      },
    ])
    expect(anySupplyLow(alerts)).toBe(true)
  })

  it('gives each low kind its own line, and none for a kind that is fine', () => {
    const alerts = supplyAlerts({
      foods: [],
      litters: [
        { litter: CLUMPING, state: litterState(0) },
        { litter: { id: 'l3', name: 'Paper' }, state: litterState(10) },
        { litter: SILICA, state: litterState(1) },
      ],
      boxes: [],
      today: TODAY,
    })
    expect(alerts.map((a) => [a.key, a.title, a.detail])).toEqual([
      ['litter-l1', 'Order Clumping', '0 bags left'],
      ['litter-l2', 'Order Silica', '1 bag left'],
    ])
  })

  it('says nothing for an uncounted kind', () => {
    const alerts = supplyAlerts({
      foods: [],
      litters: [{ litter: SILICA, state: litterState(null) }],
      boxes: [],
      today: TODAY,
    })
    expect(alerts).toEqual([])
  })

  it('lists an overdue box, linking Home, without lighting the supplies dot', () => {
    const alerts = supplyAlerts({
      foods: [],
      litters: [{ litter: CLUMPING, state: litterState(null) }],
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
      litters: [{ litter: CLUMPING, state: litterState(0) }],
      boxes: [{ ...FRESH_BOX, lastChangedAt: new Date(2026, 9, 1) }],
      today: TODAY,
    })
    expect(alerts.map((a) => a.kind)).toEqual(['food', 'litter', 'litterBox'])
  })
})
