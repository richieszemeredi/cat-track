import { describe, expect, it } from 'vitest'
import {
  bagsLabel,
  dailyGramsFor,
  defaultUnitForType,
  foodStockSince,
  foodStockState,
  litterBoxDueOn,
  litterStockState,
  ORDER_LEAD_DAYS,
  unitCountLabel,
  unitFor,
  unitNoun,
  type FeedingLike,
  type FoodStockEventLike,
  type FoodStockInput,
  type LitterBoxLike,
  type LitterStockEventLike,
} from '../../src/lib/stock'

const TODAY = new Date(2026, 10, 15, 12, 0) // Nov 15, local

function at(day: number, hour = 9): Date {
  return new Date(2026, 10, day, hour, 0)
}

function foodEvent(
  kind: FoodStockEventLike['kind'],
  units: number,
  when: Date,
  createdAt: Date = when,
): FoodStockEventLike {
  return { kind, units, at: when, createdAt }
}

function fed(amountG: number, when: Date, foodId: string | null = 'f1'): FeedingLike {
  return { foodId, amountG, datetime: when }
}

const TIN = { id: 'f1', type: 'wet' as const, unit: 'tin' as const, unitSizeG: 400 }

function foodInput(overrides: Partial<FoodStockInput> = {}): FoodStockInput {
  return {
    food: TIN,
    events: [],
    feedings: [],
    planItems: [{ foodId: 'f1', amountPerDayG: 200 }],
    today: TODAY,
    ...overrides,
  }
}

describe('units', () => {
  it('defaults from the food type: wet in tins, dry and treats in bags', () => {
    expect(defaultUnitForType('wet')).toBe('tin')
    expect(defaultUnitForType('dry')).toBe('bag')
    expect(defaultUnitForType('treat')).toBe('bag')
  })

  it("uses the food's own unit when it has one", () => {
    expect(unitFor({ unit: 'pouch', type: 'wet' })).toBe('pouch')
    expect(unitFor({ unit: null, type: 'wet' })).toBe('tin')
    expect(unitFor({ unit: null, type: 'dry' })).toBe('bag')
  })

  it('is singular for exactly one and plural for everything else', () => {
    expect(unitNoun('tin', 1)).toBe('tin')
    expect(unitNoun('tin', 0)).toBe('tins')
    expect(unitNoun('tin', 2)).toBe('tins')
    expect(unitNoun('pouch', 1)).toBe('pouch')
    expect(unitNoun('pouch', 3)).toBe('pouches')
    expect(unitNoun('bag', 1)).toBe('bag')
    expect(unitNoun('bag', 5)).toBe('bags')
  })

  it('labels a count', () => {
    expect(unitCountLabel(1, 'tin')).toBe('1 tin')
    expect(unitCountLabel(26, 'tin')).toBe('26 tins')
    expect(unitCountLabel(0, 'pouch')).toBe('0 pouches')
    expect(bagsLabel(1)).toBe('1 bag')
    expect(bagsLabel(4)).toBe('4 bags')
  })
})

