import { describe, expect, it } from 'vitest'
import { dayRange } from '../../src/lib/dates'

describe('dayRange', () => {
  it('starts at local midnight (00:00:00.000) of the containing day', () => {
    const { start } = dayRange(new Date(2026, 0, 15, 13, 45, 30, 123))
    expect(start.getFullYear()).toBe(2026)
    expect(start.getMonth()).toBe(0)
    expect(start.getDate()).toBe(15)
    expect(start.getHours()).toBe(0)
    expect(start.getMinutes()).toBe(0)
    expect(start.getSeconds()).toBe(0)
    expect(start.getMilliseconds()).toBe(0)
  })

  it('ends at local midnight of the next day', () => {
    const { end } = dayRange(new Date(2026, 0, 15, 13, 45, 30, 123))
    expect(end.getFullYear()).toBe(2026)
    expect(end.getMonth()).toBe(0)
    expect(end.getDate()).toBe(16)
    expect(end.getHours()).toBe(0)
    expect(end.getMinutes()).toBe(0)
    expect(end.getSeconds()).toBe(0)
    expect(end.getMilliseconds()).toBe(0)
  })

  it('spans exactly 24 hours on a normal (non-DST-shift) day', () => {
    // Mid-January is not a DST transition day in any common timezone.
    const { start, end } = dayRange(new Date(2026, 0, 15, 8, 30))
    expect(end.getTime() - start.getTime()).toBe(86400000)
  })

  it('treats the range as [start, end): the input instant is inside it', () => {
    const date = new Date(2026, 0, 15, 23, 59, 59, 999)
    const { start, end } = dayRange(date)
    expect(start.getTime()).toBeLessThanOrEqual(date.getTime())
    expect(date.getTime()).toBeLessThan(end.getTime())
    // The exclusive end is the first instant of the NEXT day, so a feeding
    // logged exactly at next midnight falls outside this range.
    expect(dayRange(end).start.getTime()).toBe(end.getTime())
  })

  it('keeps an exact-midnight input as its own start', () => {
    const midnight = new Date(2026, 0, 15, 0, 0, 0, 0)
    const { start } = dayRange(midnight)
    expect(start.getTime()).toBe(midnight.getTime())
  })

  it('normalizes a 23:59:59.999 input to the same day start as an early-morning input', () => {
    const lateNight = dayRange(new Date(2026, 0, 15, 23, 59, 59, 999))
    const earlyMorning = dayRange(new Date(2026, 0, 15, 0, 0, 0, 1))
    expect(lateNight.start.getTime()).toBe(earlyMorning.start.getTime())
    expect(lateNight.end.getTime()).toBe(earlyMorning.end.getTime())
  })

  it('rolls over month and year boundaries', () => {
    const { start, end } = dayRange(new Date(2025, 11, 31, 18, 15))
    expect(start.getFullYear()).toBe(2025)
    expect(start.getMonth()).toBe(11)
    expect(start.getDate()).toBe(31)
    expect(end.getFullYear()).toBe(2026)
    expect(end.getMonth()).toBe(0)
    expect(end.getDate()).toBe(1)
    expect(end.getHours()).toBe(0)
  })
})
