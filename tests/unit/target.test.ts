import { describe, expect, it } from 'vitest'
import { mer, rer } from '../../src/lib/catmath'
import { type Cat } from '../../src/lib/schemas'
import { dailyKcalTarget, effectiveLifeStage, sumGrams, sumKcal } from '../../src/lib/target'

// Fixed "now" so tests never depend on the wall clock.
const NOW = new Date(2026, 0, 15)

function makeCat(overrides: Partial<Cat> = {}): Cat {
  return {
    id: 'cat-1',
    name: 'Whiskers',
    // 24 calendar months old at NOW -> adult by age.
    birthDate: new Date(2024, 0, 15),
    breed: null,
    sex: 'female',
    neutered: true,
    neuterDate: null,
    idealWeightKg: null,
    lifeStage: null,
    merMultiplierOverride: null,
    householdId: 'hh-1',
    createdBy: 'user-1',
    createdAt: new Date(2025, 0, 1),
    updatedAt: new Date(2025, 0, 1),
    ...overrides,
  }
}

describe('effectiveLifeStage', () => {
  it('prefers an explicitly set life stage over the age-derived one', () => {
    expect(effectiveLifeStage(makeCat({ lifeStage: 'senior' }), NOW)).toBe('senior')
    expect(effectiveLifeStage(makeCat({ lifeStage: 'weight_loss' }), NOW)).toBe('weight_loss')
  })

  it('keeps an explicit kitten stage even for an adult-aged cat', () => {
    expect(effectiveLifeStage(makeCat({ lifeStage: 'kitten_0_4' }), NOW)).toBe('kitten_0_4')
  })

  it('derives adult_neutered from age for a neutered cat without an explicit stage', () => {
    expect(effectiveLifeStage(makeCat(), NOW)).toBe('adult_neutered')
  })

  it('derives adult_intact from age for an intact cat without an explicit stage', () => {
    expect(effectiveLifeStage(makeCat({ neutered: false }), NOW)).toBe('adult_intact')
  })

  it('derives kitten stages from age', () => {
    expect(effectiveLifeStage(makeCat({ birthDate: new Date(2025, 10, 20) }), NOW)).toBe(
      'kitten_0_4',
    )
    expect(effectiveLifeStage(makeCat({ birthDate: new Date(2025, 4, 15) }), NOW)).toBe(
      'kitten_4_12',
    )
  })
})

describe('dailyKcalTarget', () => {
  it('returns null when no weight is known', () => {
    expect(dailyKcalTarget(makeCat(), null, NOW)).toBeNull()
  })

  it('returns null for a non-positive weight', () => {
    expect(dailyKcalTarget(makeCat(), 0, NOW)).toBeNull()
    expect(dailyKcalTarget(makeCat(), -2, NOW)).toBeNull()
  })

  it('equals mer() for the derived stage at the latest weight', () => {
    const cat = makeCat()
    expect(dailyKcalTarget(cat, 5, NOW)).toBe(
      mer({
        weightKg: 5,
        lifeStage: 'adult_neutered',
        idealWeightKg: null,
        merMultiplierOverride: null,
      }),
    )
    expect(dailyKcalTarget(cat, 5, NOW)).toBeCloseTo(rer(5) * 1.2, 10)
  })

  it('uses the ideal weight for a weight_loss cat', () => {
    const cat = makeCat({ lifeStage: 'weight_loss', idealWeightKg: 4 })
    expect(dailyKcalTarget(cat, 6, NOW)).toBe(rer(4) * 0.8)
  })

  it('honors the cat merMultiplierOverride', () => {
    const cat = makeCat({ merMultiplierOverride: 1.6 })
    expect(dailyKcalTarget(cat, 5, NOW)).toBeCloseTo(rer(5) * 1.6, 10)
  })

  it('derives a kitten target for a young cat without an explicit stage', () => {
    const kitten = makeCat({ birthDate: new Date(2025, 11, 1) })
    expect(dailyKcalTarget(kitten, 1.2, NOW)).toBeCloseTo(rer(1.2) * 2.5, 10)
  })
})

describe('sumKcal', () => {
  it('returns 0 for an empty list', () => {
    expect(sumKcal([])).toBe(0)
  })

  it('adds up entry kcal values', () => {
    expect(sumKcal([{ kcal: 120.5 }, { kcal: 30 }, { kcal: 0 }])).toBeCloseTo(150.5, 10)
  })
})

describe('sumGrams', () => {
  it('returns 0 for an empty list', () => {
    expect(sumGrams([])).toBe(0)
  })

  it('adds up entry gram amounts', () => {
    expect(sumGrams([{ amountG: 25 }, { amountG: 10.5 }, { amountG: 4 }])).toBeCloseTo(39.5, 10)
  })
})
