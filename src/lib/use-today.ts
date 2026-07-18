import { useEffect, useState } from 'react'
import { dayRange, type DayRange } from './dates'

function dayKey(d: Date): string {
  return `${String(d.getFullYear())}-${String(d.getMonth())}-${String(d.getDate())}`
}

/**
 * Today's [start, end) range, refreshed when the calendar day changes.
 * A resident iOS PWA can sit backgrounded across midnight — without this,
 * "today" views keep showing yesterday until a remount. Re-checks on
 * visibility/focus (the resume paths) plus a minute tick while foregrounded.
 */
export function useToday(): DayRange {
  const [range, setRange] = useState(() => dayRange(new Date()))

  useEffect(() => {
    const check = () => {
      setRange((prev) => {
        const next = dayRange(new Date())
        return dayKey(prev.start) === dayKey(next.start) ? prev : next
      })
    }
    const timer = setInterval(check, 60_000)
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])

  return range
}
