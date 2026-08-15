import { describe, expect, it } from 'vitest'
import {
  ageInMonths,
  ageInWeeks,
  ageLabel,
  ageLabelLong,
  analysisSumPct,
  DEFAULT_ADULT_WEIGHT_KG,
  growthBand,
  gramsForKcal,
  kcalForGrams,
  kcalPer100gFromAnalysis,
  kcalPerGramFromAnalysis,
  LIFE_STAGES,
  nfePct,
  lifeStageFromAge,
  MER_MULTIPLIERS,
  mer,
  rer,
  roundGrams,
  roundKcal,
  roundKg,
} from '../../src/lib/catmath'

describe('rer', () => {
  it('computes 70 x kg^0.75 for a 5 kg cat (~234.0 kcal/day)', () => {
    expect(rer(5)).toBeCloseTo(234.06, 1)
    expect(rer(5)).toBe(70 * Math.pow(5, 0.75))
  })

  it('scales with body weight', () => {
    expect(rer(4)).toBeCloseTo(197.99, 1)
    expect(rer(1)).toBeCloseTo(70, 10)
  })

  it('throws RangeError for zero weight', () => {
    expect(() => rer(0)).toThrow(RangeError)
  })

  it('throws RangeError for negative weight', () => {
    expect(() => rer(-3)).toThrow(RangeError)
  })
})

describe('MER_MULTIPLIERS', () => {
  it('defines the expected multiplier for all six life stages', () => {
    expect(MER_MULTIPLIERS).toEqual({
      kitten_0_4: 2.5,
      kitten_4_12: 2.0,
      adult_intact: 1.4,
      adult_neutered: 1.2,
      weight_loss: 0.8,
      senior: 1.2,
    })
  })
})

describe('mer', () => {
  it('computes ~280.9 kcal/day for a 5 kg neutered adult', () => {
    expect(mer({ weightKg: 5, lifeStage: 'adult_neutered' })).toBeCloseTo(280.87, 1)
  })

  it.each(LIFE_STAGES)('applies the %s multiplier to RER at the current weight', (stage) => {
    // weight_loss with no idealWeightKg falls back to the current weight,
    // so this identity holds for every stage.
    expect(mer({ weightKg: 4, lifeStage: stage })).toBe(rer(4) * MER_MULTIPLIERS[stage])
  })

  it('uses the kitten_0_4 multiplier (2.5x) for young kittens', () => {
    expect(mer({ weightKg: 1.5, lifeStage: 'kitten_0_4' })).toBeCloseTo(rer(1.5) * 2.5, 10)
  })

  it('uses the kitten_4_12 multiplier (2.0x) for older kittens', () => {
    expect(mer({ weightKg: 3, lifeStage: 'kitten_4_12' })).toBeCloseTo(rer(3) * 2.0, 10)
  })

  it('computes weight_loss on the ideal weight RER, not the current weight', () => {
    expect(mer({ weightKg: 6, lifeStage: 'weight_loss', idealWeightKg: 4 })).toBe(rer(4) * 0.8)
  })

  it('falls back to the current weight for weight_loss when idealWeightKg is null', () => {
    expect(mer({ weightKg: 6, lifeStage: 'weight_loss', idealWeightKg: null })).toBe(rer(6) * 0.8)
  })

  it('falls back to the current weight for weight_loss when idealWeightKg is omitted', () => {
    expect(mer({ weightKg: 6, lifeStage: 'weight_loss' })).toBe(rer(6) * 0.8)
  })

  it('falls back to the current weight for weight_loss when idealWeightKg is not positive', () => {
    expect(mer({ weightKg: 6, lifeStage: 'weight_loss', idealWeightKg: 0 })).toBe(rer(6) * 0.8)
  })

  it('ignores idealWeightKg for non-weight_loss stages', () => {
    expect(mer({ weightKg: 5, lifeStage: 'adult_neutered', idealWeightKg: 4 })).toBe(rer(5) * 1.2)
  })

  it('prefers merMultiplierOverride over the life-stage default', () => {
    expect(
      mer({ weightKg: 5, lifeStage: 'adult_neutered', merMultiplierOverride: 1.6 }),
    ).toBeCloseTo(rer(5) * 1.6, 10)
  })

  it('applies the override on top of the ideal-weight basis for weight_loss', () => {
    expect(
      mer({ weightKg: 6, lifeStage: 'weight_loss', idealWeightKg: 4, merMultiplierOverride: 0.9 }),
    ).toBeCloseTo(rer(4) * 0.9, 10)
  })

  it('uses the stage default when merMultiplierOverride is null', () => {
    expect(mer({ weightKg: 5, lifeStage: 'senior', merMultiplierOverride: null })).toBe(
      rer(5) * 1.2,
    )
  })
})

