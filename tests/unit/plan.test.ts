import { describe, expect, it } from 'vitest'
import {
  adjustedMealTimes,
  isMealTime,
  isOutgrown,
  mealComposition,
  mealSpacingMinutes,
  mealTimes,
  perMealGrams,
  planDailyGrams,
  planDailyKcal,
  planTargetRatio,
  roundToStep,
  scaleItemsToTarget,
  type PlanItemLike,
} from '../../src/lib/plan'

const DAY = new Date(2026, 8, 7) // 7 September 2026, local time.

function at(hours: number, minutes: number): Date {
  const date = new Date(DAY)
  date.setHours(hours, minutes, 0, 0)
  return date
}

// The tin these numbers come from: Premiere Meat Menu Kitten, 0.96 kcal/g.
const PREMIERE = 0.96
const APPLAWS = 0.75

const kcalPerGram = new Map([
  ['premiere', PREMIERE],
  ['applaws', APPLAWS],
])

function item(foodId: string, amountPerDayG: number): PlanItemLike {
  return { foodId, foodNameSnapshot: foodId, amountPerDayG }
}

describe('mealTimes', () => {
  it('puts a single meal at the start of the window', () => {
    expect(mealTimes(1, '07:00', '19:00')).toEqual(['07:00'])
  })

  it('spaces three meals evenly across the window', () => {
    expect(mealTimes(3, '07:00', '19:00')).toEqual(['07:00', '13:00', '19:00'])
  })

  it('handles a spacing that is not a whole hour', () => {
    expect(mealTimes(4, '07:00', '21:00')).toEqual(['07:00', '11:40', '16:20', '21:00'])
  })

  it('reads a window that ends before it starts as running past midnight', () => {
    expect(mealTimes(2, '22:00', '02:00')).toEqual(['22:00', '02:00'])
  })

  it('always lands the last meal exactly on the end of the window', () => {
    for (let meals = 2; meals <= 6; meals += 1) {
      const times = mealTimes(meals, '06:30', '20:15')
      expect(times).toHaveLength(meals)
      expect(times[0]).toBe('06:30')
      expect(times[meals - 1]).toBe('20:15')
    }
  })

  // A stored plan that somehow went malformed must degrade to an empty
  // checklist rather than throwing inside a render.
  it('returns nothing for input the form could not have produced', () => {
    expect(mealTimes(0, '07:00', '19:00')).toEqual([])
    expect(mealTimes(7, '07:00', '19:00')).toEqual([])
    expect(mealTimes(2.5, '07:00', '19:00')).toEqual([])
    expect(mealTimes(3, '7:00', '19:00')).toEqual([])
    expect(mealTimes(3, '07:00', '25:00')).toEqual([])
  })
})

describe('isMealTime', () => {
  it('accepts a zero-padded 24-hour time', () => {
    expect(isMealTime('00:00')).toBe(true)
    expect(isMealTime('23:59')).toBe(true)
  })

  it('rejects anything else', () => {
    expect(isMealTime('7:00')).toBe(false)
    expect(isMealTime('24:00')).toBe(false)
    expect(isMealTime('07:60')).toBe(false)
    expect(isMealTime('')).toBe(false)
  })
})

describe('mealSpacingMinutes', () => {
  it('is the gap between consecutive meals', () => {
    expect(mealSpacingMinutes(3, '07:00', '19:00')).toBe(360)
    expect(mealSpacingMinutes(4, '07:00', '21:00')).toBe(280)
  })

  it('is null for a single meal', () => {
    expect(mealSpacingMinutes(1, '07:00', '19:00')).toBeNull()
  })

  it('measures across midnight', () => {
    expect(mealSpacingMinutes(2, '22:00', '02:00')).toBe(240)
  })
})

