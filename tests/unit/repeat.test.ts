import { describe, expect, it } from 'vitest'
import { lastLoggedDay, relativeDayLabel, repeatOnDay } from '../../src/lib/repeat'
import { type Feeding } from '../../src/lib/schemas'

function makeFeeding(datetime: Date, overrides: Partial<Feeding> = {}): Feeding {
  return {
    id: `f-${String(datetime.getTime())}`,
    datetime,
    foodId: 'food-1',
    foodNameSnapshot: 'Crunchy Kibble',
    amountG: 40,
    kcal: 140,
    note: null,
    createdBy: 'user-1',
    createdAt: datetime,
    ...overrides,
  }
}

const TODAY_START = new Date(2026, 2, 10) // Tue 10 Mar 2026, local midnight

describe('lastLoggedDay', () => {
  it('returns null when there are no feedings at all', () => {
    expect(lastLoggedDay([], TODAY_START)).toBeNull()
  })

  it('returns null when every feeding is from today', () => {
    const today = [makeFeeding(new Date(2026, 2, 10, 8, 0))]
    expect(lastLoggedDay(today, TODAY_START)).toBeNull()
  })

  it('picks the most recent earlier day and only that day, oldest first', () => {
    const feedings = [
      makeFeeding(new Date(2026, 2, 10, 8, 0)), // today — ignored
      makeFeeding(new Date(2026, 2, 9, 19, 30)),
      makeFeeding(new Date(2026, 2, 9, 7, 15)),
      makeFeeding(new Date(2026, 2, 8, 8, 0)), // older day — ignored
    ]

    const result = lastLoggedDay(feedings, TODAY_START)

    expect(result).not.toBeNull()
    expect(result?.day).toEqual(new Date(2026, 2, 9))
    expect(result?.feedings.map((f) => f.datetime.getHours())).toEqual([7, 19])
  })

  it('skips empty days and reaches back to the last day that has meals', () => {
    const feedings = [makeFeeding(new Date(2026, 2, 5, 12, 0))]

    const result = lastLoggedDay(feedings, TODAY_START)

    expect(result?.day).toEqual(new Date(2026, 2, 5))
    expect(result?.feedings).toHaveLength(1)
  })

  it('treats a feeding at exactly today midnight as today', () => {
    const feedings = [makeFeeding(new Date(2026, 2, 10, 0, 0))]
    expect(lastLoggedDay(feedings, TODAY_START)).toBeNull()
  })
})

describe('repeatOnDay', () => {
  it('keeps the time of day but moves the meal to the target day', () => {
    const source = makeFeeding(new Date(2026, 2, 9, 7, 15), { amountG: 35, kcal: 122.5 })

    const copy = repeatOnDay(source, TODAY_START)

    expect(copy.datetime).toEqual(new Date(2026, 2, 10, 7, 15))
    expect(copy.amountG).toBe(35)
    expect(copy.kcal).toBe(122.5)
    expect(copy.foodId).toBe('food-1')
    expect(copy.foodNameSnapshot).toBe('Crunchy Kibble')
  })

  it('carries the note across', () => {
    const source = makeFeeding(new Date(2026, 2, 9, 20, 0), { note: 'half a pouch' })
    expect(repeatOnDay(source, TODAY_START).note).toBe('half a pouch')
  })

  it('does not mutate the target day', () => {
    const target = new Date(2026, 2, 10, 13, 45)
    repeatOnDay(makeFeeding(new Date(2026, 2, 9, 7, 15)), target)
    expect(target).toEqual(new Date(2026, 2, 10, 13, 45))
  })
})

describe('relativeDayLabel', () => {
  it('names today and yesterday', () => {
    expect(relativeDayLabel(new Date(2026, 2, 10), TODAY_START)).toBe('Today')
    expect(relativeDayLabel(new Date(2026, 2, 9), TODAY_START)).toBe('Yesterday')
  })

  it('uses the weekday name within the last week', () => {
    // 2026-03-06 is a Friday.
    expect(relativeDayLabel(new Date(2026, 2, 6), TODAY_START)).toBe('Friday')
  })

  it('falls back to a short date beyond a week', () => {
    expect(relativeDayLabel(new Date(2026, 1, 20), TODAY_START)).toBe('Feb 20')
  })
})
