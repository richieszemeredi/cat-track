import { differenceInCalendarDays } from 'date-fns'

/**
 * How often a box wants a full clean-out (all the litter out, box scrubbed).
 * One household-wide figure rather than a per-box setting: the question the
 * screen answers is "which one is due", and every box here gets the same
 * routine.
 */
export const LITTER_CHANGE_EVERY_WEEKS = 4

export interface LitterAge {
  /** Whole calendar days since the last full clean; never negative. */
  days: number
  /** Whole weeks of those days — the figure the screen leads with. */
  weeks: number
  overdue: boolean
}

/**
 * Age of a box's last full clean. Calendar days, not elapsed hours: a box
 * changed at 23:00 is "1 day" old at 01:00 the next morning, which is what
 * anyone counting on a calendar would say. A date in the future (a mistyped
 * year, a clock set wrong) reads as today rather than as a negative age.
 */
export function litterAge(changedAt: Date, now: Date): LitterAge {
  const days = Math.max(0, differenceInCalendarDays(now, changedAt))
  return {
    days,
    weeks: Math.floor(days / 7),
    overdue: days >= LITTER_CHANGE_EVERY_WEEKS * 7,
  }
}

/** "Today", "This week", "1 week ago", "5 weeks ago". */
export function litterAgeLabel(age: LitterAge): string {
  if (age.days === 0) return 'Today'
  if (age.weeks === 0) return 'This week'
  return `${String(age.weeks)} ${age.weeks === 1 ? 'week' : 'weeks'} ago`
}
