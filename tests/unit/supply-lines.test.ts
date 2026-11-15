import { describe, expect, it } from 'vitest'
import { type FoodStockState, type LitterStockState, type StockLevel } from '../../src/lib/stock'
import {
  foodLowLine,
  foodMeta,
  foodSubLine,
  litterLowLine,
  litterMeta,
  litterSubLine,
  stockWhen,
} from '../../src/lib/supply-lines'

const NOW = new Date(2026, 10, 15, 12, 0)

function level(overrides: Partial<StockLevel> = {}): StockLevel {
  return {
    level: 2.1,
    shown: 2,
    exact: false,
    countedAt: new Date(2026, 10, 8, 9, 0),
    since: new Date(2026, 10, 8, 9, 0),
    ...overrides,
  }
}

function foodState(overrides: Partial<FoodStockState> = {}): FoodStockState {
  return {
    unit: 'tin',
    stock: level(),
    dailyGrams: 240,
    daysLeft: 3,
    runsOutOn: new Date(2026, 10, 18),
    low: true,
    ...overrides,
  }
}

const TIN = { type: 'wet', brand: 'Premiere', unit: null, unitSizeG: 400 } as const

describe('stockWhen', () => {
  it('estimates since the last count', () => {
    expect(stockWhen(level(), NOW)).toBe('estimated since the Nov 8 count')
  })

  it('says today’s and yesterday’s rather than a date', () => {
    expect(stockWhen(level({ countedAt: new Date(2026, 10, 15, 8) }), NOW)).toBe(
      'estimated since today’s count',
    )
    expect(stockWhen(level({ countedAt: new Date(2026, 10, 14, 8) }), NOW)).toBe(
      'estimated since yesterday’s count',
    )
  })

  it('says "counted just now" right after a count, then the day', () => {
    expect(stockWhen(level({ exact: true, countedAt: new Date(2026, 10, 15, 11, 58) }), NOW)).toBe(
      'counted just now',
    )
    expect(stockWhen(level({ exact: true, countedAt: new Date(2026, 10, 15, 8) }), NOW)).toBe(
      'counted today',
    )
    expect(stockWhen(level({ exact: true }), NOW)).toBe('counted Nov 8')
  })

  it('runs from the first purchase when nothing was ever counted', () => {
    expect(stockWhen(level({ countedAt: null }), NOW)).toBe('estimated since the Nov 8 purchase')
  })
})

describe('foodMeta', () => {
  it('reads type, brand and the size of one', () => {
    expect(foodMeta(TIN)).toBe('Wet · Premiere · 400 g tins')
  })

  it('skips a missing brand and says what it comes in without a size', () => {
    expect(foodMeta({ type: 'dry', brand: null, unit: null, unitSizeG: null })).toBe(
      'Dry · in bags',
    )
    expect(foodMeta({ type: 'wet', brand: ' ', unit: 'pouch', unitSizeG: 85 })).toBe(
      'Wet · 85 g pouches',
    )
  })
})

describe('litterMeta', () => {
  const CLUMPING = { id: 'l1', bagSize: 10, bagUnit: 'L' as const }
  const BOXES = [
    { location: 'Bathroom', litterId: 'l1' },
    { location: 'Bedroom', litterId: 'l2' },
    { location: 'Hall', litterId: 'l1' },
    { location: 'Attic', litterId: null },
  ]

  it('reads the bag size and the boxes that take it', () => {
    expect(litterMeta(CLUMPING, BOXES)).toBe('10 L bags · Bathroom, Hall')
    expect(litterMeta({ id: 'l2', bagSize: 5, bagUnit: 'kg' }, BOXES)).toBe('5 kg bags · Bedroom')
  })

  it('drops the locations when no box takes it', () => {
    expect(litterMeta(CLUMPING, [])).toBe('10 L bags')
    expect(litterMeta({ ...CLUMPING, id: 'l9' }, BOXES)).toBe('10 L bags')
  })

  it('says just "Bags" when the size or its unit is unknown', () => {
    expect(litterMeta({ id: 'l1', bagSize: null, bagUnit: null }, [])).toBe('Bags')
    expect(litterMeta({ id: 'l1', bagSize: 10, bagUnit: null }, [])).toBe('Bags')
    expect(litterMeta({ id: 'l1', bagSize: null, bagUnit: 'L' }, BOXES)).toBe(
      'Bags · Bathroom, Hall',
    )
  })

  it('keeps a decimal size to one place', () => {
    expect(litterMeta({ id: 'l1', bagSize: 7.56, bagUnit: 'kg' }, [])).toBe('7.6 kg bags')
  })
})

