import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LITTER_CHANGE_EVERY_WEEKS,
  daysAgoLabel,
  daysAheadLabel,
  lastSwapLine,
  litterAge,
  litterFoldSummary,
  nextSwapLine,
  overdueLabel,
  weeksLabel,
} from '../../src/lib/litter'

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
    const interval = DEFAULT_LITTER_CHANGE_EVERY_WEEKS * 7
    const dayBefore = new Date(2026, 9, 23 - (interval - 1))
    const onTheDay = new Date(2026, 9, 23 - interval)
    expect(litterAge(dayBefore, NOW).overdue).toBe(false)
    expect(litterAge(onTheDay, NOW).overdue).toBe(true)
  })

  it("uses the box's own interval", () => {
    const twentyDaysAgo = new Date(2026, 9, 3)
    expect(litterAge(twentyDaysAgo, NOW, 2).overdue).toBe(true) // 14-day litter
    expect(litterAge(twentyDaysAgo, NOW, 3).overdue).toBe(false) // 21-day litter
    expect(litterAge(twentyDaysAgo, NOW, 3).days).toBe(20)
  })

  it('counts correctly across a daylight-saving change', () => {
    // 2026-10-25 is when Europe turns the clocks back; a 25-hour day must
    // still be one calendar day.
    const age = litterAge(new Date(2026, 9, 24, 12, 0), new Date(2026, 9, 26, 12, 0))
    expect(age.days).toBe(2)
  })
})

describe('weeksLabel', () => {
  it('pluralises', () => {
    expect(weeksLabel(1)).toBe('1 week')
    expect(weeksLabel(6)).toBe('6 weeks')
  })
})

describe('daysAgoLabel', () => {
  it('names the day, counts days for a week, then floors to weeks', () => {
    expect(daysAgoLabel(0)).toBe('today')
    expect(daysAgoLabel(1)).toBe('yesterday')
    expect(daysAgoLabel(6)).toBe('6 days ago')
    expect(daysAgoLabel(7)).toBe('1 week ago')
    expect(daysAgoLabel(13)).toBe('1 week ago')
    expect(daysAgoLabel(23)).toBe('3 weeks ago')
  })
})

describe('daysAheadLabel', () => {
  it('names the day, counts days for a fortnight, then floors to weeks', () => {
    expect(daysAheadLabel(0)).toBe('today')
    expect(daysAheadLabel(1)).toBe('tomorrow')
    expect(daysAheadLabel(5)).toBe('in 5 days')
    expect(daysAheadLabel(13)).toBe('in 13 days')
    expect(daysAheadLabel(14)).toBe('in 2 weeks')
    expect(daysAheadLabel(27)).toBe('in 3 weeks')
  })
})

describe('overdueLabel', () => {
  it('counts days for a fortnight, then floors to weeks', () => {
    expect(overdueLabel(1)).toBe('1 day overdue')
    expect(overdueLabel(13)).toBe('13 days overdue')
    expect(overdueLabel(14)).toBe('2 weeks overdue')
    expect(overdueLabel(22)).toBe('3 weeks overdue')
  })
})

describe('lastSwapLine', () => {
  it('gives the date and how long ago, in calendar days', () => {
    expect(lastSwapLine(new Date(2026, 9, 23, 18, 0), NOW)).toBe('Last swap · Oct 23 · today')
    expect(lastSwapLine(new Date(2026, 9, 22, 23, 0), NOW)).toBe('Last swap · Oct 22 · yesterday')
    expect(lastSwapLine(new Date(2026, 9, 2), NOW)).toBe('Last swap · Oct 2 · 3 weeks ago')
  })

  it('reads a future date as today', () => {
    expect(lastSwapLine(new Date(2026, 10, 5), NOW)).toBe('Last swap · Nov 5 · today')
  })
})

describe('nextSwapLine', () => {
  const today = new Date(2026, 10, 15, 9, 30)
  const box = (lastChangedAt: Date, changeEveryWeeks = 4) => ({
    lastChangedAt,
    changeEveryWeeks,
    bagsPerSwap: 1,
  })

  it('gives the date it is due and how far off', () => {
    expect(nextSwapLine(box(new Date(2026, 9, 23)), today)).toEqual({
      text: 'Next swap · Nov 20 · in 5 days',
      due: false,
    })
    expect(nextSwapLine(box(new Date(2026, 9, 19)), today).text).toBe(
      'Next swap · Nov 16 · tomorrow',
    )
    expect(nextSwapLine(box(today, 6), today).text).toBe('Next swap · Dec 27 · in 6 weeks')
  })

  it('is due on the day itself, as litterAge turns overdue', () => {
    const onTheDay = box(new Date(2026, 9, 18, 22, 0))
    expect(nextSwapLine(onTheDay, today)).toEqual({ text: 'Next swap · Nov 15 · today', due: true })
    expect(litterAge(onTheDay.lastChangedAt, today).overdue).toBe(true)
  })

  it('says when it was due and by how much once past it', () => {
    expect(nextSwapLine(box(new Date(2026, 9, 16)), today)).toEqual({
      text: 'Next swap · was due Nov 13 · 2 days overdue',
      due: true,
    })
    expect(nextSwapLine(box(new Date(2026, 8, 20)), today).text).toBe(
      'Next swap · was due Oct 18 · 4 weeks overdue',
    )
  })
})

describe('litterFoldSummary', () => {
  const today = new Date(2026, 10, 15)
  const box = (location: string, lastChangedAt: Date, changeEveryWeeks = 4) => ({
    location,
    lastChangedAt,
    changeEveryWeeks,
    bagsPerSwap: 1,
  })

  it('says so when there are no boxes', () => {
    expect(litterFoldSummary([], today)).toBe('none yet')
  })

  it('names the next swap when nothing is due', () => {
    expect(
      litterFoldSummary(
        [box('Bathroom', new Date(2026, 10, 15)), box('Hallway', new Date(2026, 9, 23))],
        today,
      ),
    ).toBe('next swap Nov 20')
  })

  it('names an overdue box, or counts several', () => {
    const old = box('Hallway', new Date(2026, 9, 1))
    expect(litterFoldSummary([old, box('Bathroom', today)], today)).toBe('Hallway due')
    expect(litterFoldSummary([old, box('Bathroom', new Date(2026, 8, 1))], today)).toBe(
      '2 boxes due',
    )
  })
})