describe('food stock level', () => {
  it('is untracked with no events', () => {
    const s = foodStockState(foodInput({ feedings: [fed(80, at(14))] }))
    expect(s.stock).toBeNull()
    expect(s.daysLeft).toBeNull()
    expect(s.runsOutOn).toBeNull()
    expect(s.low).toBe(false)
    expect(foodStockSince([])).toBeNull()
  })

  it('is exact straight after a count', () => {
    const s = foodStockState(foodInput({ events: [foodEvent('count', 5, at(15, 8))] }))
    expect(s.stock).toMatchObject({ level: 5, shown: 5, exact: true, countedAt: at(15, 8) })
  })

  it('counts down by the grams fed since the count, as a fraction of a tin', () => {
    const s = foodStockState(
      foodInput({
        events: [foodEvent('count', 5, at(10))],
        feedings: [fed(200, at(11)), fed(200, at(12)), fed(100, at(13))],
      }),
    )
    expect(s.stock?.level).toBeCloseTo(3.75)
    expect(s.stock?.shown).toBe(4)
    expect(s.stock?.exact).toBe(false)
  })

  it('ignores feedings before or at the count, and those of other foods', () => {
    const s = foodStockState(
      foodInput({
        events: [foodEvent('count', 5, at(10))],
        feedings: [
          fed(400, at(9)),
          fed(400, at(10)),
          fed(400, at(11), 'f2'),
          fed(50, at(11), null),
        ],
      }),
    )
    expect(s.stock).toMatchObject({ level: 5, exact: true })
  })

  it('adds purchases after the count and ignores those before it', () => {
    const s = foodStockState(
      foodInput({
        events: [
          foodEvent('bought', 24, at(1)),
          foodEvent('count', 5, at(10)),
          foodEvent('bought', 12, at(12)),
        ],
      }),
    )
    expect(s.stock).toMatchObject({ level: 17, shown: 17, exact: false, countedAt: at(10) })
  })

  it('anchors on the latest count, by time and then by when it was written', () => {
    const s = foodStockState(
      foodInput({
        events: [
          foodEvent('count', 9, at(12), at(12, 10)),
          foodEvent('count', 7, at(12), at(12, 11)),
          foodEvent('count', 3, at(5)),
        ],
      }),
    )
    expect(s.stock?.level).toBe(7)
  })

  it('takes a purchase at the same time as the count only if written after it', () => {
    const before = foodStockState(
      foodInput({
        events: [foodEvent('bought', 6, at(12), at(12, 8)), foodEvent('count', 5, at(12))],
      }),
    )
    expect(before.stock?.level).toBe(5)
    const after = foodStockState(
      foodInput({
        events: [foodEvent('count', 5, at(12)), foodEvent('bought', 6, at(12), at(12, 10))],
      }),
    )
    expect(after.stock?.level).toBe(11)
  })

  it('with no count, sums purchases less what was eaten after the first one', () => {
    const s = foodStockState(
      foodInput({
        events: [foodEvent('bought', 6, at(10)), foodEvent('bought', 6, at(12))],
        feedings: [fed(400, at(9)), fed(800, at(11))],
      }),
    )
    expect(s.stock).toMatchObject({ level: 10, exact: false, countedAt: null, since: at(10) })
    expect(
      foodStockSince([foodEvent('bought', 6, at(12)), foodEvent('bought', 6, at(10))]),
    ).toEqual(at(10))
  })

  it('accepts a count of zero', () => {
    const s = foodStockState(foodInput({ events: [foodEvent('count', 0, at(15, 8))] }))
    expect(s.stock).toMatchObject({ level: 0, shown: 0, exact: true })
    expect(s.daysLeft).toBe(0)
    expect(s.low).toBe(true)
  })

  it('never shows a negative figure', () => {
    const s = foodStockState(
      foodInput({ events: [foodEvent('count', 1, at(10))], feedings: [fed(1200, at(11))] }),
    )
    expect(s.stock?.level).toBe(-2)
    expect(s.stock?.shown).toBe(0)
    expect(s.daysLeft).toBe(0)
  })

  it('without a unit size, feedings do not move the figure but still make it an estimate', () => {
    const s = foodStockState(
      foodInput({
        food: { ...TIN, unitSizeG: null },
        events: [foodEvent('count', 5, at(10))],
        feedings: [fed(200, at(11))],
      }),
    )
    expect(s.stock).toMatchObject({ level: 5, exact: false })
    expect(s.daysLeft).toBeNull()
    expect(s.runsOutOn).toBeNull()
    expect(s.low).toBe(false)
  })
})

describe('food days left', () => {
  it('sums the daily grams across every cat’s current plan', () => {
    const items = [
      { foodId: 'f1', amountPerDayG: 120 },
      { foodId: 'f2', amountPerDayG: 40 },
      { foodId: 'f1', amountPerDayG: 80 },
    ]
    expect(dailyGramsFor('f1', items)).toBe(200)
    expect(dailyGramsFor('f3', items)).toBe(0)
  })

  it('floors the days and dates the run-out from today', () => {
    // 3 tins × 400 g = 1200 g at 250 g a day = 4.8 days → 4.
    const s = foodStockState(
      foodInput({
        events: [foodEvent('count', 3, at(15, 8))],
        planItems: [{ foodId: 'f1', amountPerDayG: 250 }],
      }),
    )
    expect(s.dailyGrams).toBe(250)
    expect(s.daysLeft).toBe(4)
    expect(s.runsOutOn).toEqual(new Date(2026, 10, 19))
    expect(s.low).toBe(true)
  })

  it(`is low below ${String(ORDER_LEAD_DAYS)} days and not at it`, () => {
    // 200 g a day from 400 g tins = 2 days a tin.
    const atLead = foodStockState(foodInput({ events: [foodEvent('count', 4, at(15, 8))] }))
    expect(atLead.daysLeft).toBe(8)
    expect(atLead.low).toBe(false)
    const seven = foodStockState(foodInput({ events: [foodEvent('count', 3.5, at(15, 8))] }))
    expect(seven.daysLeft).toBe(ORDER_LEAD_DAYS)
    expect(seven.low).toBe(false)
    const six = foodStockState(foodInput({ events: [foodEvent('count', 3, at(15, 8))] }))
    expect(six.daysLeft).toBe(6)
    expect(six.low).toBe(true)
  })

  it('has no run-out date for a food on no plan', () => {
    const s = foodStockState(
      foodInput({ events: [foodEvent('count', 2, at(15, 8))], planItems: [] }),
    )
    expect(s.dailyGrams).toBe(0)
    expect(s.daysLeft).toBeNull()
    expect(s.runsOutOn).toBeNull()
    expect(s.low).toBe(false)
  })

  it('has run out at zero even off-plan, with no date to project', () => {
    const s = foodStockState(
      foodInput({ events: [foodEvent('count', 0, at(15, 8))], planItems: [] }),
    )
    expect(s.daysLeft).toBe(0)
    expect(s.runsOutOn).toBeNull()
    expect(s.low).toBe(true)
  })
})

