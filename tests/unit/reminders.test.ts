import { describe, expect, it } from 'vitest'
import { dayRange } from '../../src/lib/dates'
import { mealTimes } from '../../src/lib/plan'
import {
  decideReminders,
  dueReminders,
  reminderText,
  remindersAround,
  remindersForDay,
  STALE_AFTER_MINUTES,
  type Reminder,
} from '../../src/lib/reminders'

const DAY = new Date(2026, 8, 7) // 7 September 2026, local time.

function at(hours: number, minutes: number, day = DAY): Date {
  const date = new Date(day)
  date.setHours(hours, minutes, 0, 0)
  return date
}

function ids(reminders: readonly Reminder[]): string[] {
  return reminders.map((reminder) => reminder.id)
}

describe('remindersForDay', () => {
  it('pairs a lead-in and a due reminder for every meal', () => {
    const reminders = remindersForDay(mealTimes(3, '07:00', '19:00'), DAY)

    expect(reminders).toHaveLength(6)
    expect(reminders.map((r) => [r.kind, r.at])).toEqual([
      ['soon', at(6, 45)],
      ['due', at(7, 0)],
      ['soon', at(12, 45)],
      ['due', at(13, 0)],
      ['soon', at(18, 45)],
      ['due', at(19, 0)],
    ])
  })

  it('names the meal, not the moment the reminder fires', () => {
    const [soon, due] = remindersForDay(['07:00'], DAY)

    expect(soon?.mealTime).toBe('07:00')
    expect(soon?.mealAt).toEqual(at(7, 0))
    expect(due?.mealAt).toEqual(at(7, 0))
  })

  it('keys a lead-in that lands the evening before to its own meal', () => {
    // The 00:10 bowl is warned about at 23:55 on the 6th — but it is the 7th's
    // first meal, and must be identified as such or it fires twice.
    const [soon] = remindersForDay(['00:10'], DAY)

    expect(soon?.at).toEqual(at(23, 55, new Date(2026, 8, 6)))
    expect(soon?.id).toBe('2026-09-07:0:soon')
  })

  it('sorts a window that runs past midnight by when each reminder fires', () => {
    // 22:00 / 00:00 / 02:00 all belong to one day here, exactly as the
    // checklist reads them — so in clock order the small hours come first.
    const reminders = remindersForDay(mealTimes(3, '22:00', '02:00'), DAY)

    expect(reminders.map((r) => r.at)).toEqual([
      at(23, 45, new Date(2026, 8, 6)), // lead-in for the 00:00 bowl
      at(0, 0),
      at(1, 45), // lead-in for the 02:00 bowl
      at(2, 0),
      at(21, 45), // lead-in for the 22:00 bowl
      at(22, 0),
    ])
  })

  it('has nothing to remind anyone about without a plan', () => {
    expect(remindersForDay([], DAY)).toEqual([])
  })
})

describe('remindersAround', () => {
  it('spans yesterday to tomorrow, so a lead-in across midnight is never missed', () => {
    const reminders = remindersAround(['07:00'], at(23, 59))

    expect(ids(reminders)).toEqual([
      '2026-09-06:0:soon',
      '2026-09-06:0:due',
      '2026-09-07:0:soon',
      '2026-09-07:0:due',
      '2026-09-08:0:soon',
      '2026-09-08:0:due',
    ])
  })
})

describe('dueReminders', () => {
  const reminders = remindersForDay(['07:00'], DAY)

  it('shows a reminder the moment it comes due', () => {
    expect(ids(dueReminders(reminders, at(7, 0)))).toEqual(['2026-09-07:0:due'])
    expect(ids(dueReminders(reminders, at(6, 45)))).toEqual(['2026-09-07:0:soon'])
  })

  it('says nothing before it is due', () => {
    expect(dueReminders(reminders, at(6, 44))).toEqual([])
  })

  it('still shows one that is a little late', () => {
    expect(ids(dueReminders(reminders, at(7, 0 + STALE_AFTER_MINUTES - 1)))).toEqual([
      '2026-09-07:0:due',
    ])
  })

  it('drops one the app slept through rather than lying about the time', () => {
    // The phone woke at 09:00 holding 06:45's reminder: "feeding in 15
    // minutes" would be two hours wrong.
    expect(dueReminders(reminders, at(9, 0))).toEqual([])
    expect(dueReminders(reminders, at(7, STALE_AFTER_MINUTES))).toEqual([])
  })
})

describe('decideReminders', () => {
  const today = dayRange(DAY)

  function decide(options: {
    now: Date
    shown?: Set<string>
    given?: Set<number>
    times?: string[]
  }) {
    return decideReminders({
      times: options.times ?? mealTimes(3, '07:00', '19:00'),
      now: options.now,
      shown: options.shown ?? new Set(),
      given: options.given ?? new Set(),
      today,
    })
  }

  it('shows a reminder that has come due', () => {
    expect(ids(decide({ now: at(6, 45) }).show)).toEqual(['2026-09-07:0:soon'])
  })

  it('never shows the same reminder twice', () => {
    const first = decide({ now: at(6, 45) })
    expect(first.show).toHaveLength(1)

    // The tick half a minute later must stay quiet.
    const second = decide({ now: at(6, 46), shown: first.seen })
    expect(second.show).toEqual([])
  })

  it('stays quiet about a bowl the other phone already ticked off', () => {
    const decision = decide({ now: at(7, 0), given: new Set([0]) })

    expect(decision.show).toEqual([])
    // Still remembered, so unticking the bowl inside the due window does not
    // make the reminder pop a second time.
    expect(decision.seen.has('2026-09-07:0:due')).toBe(true)
  })

  it('lets an untouched bowl through while another is already fed', () => {
    expect(ids(decide({ now: at(13, 0), given: new Set([0]) }).show)).toEqual(['2026-09-07:1:due'])
  })

  it('does not let a tick today silence tomorrow’s first meal', () => {
    // 23:55 tonight warns about tomorrow's 00:10 bowl. Meal 0 was fed today,
    // but that says nothing about tomorrow's.
    const decision = decideReminders({
      times: ['00:10'],
      now: at(23, 55),
      shown: new Set(),
      given: new Set([0]),
      today,
    })

    expect(ids(decision.show)).toEqual(['2026-09-08:0:soon'])
  })

  it('forgets ids that fall out of the window it reasons about', () => {
    const stale = new Set(['2026-01-01:0:due'])

    expect(decide({ now: at(7, 0), shown: stale }).seen.has('2026-01-01:0:due')).toBe(false)
  })
})

describe('reminderText', () => {
  it('leads with the time left, then names the bowl that is due', () => {
    const spoken = remindersForDay(['07:00'], DAY).map((reminder) => reminderText(reminder, 'Nala'))

    expect(spoken).toEqual([
      { title: 'Feeding in 15 minutes', body: 'Nala eats at 07:00.' },
      { title: 'Feeding time', body: 'Nala’s 07:00 meal.' },
    ])
  })
})
