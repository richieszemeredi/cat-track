import { differenceInCalendarDays, format, isSameDay, startOfDay } from 'date-fns'
import { type FeedingInput } from './db'
import { type Feeding } from './schemas'

// "Repeat a previous day" — cats eat the same thing most days, so re-typing
// yesterday's bowls is the single most repetitive thing about the app. Pure
// functions here; the Firestore write lives in db.addFeedings.

export interface PreviousDay {
  /** Local midnight of the day the meals were logged. */
  day: Date
  /** That day's meals, oldest first. */
  feedings: Feeding[]
}

/**
 * The most recent day strictly BEFORE `todayStart` that has meals logged.
 * `feedings` may be in any order; only entries from that one day come back.
 */
export function lastLoggedDay(feedings: readonly Feeding[], todayStart: Date): PreviousDay | null {
  let day: Date | null = null
  for (const feeding of feedings) {
    if (feeding.datetime >= todayStart) continue
    if (day === null || feeding.datetime > day) day = feeding.datetime
  }
  if (day === null) return null

  const dayStart = startOfDay(day)
  const onThatDay = feedings
    .filter((feeding) => isSameDay(feeding.datetime, dayStart))
    .sort((a, b) => a.datetime.getTime() - b.datetime.getTime())

  return { day: dayStart, feedings: onThatDay }
}

/** Same meal, same time of day, on `targetDay`. */
export function repeatOnDay(feeding: Feeding, targetDay: Date): FeedingInput {
  const datetime = startOfDay(targetDay)
  datetime.setHours(feeding.datetime.getHours(), feeding.datetime.getMinutes(), 0, 0)
  return {
    datetime,
    foodId: feeding.foodId,
    foodNameSnapshot: feeding.foodNameSnapshot,
    amountG: feeding.amountG,
    kcal: feeding.kcal,
    note: feeding.note,
  }
}

/** "Today" / "Yesterday" / "Monday" / "Mar 3" — whichever reads fastest. */
export function relativeDayLabel(day: Date, today: Date): string {
  const daysAgo = differenceInCalendarDays(today, day)
  if (daysAgo === 0) return 'Today'
  if (daysAgo === 1) return 'Yesterday'
  if (daysAgo > 1 && daysAgo < 7) return format(day, 'EEEE')
  return format(day, 'MMM d')
}
