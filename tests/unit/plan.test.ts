import { describe, expect, it } from 'vitest'
import {
  isMealTime,
  isOutgrown,
  isTransitionComplete,
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
  type PlanTransition,
} from '../../src/lib/plan'

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

describe('transitionProgress', () => {
  const startedOn = new Date(2026, 7, 24)

  function switchOver(steps: number, unit: 'meal' | 'day'): PlanTransition {
    return {
      fromFoodId: 'applaws',
      fromFoodNameSnapshot: 'Applaws Chicken',
      toFoodId: 'premiere',
      steps,
      unit,
      startedOn,
    }
  }

  it('ramps a four-day switch 25 / 50 / 75 / 100', () => {
    const transition = switchOver(4, 'day')
    const shares = [0, 1, 2, 3].map((offset) =>
      transitionProgressOn(transition, new Date(2026, 7, 24 + offset)),
    )
    expect(shares).toEqual([0.25, 0.5, 0.75, 1])
  })

  it('stays at 1 once the ramp is over', () => {
    const transition = switchOver(4, 'day')
    expect(transitionProgressOn(transition, new Date(2026, 7, 30))).toBe(1)
  })

  it('ramps per meal when the switch is measured in meals', () => {
    const transition = switchOver(2, 'meal')
    expect(
      mealComposition({ mealsPerDay: 3, transition }, [item('premiere', 300)], startedOn, 0),
    ).toEqual([
      { foodId: 'applaws', name: 'Applaws Chicken', grams: 50 },
      { foodId: 'premiere', name: 'premiere', grams: 50 },
    ])
    // Second meal of the same day completes a two-meal switch.
    expect(
      mealComposition({ mealsPerDay: 3, transition }, [item('premiere', 300)], startedOn, 1),
    ).toEqual([{ foodId: 'premiere', name: 'premiere', grams: 100 }])
  })

  it('is all-old before the switch starts', () => {
    const transition = switchOver(4, 'day')
    expect(transitionProgressOn(transition, new Date(2026, 7, 23))).toBe(0)
  })

  function transitionProgressOn(transition: PlanTransition, day: Date): number {
    const lines = mealComposition({ mealsPerDay: 1, transition }, [item('premiere', 100)], day, 0)
    const target = lines.find((line) => line.foodId === 'premiere')
    return (target?.grams ?? 0) / 100
  }
})

describe('isTransitionComplete', () => {
  const transition: PlanTransition = {
    fromFoodId: 'applaws',
    fromFoodNameSnapshot: 'Applaws Chicken',
    toFoodId: 'premiere',
    steps: 4,
    unit: 'day',
    startedOn: new Date(2026, 7, 24),
  }

  it('is false while the ramp is running', () => {
    expect(isTransitionComplete(transition, 3, new Date(2026, 7, 26))).toBe(false)
  })

  it('is true from the last day onwards', () => {
    expect(isTransitionComplete(transition, 3, new Date(2026, 7, 27))).toBe(true)
    expect(isTransitionComplete(transition, 3, new Date(2026, 8, 1))).toBe(true)
  })
})

describe('mealComposition', () => {
  const day = new Date(2026, 7, 25)

  it('is one line per food when nothing is in transition', () => {
    expect(
      mealComposition(
        { mealsPerDay: 3, transition: null },
        [item('premiere', 180), item('applaws', 120)],
        day,
        0,
      ),
    ).toEqual([
      { foodId: 'premiere', name: 'premiere', grams: 60 },
      { foodId: 'applaws', name: 'applaws', grams: 40 },
    ])
  })

  it('splits the targeted item into outgoing and incoming, outgoing first', () => {
    const transition: PlanTransition = {
      fromFoodId: 'applaws',
      fromFoodNameSnapshot: 'Applaws Chicken',
      toFoodId: 'premiere',
      steps: 4,
      unit: 'day',
      startedOn: new Date(2026, 7, 24),
    }
    // Day two of four: half and half.
    expect(
      mealComposition({ mealsPerDay: 3, transition }, [item('premiere', 300)], day, 0),
    ).toEqual([
      { foodId: 'applaws', name: 'Applaws Chicken', grams: 50 },
      { foodId: 'premiere', name: 'premiere', grams: 50 },
    ])
  })

  it('leaves every other item alone', () => {
    const transition: PlanTransition = {
      fromFoodId: 'gone',
      fromFoodNameSnapshot: 'Old Flavour',
      toFoodId: 'premiere',
      steps: 4,
      unit: 'day',
      startedOn: new Date(2026, 7, 24),
    }
    const lines = mealComposition(
      { mealsPerDay: 2, transition },
      [item('premiere', 200), item('applaws', 100)],
      day,
      0,
    )
    expect(lines).toHaveLength(3)
    expect(lines[2]).toEqual({ foodId: 'applaws', name: 'applaws', grams: 50 })
  })

  it('leaves grams unrounded so a day of servings still sums to the plan', () => {
    const lines = mealComposition(
      { mealsPerDay: 3, transition: null },
      [item('premiere', 250)],
      day,
      0,
    )
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