describe('kcalForGrams', () => {
  it('multiplies grams by energy density', () => {
    expect(kcalForGrams(50, 3.5)).toBeCloseTo(175, 10)
  })

  it('returns 0 for zero grams', () => {
    expect(kcalForGrams(0, 3.5)).toBe(0)
  })

  it('throws RangeError for negative grams', () => {
    expect(() => kcalForGrams(-1, 3.5)).toThrow(RangeError)
  })

  it('throws RangeError for negative kcalPerGram', () => {
    expect(() => kcalForGrams(50, -0.5)).toThrow(RangeError)
  })
})

describe('gramsForKcal', () => {
  it('divides kcal by energy density', () => {
    expect(gramsForKcal(175, 3.5)).toBeCloseTo(50, 10)
  })

  it('returns 0 for zero kcal', () => {
    expect(gramsForKcal(0, 3.5)).toBe(0)
  })

  it('throws RangeError when kcalPerGram is 0', () => {
    expect(() => gramsForKcal(100, 0)).toThrow(RangeError)
  })

  it('throws RangeError when kcalPerGram is negative', () => {
    expect(() => gramsForKcal(100, -2)).toThrow(RangeError)
  })

  it('throws RangeError for negative kcal', () => {
    expect(() => gramsForKcal(-10, 3.5)).toThrow(RangeError)
  })

  it('round-trips grams -> kcal -> grams', () => {
    expect(gramsForKcal(kcalForGrams(85, 3.6), 3.6)).toBeCloseTo(85, 10)
  })

  it('round-trips kcal -> grams -> kcal', () => {
    expect(kcalForGrams(gramsForKcal(200, 4.2), 4.2)).toBeCloseTo(200, 10)
  })
})

describe('ageInMonths', () => {
  it('returns whole elapsed months between birth and now', () => {
    expect(ageInMonths(new Date(2025, 0, 15), new Date(2026, 0, 15))).toBe(12)
    expect(ageInMonths(new Date(2025, 7, 10), new Date(2026, 0, 10))).toBe(5)
  })

  it('counts full elapsed months, not calendar-month index flips', () => {
    // Born Sep 25, on Jan 2 the kitten is ~3.2 months old — the old
    // differenceInCalendarMonths behavior would have said 4.
    expect(ageInMonths(new Date(2025, 8, 25), new Date(2026, 0, 2))).toBe(3)
    expect(ageInMonths(new Date(2025, 8, 25), new Date(2026, 0, 25))).toBe(4)
  })

  it('returns 0 within the birth month', () => {
    expect(ageInMonths(new Date(2026, 0, 1), new Date(2026, 0, 28))).toBe(0)
  })

  it('clamps future birth dates to 0 instead of going negative', () => {
    expect(ageInMonths(new Date(2026, 2, 15), new Date(2026, 0, 15))).toBe(0)
  })
})

describe('ageInWeeks', () => {
  it('counts whole weeks since birth', () => {
    expect(ageInWeeks(new Date(2026, 0, 1), new Date(2026, 0, 22))).toBe(3)
    expect(ageInWeeks(new Date(2026, 0, 1), new Date(2026, 0, 27))).toBe(3)
  })

  it('clamps a future birth date to 0', () => {
    expect(ageInWeeks(new Date(2026, 5, 1), new Date(2026, 0, 15))).toBe(0)
  })
})

describe('ageLabel', () => {
  it('renders weeks for a young kitten', () => {
    expect(ageLabel(new Date(2026, 0, 1), new Date(2026, 0, 22))).toBe('3 wk')
  })

  it('renders 0 wk on the day of birth', () => {
    expect(ageLabel(new Date(2026, 0, 15), new Date(2026, 0, 15))).toBe('0 wk')
  })

  it('clamps a future birth date to 0 wk', () => {
    expect(ageLabel(new Date(2026, 5, 1), new Date(2026, 0, 15))).toBe('0 wk')
  })

  // Weeks stay useful far longer than 8 weeks — "3 mo" hides the difference
  // between a 13- and a 17-week kitten, which is exactly when it matters.
  it('still renders weeks at 25 weeks', () => {
    // Jan 1 -> Jun 24 is 174 days = 24 weeks and 6 days.
    expect(ageLabel(new Date(2026, 0, 1), new Date(2026, 5, 24))).toBe('24 wk')
  })

  it('switches to months at 26 weeks', () => {
    // Jan 1 -> Jul 2 is 182 days = exactly 26 weeks.
    expect(ageLabel(new Date(2026, 0, 1), new Date(2026, 6, 2))).toBe('6 mo')
  })

  it('renders months under a year', () => {
    expect(ageLabel(new Date(2025, 2, 10), new Date(2026, 0, 10))).toBe('10 mo')
  })

  it('renders whole years without a month remainder', () => {
    expect(ageLabel(new Date(2025, 0, 15), new Date(2026, 0, 15))).toBe('1 yr')
  })

  it('renders years with a month remainder', () => {
    expect(ageLabel(new Date(2024, 10, 15), new Date(2026, 0, 15))).toBe('1 yr 2 mo')
  })
})

