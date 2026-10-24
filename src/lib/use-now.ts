import { useEffect, useState } from 'react'

/**
 * The current time, refreshed every minute and on resume. For figures that
 * count hours (`useToday` only moves at midnight, which is too coarse): a
 * resident iOS PWA backgrounded for an afternoon must not wake up still
 * saying "2 hours ago".
 */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const tick = () => {
      setNow(new Date())
    }
    const timer = setInterval(tick, 60_000)
    window.addEventListener('focus', tick)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', tick)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])

  return now
}