describe('adjustedMealTimes', () => {
  const TIMES = mealTimes(3, '07:00', '19:00') // 07:00 / 13:00 / 19:00

  it('matches the plan when nothing has been given yet', () => {
    expect(adjustedMealTimes(TIMES, DAY, new Map())).toEqual([at(7, 0), at(13, 0), at(19, 0)])
  })

  it('pushes every later, not-yet-given meal back by a late meal’s own delay', () => {
    // Lunch ran 90 minutes late; dinner should too, not land 90 minutes after
    // an on-time lunch would have.
    const given = new Map([[1, at(14, 30)]])
    expect(adjustedMealTimes(TIMES, DAY, given)).toEqual([at(7, 0), at(14, 30), at(20, 30)])
  })

  it('pulls later meals earlier by the same amount when one runs early', () => {
    const given = new Map([[1, at(12, 15)]])
    expect(adjustedMealTimes(TIMES, DAY, given)).toEqual([at(7, 0), at(12, 15), at(18, 15)])
  })

  it('re-bases the offset on the most recently given meal, not a running total', () => {
    // Breakfast 20 minutes early, lunch 40 minutes late relative to ITS OWN
    // slot: dinner follows lunch's lateness, not the sum of both.
    const given = new Map([
      [0, at(6, 40)],
      [1, at(13, 40)],
    ])
    expect(adjustedMealTimes(TIMES, DAY, given)).toEqual([at(6, 40), at(13, 40), at(19, 40)])
  })

  it('leaves a meal already given exactly where it was logged', () => {
    const given = new Map([[0, at(7, 30)]])
    expect(adjustedMealTimes(TIMES, DAY, given)[0]).toEqual(at(7, 30))
  })

  it('puts a moved bowl exactly where it was moved to', () => {
    const moved = new Map([[1, at(14, 45)]])
    expect(adjustedMealTimes(TIMES, DAY, new Map(), moved)).toEqual([
      at(7, 0),
      at(14, 45),
      at(19, 0),
    ])
  })

  it('does not slide a moved bowl by an earlier meal’s lateness', () => {
    // The whole point of typing a time is that it is the time: breakfast
    // running 30 minutes late must not turn a 14:45 lunch into 15:15.
    const given = new Map([[0, at(7, 30)]])
    const moved = new Map([[1, at(14, 45)]])
    expect(adjustedMealTimes(TIMES, DAY, given, moved)).toEqual([at(7, 30), at(14, 45), at(19, 30)])
  })

  it('measures a moved bowl’s lateness against where it was moved to', () => {
    // Lunch was moved to 14:45 and then given at 15:15 — 30 minutes late
    // against its own new slot, so dinner follows by 30, not by 2h15.
    const given = new Map([[1, at(15, 15)]])
    const moved = new Map([[1, at(14, 45)]])
    expect(adjustedMealTimes(TIMES, DAY, given, moved)).toEqual([at(7, 0), at(15, 15), at(19, 30)])
  })
})

describe('daily totals', () => {
  it('divides the day into servings', () => {
    expect(perMealGrams(300, 3)).toBe(100)
    expect(perMealGrams(250, 3)).toBeCloseTo(83.333, 3)
  })

  it('sums grams across foods', () => {
    expect(planDailyGrams([item('premiere', 180), item('applaws', 120)])).toBe(300)
  })

  it('prices the day from each food', () => {
    const kcal = planDailyKcal([item('premiere', 180), item('applaws', 120)], kcalPerGram)
    expect(kcal).toBeCloseTo(180 * PREMIERE + 120 * APPLAWS, 6)
  })

  // A food deleted out from under a plan must not silently inflate the total.
  it('ignores an item whose food is gone', () => {
    expect(planDailyKcal([item('vanished', 300)], kcalPerGram)).toBe(0)
  })
})

describe('mealComposition', () => {
  it('is one line per food', () => {
    expect(
      mealComposition({ mealsPerDay: 3 }, [item('premiere', 180), item('applaws', 120)]),
    ).toEqual([
      { foodId: 'premiere', name: 'premiere', grams: 60 },
      { foodId: 'applaws', name: 'applaws', grams: 40 },
    ])
  })

  it('leaves grams unrounded so a day of servings still sums to the plan', () => {
    const lines = mealComposition({ mealsPerDay: 3 }, [item('premiere', 250)])
    expect(lines[0]?.grams).toBeCloseTo(83.333, 3)
  })
})

describe('planTargetRatio and isOutgrown', () => {
  it('is the plan as a share of the target', () => {
    expect(planTargetRatio(288, 288)).toBe(1)
    expect(planTargetRatio(259, 287)).toBeCloseTo(0.902, 3)
  })

  it('is null until a target exists', () => {
    expect(planTargetRatio(288, null)).toBeNull()
    expect(planTargetRatio(288, 0)).toBeNull()
  })

  it('flags a plan the cat has grown out of', () => {
    expect(isOutgrown(259, 287)).toBe(true)
    expect(isOutgrown(288, 287)).toBe(false)
  })

  it('flags overfeeding just as readily', () => {
    expect(isOutgrown(340, 287)).toBe(true)
  })

  it('says nothing without a target', () => {
    expect(isOutgrown(288, null)).toBe(false)
  })
})

describe('roundToStep', () => {
  it('rounds to whole spoonfuls', () => {
    expect(roundToStep(83.3)).toBe(85)
    expect(roundToStep(82)).toBe(80)
    expect(roundToStep(83.3, 1)).toBe(83)
  })
})

describe('scaleItemsToTarget', () => {
  it('scales a plan up to the target and lands on whole servings', () => {
    const scaled = scaleItemsToTarget([item('premiere', 270)], kcalPerGram, 287, 3)
    // 270 g -> 259 kcal; to hit 287 needs ~299 g, i.e. 100 g a meal.
    expect(scaled).toEqual([
      { foodId: 'premiere', foodNameSnapshot: 'premiere', amountPerDayG: 300 },
    ])
  })

  it('keeps the ratio between foods', () => {
    const scaled = scaleItemsToTarget(
      [item('premiere', 180), item('applaws', 120)],
      kcalPerGram,
      526,
      3,
    )
    expect(scaled?.[0]?.amountPerDayG).toBe(360)
    expect(scaled?.[1]?.amountPerDayG).toBe(240)
  })

  it('is null when there is nothing to scale', () => {
    expect(scaleItemsToTarget([], kcalPerGram, 287, 3)).toBeNull()
    expect(scaleItemsToTarget([item('vanished', 300)], kcalPerGram, 287, 3)).toBeNull()
  })
})
