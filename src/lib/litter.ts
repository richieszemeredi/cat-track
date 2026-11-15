import { differenceInCalendarDays, format } from 'date-fns'
import { litterBoxDueOn, type LitterBoxLike } from './stock'

/**
 * How often a box wants a full clean-out (all the litter out, box scrubbed)
 * unless it says otherwise. Per box, because litters differ — clumping clay
 * is not tofu or pine pellets — so this is only the starting value.
 */
export const DEFAULT_LITTER_CHANGE_EVERY_WEEKS = 4
/** The longest interval a box may be set to; mirrored in the rules. */
export const MAX_LITTER_CHANGE_EVERY_WEEKS = 52

/** Bags of litter one full swap of a box takes, unless it says otherwise. */
export const DEFAULT_BAGS_PER_SWAP = 1
/** The most a box may be set to; mirrored in the rules. */
export const MAX_BAGS_PER_SWAP = 20

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

/** Short date, as the rest of the app writes one: "Nov 20". */
function shortDate(date: Date | number): string {
  return format(date, 'MMM d')
}

/** "today", "yesterday", "4 days ago", then floored weeks: "3 weeks ago". */
export function daysAgoLabel(days: number): string {
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${String(days)} days ago`
  return `${weeksLabel(Math.floor(days / 7))} ago`
}

/** "today", "tomorrow", "in 5 days" up to a fortnight, then "in 3 weeks". */
export function daysAheadLabel(days: number): string {
  if (days <= 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days < 14) return `in ${String(days)} days`
  return `in ${weeksLabel(Math.floor(days / 7))}`
}

/** "1 day overdue", "9 days overdue", then floored weeks: "2 weeks overdue". */
export function overdueLabel(days: number): string {
  if (days < 14) return `${String(days)} ${days === 1 ? 'day' : 'days'} overdue`
  return `${weeksLabel(Math.floor(days / 7))} overdue`
}

/** "Last swap · Oct 23 · 3 weeks ago". Calendar days, like `litterAge`. */
export function lastSwapLine(changedAt: Date, today: Date): string {
  const days = Math.max(0, differenceInCalendarDays(today, changedAt))
  return `Last swap · ${shortDate(changedAt)} · ${daysAgoLabel(days)}`
}

export interface NextSwap {
  text: string
  /** Due today or earlier — the same day `litterAge` turns overdue. */
  due: boolean
}

/**
 * "Next swap · Nov 20 · in 5 days"; on the day, "Next swap · Nov 15 · today";
 * past it, "Next swap · was due Nov 13 · 2 days overdue".
 */
export function nextSwapLine(box: LitterBoxLike, today: Date): NextSwap {
  const dueOn = litterBoxDueOn(box)
  const days = differenceInCalendarDays(dueOn, today)
  if (days < 0) {
    return { text: `Next swap · was due ${shortDate(dueOn)} · ${overdueLabel(-days)}`, due: true }
  }
  return { text: `Next swap · ${shortDate(dueOn)} · ${daysAheadLabel(days)}`, due: days === 0 }
}

/**
 * The one-line state of the household's boxes, for a closed fold: what is due
 * if anything is, otherwise when the next swap comes round.
 */
export function litterFoldSummary(
  boxes: readonly (LitterBoxLike & { location: string })[],
  today: Date,
): string {
  if (boxes.length === 0) return 'none yet'
  const overdue = boxes.filter(
    (box) => litterAge(box.lastChangedAt, today, box.changeEveryWeeks).overdue,
  )
  const [onlyOverdue] = overdue
  if (overdue.length === 1 && onlyOverdue !== undefined) return `${onlyOverdue.location} due`
  if (overdue.length > 1) return `${String(overdue.length)} boxes due`
  const next = Math.min(...boxes.map((box) => litterBoxDueOn(box).getTime()))
  return `next swap ${shortDate(next)}`
}