describe('ageLabelLong', () => {
  it('spells out weeks for a kitten, singular at one week', () => {
    expect(ageLabelLong(new Date(2026, 0, 1), new Date(2026, 0, 22))).toBe('3 weeks old')
    expect(ageLabelLong(new Date(2026, 0, 1), new Date(2026, 0, 8))).toBe('1 week old')
  })

  it('spells out months past the weeks cutoff', () => {
    expect(ageLabelLong(new Date(2026, 0, 1), new Date(2026, 6, 2))).toBe('6 months old')
  })

  it('spells out years, with and without a month remainder', () => {
    expect(ageLabelLong(new Date(2025, 0, 15), new Date(2026, 0, 15))).toBe('1 year old')
    expect(ageLabelLong(new Date(2024, 10, 15), new Date(2026, 0, 15))).toBe('1 year 2 months old')
  })
})

describe('lifeStageFromAge', () => {
  it('is kitten_0_4 just under 4 calendar months (~3.9 months old)', () => {
    // Born Jan 1, now Apr 29 — 3 calendar months, nearly 4 real months.
    expect(lifeStageFromAge(new Date(2026, 0, 1), new Date(2026, 3, 29), true)).toBe('kitten_0_4')
  })

  it('is kitten_4_12 at exactly 4 months', () => {
    expect(lifeStageFromAge(new Date(2026, 0, 15), new Date(2026, 4, 15), true)).toBe('kitten_4_12')
  })

  it('is kitten_4_12 at 11 months', () => {
    expect(lifeStageFromAge(new Date(2025, 1, 10), new Date(2026, 0, 10), false)).toBe(
      'kitten_4_12',
    )
  })

  it('is adult_neutered at 12 months when neutered', () => {
    expect(lifeStageFromAge(new Date(2025, 0, 15), new Date(2026, 0, 15), true)).toBe(
      'adult_neutered',
    )
  })

  it('is adult_intact at 12 months when intact', () => {
    expect(lifeStageFromAge(new Date(2025, 0, 15), new Date(2026, 0, 15), false)).toBe(
      'adult_intact',
    )
  })
})

describe('growthBand', () => {
  it('expects birth weight (0.12 kg) at age 0', () => {
    const band = growthBand(0)
    expect(band.expectedKg).toBe(0.12)
    expect(band.lowKg).toBeCloseTo(0.096, 10)
    expect(band.highKg).toBeCloseTo(0.144, 10)
  })

  it('treats negative ages like age 0', () => {
    expect(growthBand(-2).expectedKg).toBe(0.12)
  })

  it('expects 75% of adult weight at 6 months', () => {
    expect(growthBand(6).expectedKg).toBeCloseTo(0.75 * DEFAULT_ADULT_WEIGHT_KG, 10)
  })

  it('reaches adult weight at 12 months', () => {
    expect(growthBand(12).expectedKg).toBeCloseTo(DEFAULT_ADULT_WEIGHT_KG, 10)
  })

  it('plateaus at adult weight after 12 months', () => {
    expect(growthBand(24).expectedKg).toBe(DEFAULT_ADULT_WEIGHT_KG)
  })

  it('interpolates linearly between birth and 6 months', () => {
    // Halfway to 6 months: 0.12 + (3.0 - 0.12) / 2 = 1.56.
    expect(growthBand(3).expectedKg).toBeCloseTo(1.56, 10)
  })

  it('interpolates linearly between 6 and 12 months', () => {
    // Halfway from 3.0 kg to 4.0 kg.
    expect(growthBand(9).expectedKg).toBeCloseTo(3.5, 10)
  })

  it('sets the band to +-20% of the expected weight', () => {
    const band = growthBand(4.5, 5.5)
    expect(band.lowKg).toBeCloseTo(band.expectedKg * 0.8, 10)
    expect(band.highKg).toBeCloseTo(band.expectedKg * 1.2, 10)
  })

  it('honors a custom adult weight', () => {
    expect(growthBand(6, 5).expectedKg).toBeCloseTo(3.75, 10)
    expect(growthBand(12, 5).expectedKg).toBeCloseTo(5, 10)
    expect(growthBand(24, 5).expectedKg).toBe(5)
  })

  it('defaults to a 4 kg adult when adultWeightKg is null', () => {
    expect(growthBand(24, null).expectedKg).toBe(DEFAULT_ADULT_WEIGHT_KG)
  })

  it('defaults to a 4 kg adult when adultWeightKg is omitted', () => {
    expect(growthBand(24).expectedKg).toBe(DEFAULT_ADULT_WEIGHT_KG)
  })

  it('defaults to a 4 kg adult when adultWeightKg is not positive', () => {
    expect(growthBand(24, 0).expectedKg).toBe(DEFAULT_ADULT_WEIGHT_KG)
    expect(growthBand(24, -1).expectedKg).toBe(DEFAULT_ADULT_WEIGHT_KG)
  })
})

