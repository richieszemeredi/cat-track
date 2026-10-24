import { differenceInCalendarDays, differenceInHours } from 'date-fns'

/**
 * How long a bowl of water may stand before it wants refilling. Fixed rather
 * than per bowl: unlike a litter, there is no water that keeps longer, and
 * "a day" is the figure everyone already works to.
 */
export const WATER_STALE_AFTER_HOURS = 24

export interface WaterAge {
  /** Whole elapsed hours since the last change; never negative. */
  hours: number
  overdue: boolean
}

/**
 * Age of a bowl's water. Elapsed hours, not calendar days (the opposite of
 * litter): water changed at 23:00 is not "a day old" at 01:00, and one changed
 * at 07:00 is stale by 07:00 the next morning. A time in the future (a clock
 * set wrong) reads as just changed rather than as a negative age.
 */
export function waterAge(changedAt: Date, now: Date): WaterAge {
  const hours = Math.max(0, differenceInHours(now, changedAt))
  return { hours, overdue: hours >= WATER_STALE_AFTER_HOURS }
}

/**
 * "Just now", "5 hours ago", "1 day ago". Past a day it counts calendar days
 * — by then the question is "which morning", not "how many hours".
 */
export function waterAgeLabel(age: WaterAge, changedAt: Date, now: Date): string {
  if (age.hours < 1) return 'Just now'
  if (age.hours < WATER_STALE_AFTER_HOURS) {
    return `${String(age.hours)} ${age.hours === 1 ? 'hour' : 'hours'} ago`
  }
  const days = Math.max(1, differenceInCalendarDays(now, changedAt))
  return `${String(days)} ${days === 1 ? 'day' : 'days'} ago`
}
