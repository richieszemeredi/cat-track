import { expect } from 'vitest'
import { type Cat, type Food, type Plan, type PlanItem } from '../../src/lib/schemas'

/** Plain-object Plan fixture (post-parse shape: Timestamps already Dates). */
export function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'plan-1',
    effectiveFrom: new Date(2026, 7, 24),
    mealsPerDay: 3,
    firstMealAt: '07:00',
    lastMealAt: '19:00',
    setAtWeightKg: 1.62,
    transition: null,
    note: null,
    createdBy: 'user-1',
    createdAt: new Date(2026, 7, 24),
    ...overrides,
  }
}

export function makePlanItem(overrides: Partial<PlanItem> = {}): PlanItem {
  return {
    id: 'item-1',
    foodId: 'food-1',
    foodNameSnapshot: 'Crunchy Kibble',
    amountPerDayG: 300,
    ...overrides,
  }
}

/** Plain-object Food fixture (post-parse shape: Timestamps already Dates). */
export function makeFood(overrides: Partial<Food> = {}): Food {
  return {
    id: 'food-1',
    name: 'Crunchy Kibble',
    brand: null,
    type: 'dry',
    kcalPerGram: 3.5,
    analysis: null,
    archived: false,
    createdBy: 'user-1',
    createdAt: new Date(2026, 0, 10),
    ...overrides,
  }
}

/** Plain-object Cat fixture (post-parse shape: Timestamps already Dates). */
export function makeCat(overrides: Partial<Cat> = {}): Cat {
  return {
    id: 'cat-9',
    name: 'Pixel',
    birthDate: new Date(2023, 4, 2),
    breed: 'Ragdoll',
    sex: 'female',
    neutered: true,
    neuterDate: new Date(2024, 0, 15),
    idealWeightKg: 4.5,
    lifeStage: 'adult_neutered',
    merMultiplierOverride: 1.1,
    householdId: 'hh-1',
    createdBy: 'user-1',
    createdAt: new Date(2025, 5, 1),
    updatedAt: new Date(2025, 5, 1),
    ...overrides,
  }
}

/**
 * Assert a captured Date is the LOCAL calendar date (at local midnight).
 * The getTime() check catches UTC drift (`new Date('yyyy-MM-dd')` parses as
 * UTC midnight) in any non-UTC timezone, not just negative offsets.
 */
export function expectLocalDate(
  date: Date | null | undefined,
  year: number,
  monthIndex: number,
  day: number,
): void {
  if (date === null || date === undefined) {
    throw new Error('expected a Date but none was captured')
  }
  expect(date.getFullYear()).toBe(year)
  expect(date.getMonth()).toBe(monthIndex)
  expect(date.getDate()).toBe(day)
  expect(date.getTime()).toBe(new Date(year, monthIndex, day).getTime())
}