describe('rounding helpers', () => {
  it('roundKcal rounds to whole kcal', () => {
    expect(roundKcal(280.87)).toBe(281)
    expect(roundKcal(234.4)).toBe(234)
    expect(roundKcal(100)).toBe(100)
  })

  it('roundGrams rounds to whole grams', () => {
    expect(roundGrams(12.5)).toBe(13)
    expect(roundGrams(12.49)).toBe(12)
    expect(roundGrams(0)).toBe(0)
  })

  it('roundKg rounds to two decimal places', () => {
    expect(roundKg(4.567)).toBe(4.57)
    expect(roundKg(4.564)).toBe(4.56)
    expect(roundKg(3)).toBe(3)
  })
})

describe('energy from label constituents (modified Atwater)', () => {
  // Premiere Meat Menu Kitten, a Hungarian wet food that declares no kcal:
  // 11% protein, 5.5% fat, 2.2% ash, 0.2% fibre, 78% moisture.
  // NFE = 3.1 -> 3.5*11 + 8.5*5.5 + 3.5*3.1 = 96.1 kcal/100 g.
  const premiereKitten = {
    proteinPct: 11,
    fatPct: 5.5,
    ashPct: 2.2,
    fibrePct: 0.2,
    moisturePct: 78,
  }

  it('is the sanity anchor: the Premiere kitten tin works out to ~96 kcal/100 g', () => {
    expect(nfePct(premiereKitten)).toBeCloseTo(3.1, 6)
    expect(kcalPer100gFromAnalysis(premiereKitten)).toBeCloseTo(96.1, 6)
    expect(kcalPerGramFromAnalysis(premiereKitten)).toBeCloseTo(0.961, 6)
  })

  it('agrees with the same label’s own gram-per-day table', () => {
    // The tin asks for 210-245 g/day at 2-3 months. At ~0.96 kcal/g that is
    // 202-235 kcal/day, which is 3 x RER for a 1.0-1.7 kg kitten - the growth
    // multiplier the label is implicitly using. Two independent routes agreeing
    // is the whole reason this calculation is trustworthy enough to ship.
    const kcalPerGram = kcalPerGramFromAnalysis(premiereKitten)
    expect(210 * kcalPerGram).toBeGreaterThan(3 * rer(1.0) * 0.85)
    expect(245 * kcalPerGram).toBeLessThan(3 * rer(1.7) * 1.15)
  })

  it('lands in the normal range for a dry kibble', () => {
    const kibble = {
      proteinPct: 32,
      fatPct: 16,
      ashPct: 7,
      fibrePct: 2.5,
      moisturePct: 8,
    }
    // 34.5 NFE -> 112 + 136 + 120.75 = 368.75
    expect(kcalPer100gFromAnalysis(kibble)).toBeCloseTo(368.75, 6)
    expect(kcalPerGramFromAnalysis(kibble)).toBeGreaterThan(3)
    expect(kcalPerGramFromAnalysis(kibble)).toBeLessThan(4.5)
  })

  it('clamps carbohydrate at zero when a rounded label sums past 100', () => {
    const rounded = {
      proteinPct: 12,
      fatPct: 6,
      ashPct: 3,
      fibrePct: 0.5,
      moisturePct: 79,
    }
    expect(analysisSumPct(rounded)).toBeCloseTo(100.5, 6)
    expect(nfePct(rounded)).toBe(0)
    // Protein and fat still count; only the leftover term goes to zero.
    expect(kcalPer100gFromAnalysis(rounded)).toBeCloseTo(93, 6)
  })

  it('sums the declared constituents', () => {
    expect(analysisSumPct(premiereKitten)).toBeCloseTo(96.9, 6)
  })
})
