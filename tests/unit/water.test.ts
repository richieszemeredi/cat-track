import { describe, expect, it } from 'vitest'
import { WATER_STALE_AFTER_HOURS, waterAge, waterAgeLabel } from '../../src/lib/water'

const NOW = new Date(2026, 9, 23, 12, 0)

function hoursAgo(hours: number): Date {
  return new Date(NOW.getTime() - hours * 3_600_000)
}

describe('waterAge', () => {
  it('counts elapsed hours, not calendar days', () => {
    // 23:00 the night before is only 2h old at 01:00, though a day earlier.
    const age = waterAge(new Date(2026, 9, 22, 23, 0), new Date(2026, 9, 23, 1, 0))
    expect(age).toEqual({ hours: 2, overdue: false })
  })

  it('floors partial hours', () => {
    expect(waterAge(new Date(NOW.getTime() - 90 * 60_000), NOW).hours).toBe(1)
  })

  it('turns overdue exactly when the stale limit is reached', () => {
    expect(waterAge(hoursAgo(WATER_STALE_AFTER_HOURS - 1), NOW).overdue).toBe(false)
    expect(waterAge(hoursAgo(WATER_STALE_AFTER_HOURS), NOW).overdue).toBe(true)
  })

  it('reads a time in the future as just changed', () => {
    expect(waterAge(hoursAgo(-5), NOW)).toEqual({ hours: 0, overdue: false })
  })
})

describe('waterAgeLabel', () => {
  const label = (changedAt: Date) => waterAgeLabel(waterAge(changedAt, NOW), changedAt, NOW)

  it('says "Just now" under an hour', () => {
    expect(label(new Date(NOW.getTime() - 20 * 60_000))).toBe('Just now')
  })

  it('counts hours, singular and plural, within the day', () => {
    expect(label(hoursAgo(1))).toBe('1 hour ago')
    expect(label(hoursAgo(5))).toBe('5 hours ago')
  })

  it('counts calendar days from a day on', () => {
    expect(label(new Date(2026, 9, 22, 11, 0))).toBe('1 day ago') // 25h
    expect(label(new Date(2026, 9, 20, 9, 0))).toBe('3 days ago')
  })
})