describe('foodSubLine', () => {
  it('leads with the run-out date', () => {
    expect(foodSubLine(TIN, foodState(), NOW)).toBe(
      'runs out around Nov 18 · estimated since the Nov 8 count',
    )
  })

  it('says when a food is not on a plan', () => {
    expect(
      foodSubLine(
        TIN,
        foodState({
          dailyGrams: 0,
          daysLeft: null,
          runsOutOn: null,
          stock: level({ exact: true }),
        }),
        NOW,
      ),
    ).toBe('not on a plan · counted Nov 8')
  })

  it('says when the size is missing, so the figure cannot count down', () => {
    expect(
      foodSubLine({ ...TIN, unitSizeG: null }, foodState({ daysLeft: null, runsOutOn: null }), NOW),
    ).toBe('no tin size · estimated since the Nov 8 count')
  })

  it('says run out once it has', () => {
    expect(
      foodSubLine(TIN, foodState({ stock: level({ level: -0.4, shown: 0 }), daysLeft: 0 }), NOW),
    ).toBe('run out · estimated since the Nov 8 count')
  })

  it('is null while the food is not counted yet', () => {
    expect(foodSubLine(TIN, foodState({ stock: null }), NOW)).toBeNull()
  })
})

describe('foodLowLine', () => {
  it('counts the days left', () => {
    expect(foodLowLine(foodState())).toBe('About 3 days left — time to order')
    expect(foodLowLine(foodState({ daysLeft: 1 }))).toBe('About 1 day left — time to order')
  })

  it('says run out at nothing left', () => {
    expect(foodLowLine(foodState({ stock: level({ level: 0, shown: 0 }), daysLeft: 0 }))).toBe(
      'Run out — time to order',
    )
  })

  it('is null when there is plenty', () => {
    expect(foodLowLine(foodState({ low: false, daysLeft: 20 }))).toBeNull()
  })
})

function litterState(overrides: Partial<LitterStockState> = {}): LitterStockState {
  return {
    stock: level({ level: 2, shown: 2, exact: true, countedAt: new Date(2026, 10, 1) }),
    dueBy: new Date(2026, 10, 22),
    dueSoonBags: 2,
    reserve: 2,
    swapsLeft: 1,
    low: true,
    ...overrides,
  }
}

describe('litter lines', () => {
  it('counts full swaps left', () => {
    expect(litterSubLine(litterState(), NOW)).toBe('enough for 1 full swap · counted Nov 1')
    expect(litterSubLine(litterState({ swapsLeft: 3 }), NOW)).toBe(
      'enough for 3 full swaps · counted Nov 1',
    )
  })

  it('leaves the swaps out with no boxes', () => {
    expect(litterSubLine(litterState({ swapsLeft: null }), NOW)).toBe('counted Nov 1')
  })

  it('names the week’s swaps when they leave none spare', () => {
    expect(litterLowLine(litterState())).toBe(
      'The swaps due by Nov 22 leave none spare — time to order',
    )
    expect(litterLowLine(litterState({ dueSoonBags: 0 }))).toBe(
      'Not enough for a full swap — time to order',
    )
    expect(litterLowLine(litterState({ low: false }))).toBeNull()
  })
})
