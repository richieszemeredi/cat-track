import { addDays, startOfDay } from 'date-fns'

export interface DayRange {
  start: Date
  end: Date
}

/** Local-time [start, end) range of the calendar day containing `date`. */
export function dayRange(date: Date): DayRange {
  const start = startOfDay(date)
  return { start, end: addDays(start, 1) }
}
