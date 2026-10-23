import { describe, expect, it } from 'vitest'
import { LITTER_CHANGE_EVERY_WEEKS, litterAge, litterAgeLabel } from '../../src/lib/litter'

const NOW = new Date(2026, 9, 23, 12, 0)

describe('litterAge', () => {
  it('counts calendar days, not elapsed hours', () => {
    // 23:00 the night before is one calendar day ago at 01:00, though only 2h.
    const age = litterAge(new Date(2026, 9, 22, 23, 0), new Date(2026, 9, 23, 1, 0))
    expect(age.days).toBe(1)
  })

  it('floors days into whole weeks', () => {
    expect(litterAge(new Date(2026, 9, 17), NOW).weeks).toBe(0) // 6 days
    expect(litterAge(new Date(2026, 9, 16), NOW).weeks).toBe(1) // 7 days
    expect(litterAge(new Date(2026, 9, 3), NOW).weeks).toBe(2) // 20 days
  })

  it('reads a future date as today rather than a negative age', () => {
    const age = litterAge(new Date(2026, 10, 5), NOW)
    expect(age).toEqual({ days: 0, weeks: 0, overdue: false })
  })

  it('turns overdue on the day the interval is reached, not before', () => {
    const interval = LITTER_CHANGE_EVERY_WEEKS * 7
    const dayBefore = new Date(2026, 9, 23 - (interval - 1))
    const onTheDay = new Date(2026, 9, 23 - interval)
    expect(litterAge(dayBefore, NOW).overdue).toBe(false)
    expect(litterAge(onTheDay, NOW).overdue).toBe(true)
  })

  it('counts correctly across a daylight-saving change', () => {
    // 2026-10-25 is when Europe turns the clocks back; a 25-hour day must
    // still be one calendar day.
    const age = litterAge(new Date(2026, 9, 24, 12, 0), new Date(2026, 9, 26, 12, 0))
    expect(age.days).toBe(2)
  })
})

describe('litterAgeLabel', () => {
  it('names the day, the week, then counts weeks', () => {
    expect(litterAgeLabel({ days: 0, weeks: 0, overdue: false })).toBe('Today')
    expect(litterAgeLabel({ days: 4, weeks: 0, overdue: false })).toBe('This week')
    expect(litterAgeLabel({ days: 9, weeks: 1, overdue: false })).toBe('1 week ago')
    expect(litterAgeLabel({ days: 37, weeks: 5, overdue: true })).toBe('5 weeks ago')
  })
})