// ---------- litter ----------

function litterEvent(
  kind: LitterStockEventLike['kind'],
  bags: number,
  when: Date,
  createdAt: Date = when,
): LitterStockEventLike {
  return { kind, bags, at: when, createdAt }
}

function box(changed: Date, changeEveryWeeks = 4, bagsPerSwap = 1): LitterBoxLike {
  return { lastChangedAt: changed, changeEveryWeeks, bagsPerSwap }
}

describe('litterBoxDueOn', () => {
  it('is the calendar day the interval is reached', () => {
    expect(litterBoxDueOn(box(at(1, 23), 2))).toEqual(new Date(2026, 10, 15))
  })
})

describe('litter stock', () => {
  it('is untracked with no events, and never low', () => {
    const s = litterStockState({ events: [], boxes: [box(at(1))], today: TODAY })
    expect(s.stock).toBeNull()
    expect(s.swapsLeft).toBeNull()
    expect(s.low).toBe(false)
  })

  it('is not started by swaps alone', () => {
    const s = litterStockState({
      events: [litterEvent('swap', 2, at(10))],
      boxes: [box(at(10))],
      today: TODAY,
    })
    expect(s.stock).toBeNull()
    expect(s.low).toBe(false)
  })

  it('subtracts swaps after the count and adds purchases after it', () => {
    const s = litterStockState({
      events: [
        litterEvent('swap', 2, at(1)),
        litterEvent('bought', 4, at(2)),
        litterEvent('count', 5, at(5)),
        litterEvent('swap', 2, at(8)),
        litterEvent('bought', 3, at(9)),
      ],
      boxes: [],
      today: TODAY,
    })
    expect(s.stock).toMatchObject({ level: 6, shown: 6, exact: false, countedAt: at(5) })
  })

  it('is exact when nothing was swapped or bought since the count', () => {
    const s = litterStockState({
      events: [litterEvent('swap', 2, at(1)), litterEvent('count', 5, at(5))],
      boxes: [],
      today: TODAY,
    })
    expect(s.stock).toMatchObject({ level: 5, exact: true })
  })

  it('with no count, sums purchases less swaps after the first purchase', () => {
    const s = litterStockState({
      events: [
        litterEvent('swap', 1, at(1)),
        litterEvent('bought', 4, at(2)),
        litterEvent('swap', 1, at(6)),
      ],
      boxes: [],
      today: TODAY,
    })
    expect(s.stock).toMatchObject({ level: 3, countedAt: null, since: at(2) })
  })

  it('counts the bags of boxes due within the lead time, overdue ones included', () => {
    const s = litterStockState({
      events: [litterEvent('count', 10, at(15, 8))],
      boxes: [
        box(new Date(2026, 9, 1), 4, 2), // overdue since Oct 29
        box(new Date(2026, 9, 25), 4, 1), // due Nov 22 = today + 7: included
        box(new Date(2026, 9, 26), 4, 3), // due Nov 23: not yet
      ],
      today: TODAY,
    })
    expect(s.dueBy).toEqual(new Date(2026, 10, 22))
    expect(s.dueSoonBags).toBe(3)
    expect(s.reserve).toBe(3)
    expect(s.swapsLeft).toBe(3)
    expect(s.low).toBe(false) // 10 − 3 = 7 ≥ 3
  })

  it('is low when the swaps due this week would leave less than one full swap', () => {
    const boxes = [box(new Date(2026, 9, 20), 4, 2), box(at(14), 4, 2)]
    const enough = litterStockState({
      events: [litterEvent('count', 4, at(15, 8))],
      boxes,
      today: TODAY,
    })
    expect(enough.dueSoonBags).toBe(2)
    expect(enough.low).toBe(false) // 4 − 2 = 2, not < 2
    const short = litterStockState({
      events: [litterEvent('count', 3, at(15, 8))],
      boxes,
      today: TODAY,
    })
    expect(short.low).toBe(true)
  })

  it('is never low with no boxes, even at zero', () => {
    const s = litterStockState({
      events: [litterEvent('count', 0, at(15, 8))],
      boxes: [],
      today: TODAY,
    })
    expect(s.reserve).toBe(0)
    expect(s.swapsLeft).toBeNull()
    expect(s.low).toBe(false)
  })

  it('never shows a negative level, and has no full swap left', () => {
    const s = litterStockState({
      events: [litterEvent('count', 1, at(10)), litterEvent('swap', 3, at(11))],
      boxes: [box(at(11), 4, 3)],
      today: TODAY,
    })
    expect(s.stock).toMatchObject({ level: -2, shown: 0 })
    expect(s.swapsLeft).toBe(0)
    expect(s.low).toBe(true)
  })
})
