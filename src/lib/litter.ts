import { differenceInCalendarDays } from 'date-fns'

/**
 * How often a box wants a full clean-out (all the litter out, box scrubbed)
 * unless it says otherwise. Per box, because litters differ — clumping clay
 * is not tofu or pine pellets — so this is only the starting value.
 */
export const DEFAULT_LITTER_CHANGE_EVERY_WEEKS = 4
/** The longest interval a box may be set to; mirrored in the rules. */
export const MAX_LITTER_CHANGE_EVERY_WEEKS = 52

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
export function litterAge(
  changedAt: Date,
  now: Date,
  everyWeeks: number = DEFAULT_LITTER_CHANGE_EVERY_WEEKS,
): LitterAge {
  const days = Math.max(0, differenceInCalendarDays(now, changedAt))
  return {
    days,
    weeks: Math.floor(days / 7),
    overdue: days >= everyWeeks * 7,
  }
}

/** "1 week", "6 weeks". */
export function weeksLabel(weeks: number): string {
  return `${String(weeks)} ${weeks === 1 ? 'week' : 'weeks'}`
}

/** "Today", "This week", "1 week ago", "5 weeks ago". */
export function litterAgeLabel(age: LitterAge): string {
  if (age.days === 0) return 'Today'
  if (age.weeks === 0) return 'This week'
  return `${weeksLabel(age.weeks)} ago`
}
