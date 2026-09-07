import { addDays, addMinutes, startOfDay } from 'date-fns'
import { type DayRange } from './dates'

// Feeding reminders, as pure math: two per planned meal — one a quarter of an
// hour before the bowl is due, one when it is.
//
// These are LOCAL notifications shown by the running app. There is no server
// to push them from (Spark tier, no Cloud Functions), so nothing here fires
// while the app is closed; use-reminders.tsx owns that limitation and says so
// on screen. Firestore never touches this file.

export const LEAD_MINUTES = 15

/**
 * How late a reminder may still be shown before it is dropped.
 *
 * iOS suspends a backgrounded Home-Screen app and freezes its timers with it,
 * so the app can wake at 09:00 still holding 06:45's reminder. Showing it then
 * would be a lie — "feeding in 15 minutes" about a bowl that was due two hours
 * ago — so a stale reminder is skipped silently rather than fired late.
 */
export const STALE_AFTER_MINUTES = 5

export const REMINDER_KINDS = ['soon', 'due'] as const
export type ReminderKind = (typeof REMINDER_KINDS)[number]

export interface Reminder {
  /** Stable across reloads, so each one is shown once and only once. */
  id: string
  /** When to show it. */
  at: Date
  kind: ReminderKind
  /** Index into the plan's meal times — which bowl this is about. */
  mealIndex: number
  /** When the bowl is due: `at` for 'due', LEAD_MINUTES later for 'soon'. */
  mealAt: Date
  /** The meal's own "HH:mm", which is what the notification names. */
  mealTime: string
}

/** Local calendar day, as an id fragment. */
function dayKey(day: Date): string {
  const month = String(day.getMonth() + 1).padStart(2, '0')
  const date = String(day.getDate()).padStart(2, '0')
  return `${String(day.getFullYear())}-${month}-${date}`
}

function atTimeOn(day: Date, hhmm: string): Date {
  const [hours, minutes] = hhmm.split(':')
  const at = startOfDay(day)
  at.setHours(Number(hours), Number(minutes), 0, 0)
  return at
}

/**
 * Both reminders for every meal `times` implies on `day`, earliest first.
 *
 * A reminder is identified by the day of its MEAL, never the day it fires: the
 * lead-in for a 00:10 bowl lands at 23:55 the evening before, and has to stay
 * "tomorrow's first meal" so it is neither shown twice nor missed entirely.
 * Each "HH:mm" is placed on `day` itself, exactly as the checklist reads a
 * window that runs past midnight (22:00 -> 02:00) as one day's meals.
 */
export function remindersForDay(times: readonly string[], day: Date): Reminder[] {
  const key = dayKey(day)

  return times
    .flatMap((mealTime, mealIndex) => {
      const mealAt = atTimeOn(day, mealTime)
      const shared = { mealIndex, mealAt, mealTime }
      return [
        {
          ...shared,
          id: `${key}:${String(mealIndex)}:soon`,
          at: addMinutes(mealAt, -LEAD_MINUTES),
          kind: 'soon' as const,
        },
        { ...shared, id: `${key}:${String(mealIndex)}:due`, at: mealAt, kind: 'due' as const },
      ]
    })
    .sort((a, b) => a.at.getTime() - b.at.getTime())
}

/**
 * Every reminder that could plausibly be due around `now`.
 *
 * Spans yesterday to tomorrow because a lead-in can fall on the previous
 * calendar day and a plan's window can cross midnight; `dueReminders` does the
 * actual narrowing. At six meals a day that is 36 candidates — cheap enough to
 * rebuild on every tick rather than cache and invalidate.
 */
export function remindersAround(times: readonly string[], now: Date): Reminder[] {
  return [-1, 0, 1]
    .flatMap((offset) => remindersForDay(times, addDays(now, offset)))
    .sort((a, b) => a.at.getTime() - b.at.getTime())
}

/** The reminders that have come due at `now` and are not yet stale. */
export function dueReminders(reminders: readonly Reminder[], now: Date): Reminder[] {
  const staleBefore = addMinutes(now, -STALE_AFTER_MINUTES)
  return reminders.filter((reminder) => reminder.at <= now && reminder.at > staleBefore)
}

export interface ReminderDecision {
  /** To show right now, earliest first. */
  show: Reminder[]
  /** The seen-list to persist, pruned to the window the ids can come from. */
  seen: Set<string>
}

/**
 * Which reminders to show at `now`, given what has already been shown and
 * which of today's bowls are already ticked off.
 *
 * Pure so the two rules that matter can be tested without a clock or a
 * notification: nothing is shown twice, and nothing nags about a bowl the
 * other phone already filled.
 */
export function decideReminders({
  times,
  now,
  shown,
  given,
  today,
}: {
  times: readonly string[]
  now: Date
  shown: ReadonlySet<string>
  /** Meal indexes ticked off today, against the plan in force. */
  given: ReadonlySet<number>
  today: DayRange
}): ReminderDecision {
  const candidates = remindersAround(times, now)
  // Pruned to the three days the ids can come from, so the list cannot grow
  // without bound on a phone that never clears its storage.
  const seen = new Set([...shown].filter((id) => candidates.some((r) => r.id === id)))
  const show: Reminder[] = []

  for (const reminder of dueReminders(candidates, now)) {
    if (shown.has(reminder.id)) continue
    // Marked seen even when suppressed below: unticking a bowl at 07:03 should
    // not make 07:00's reminder pop a second time.
    seen.add(reminder.id)
    // Today's feedings can only speak for today's bowls — a lead-in shown at
    // 23:55 is about tomorrow's, which nobody can have filled yet.
    const isToday = reminder.mealAt >= today.start && reminder.mealAt < today.end
    if (isToday && given.has(reminder.mealIndex)) continue
    show.push(reminder)
  }

  return { show, seen }
}

/** What the notification says. A lock screen is no place for wit. */
export function reminderText(reminder: Reminder, catName: string): { title: string; body: string } {
  if (reminder.kind === 'soon') {
    return {
      title: `Feeding in ${String(LEAD_MINUTES)} minutes`,
      body: `${catName} eats at ${reminder.mealTime}.`,
    }
  }
  return { title: 'Feeding time', body: `${catName}’s ${reminder.mealTime} meal.` }
}
