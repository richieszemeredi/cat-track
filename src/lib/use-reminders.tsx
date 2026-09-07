import { useQuery } from '@tanstack/react-query'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { type DayRange } from './dates'
import {
  feedingsForDayQueryOptions,
  plansQueryOptions,
  useFeedingsForDayLive,
  usePlansLive,
} from './db'
import { useHousehold } from './household'
import { mealTimes } from './plan'
import { decideReminders, reminderText, type Reminder } from './reminders'
import { type Cat } from './schemas'
import { isStandalone } from './standalone'
import { useToday } from './use-today'

// Local feeding reminders. The app shows them itself while it is running —
// there is no server to push from on the Spark tier — so the honest scope is
// "while CatTrack is open on this phone", which the profile screen says in as
// many words. Everything time-related is pure and lives in reminders.ts.

/**
 * Reminders are a DEVICE preference, not household data. Notification
 * permission is granted per browser, and one phone wanting a 06:45 nudge says
 * nothing about the other; keeping the flag in localStorage also keeps a
 * purely local feature out of the schema and the security rules.
 */
const ENABLED_KEY = 'cattrack:reminders-enabled'
const SHOWN_KEY = 'cattrack:reminders-shown'

/** Coarse enough to be free, fine enough that a reminder is never a minute late. */
const CHECK_INTERVAL_MS = 30_000

function readEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === 'true'
  } catch {
    // Storage denied (Private Browsing): reminders default to off.
    return false
  }
}

function writeEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, String(enabled))
  } catch {
    // The toggle still holds for this session; it just will not survive a reload.
  }
}

/** Ids already shown, so a reload inside the due window cannot repeat one. */
function readShown(): Set<string> {
  try {
    const raw = localStorage.getItem(SHOWN_KEY)
    if (raw === null) return new Set()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((id): id is string => typeof id === 'string'))
  } catch {
    return new Set()
  }
}

function writeShown(ids: Set<string>): void {
  try {
    localStorage.setItem(SHOWN_KEY, JSON.stringify([...ids]))
  } catch {
    // Worst case a reminder repeats after a reload — better than not showing it.
  }
}

export type ReminderPermission = 'unsupported' | NotificationPermission

function readPermission(): ReminderPermission {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.permission
}

export interface RemindersState {
  /** Wanted on this device. */
  enabled: boolean
  permission: ReminderPermission
  /** iOS shows web notifications only for a Home-Screen install. */
  installed: boolean
  /** Ask for permission — must be called straight from a tap — and switch on. */
  enable: () => Promise<void>
  disable: () => void
}

const RemindersContext = createContext<RemindersState | null>(null)

export function RemindersProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(readEnabled)
  const [permission, setPermission] = useState<ReminderPermission>(readPermission)

  const enable = useCallback(async () => {
    if (!('Notification' in window)) {
      setPermission('unsupported')
      return
    }
    // Nothing may be awaited before this: Safari only honours the request
    // inside the user gesture that triggered it.
    const result = await Notification.requestPermission()
    setPermission(result)
    if (result !== 'granted') return
    setEnabled(true)
    writeEnabled(true)
  }, [])

  const disable = useCallback(() => {
    setEnabled(false)
    writeEnabled(false)
  }, [])

  const value = useMemo<RemindersState>(
    () => ({ enabled, permission, installed: isStandalone(), enable, disable }),
    [enabled, permission, enable, disable],
  )

  return (
    <RemindersContext.Provider value={value}>
      {enabled && permission === 'granted' ? <ReminderScheduler /> : null}
      {children}
    </RemindersContext.Provider>
  )
}

export function useReminders(): RemindersState {
  const ctx = useContext(RemindersContext)
  if (ctx === null) throw new Error('useReminders must be used inside <RemindersProvider>')
  return ctx
}

/** Mounted only while reminders are on, so a household that never opts in pays nothing. */
function ReminderScheduler() {
  const { householdId, activeCat } = useHousehold()
  if (activeCat === null) return null
  return <CatReminders hid={householdId} cat={activeCat} />
}

interface ReminderInputs {
  times: string[]
  /** Meal indexes already ticked off today, against the plan in force. */
  given: Set<number>
  day: DayRange
  catName: string
}

function CatReminders({ hid, cat }: { hid: string; cat: Cat }) {
  const day = useToday()
  const plansQuery = useQuery(plansQueryOptions(hid, cat.id))
  usePlansLive(hid, cat.id)
  const feedingsQuery = useQuery(feedingsForDayQueryOptions(hid, cat.id, day.start, day.end))
  useFeedingsForDayLive(hid, cat.id, day.start, day.end)

  // Newest first and never edited, so [0] is the plan in force — same rule the
  // food screen's checklist follows.
  const plan = plansQuery.data?.[0] ?? null
  const times = plan === null ? [] : mealTimes(plan.mealsPerDay, plan.firstMealAt, plan.lastMealAt)

  const given = new Set<number>()
  for (const feeding of feedingsQuery.data ?? []) {
    // Only a tick against THIS plan counts, exactly as on the checklist: a
    // feeding left over from yesterday's plan must not silence today's bowl.
    if (plan !== null && feeding.planId === plan.id && feeding.mealIndex !== null) {
      given.add(feeding.mealIndex)
    }
  }

  // The tick reads the plan and the ticked bowls through a ref, so a plan
  // revision or a filled bowl never tears down and re-arms the interval.
  const inputs = useRef<ReminderInputs>({ times, given, day, catName: cat.name })
  useEffect(() => {
    inputs.current = { times, given, day, catName: cat.name }
  })

  useEffect(() => {
    const check = () => {
      showDueReminders(inputs.current)
    }
    check()
    // Polled, not armed with setTimeout: iOS suspends a backgrounded PWA and
    // its timers along with it, so a timer set for 06:45 fires whenever the app
    // next happens to wake. Reading the clock instead means a reminder appears
    // only while it is genuinely due — and focus/visibility are exactly the
    // moments a suspended app gets to catch up.
    const timer = setInterval(check, CHECK_INTERVAL_MS)
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])

  return null
}

function showDueReminders({ times, given, day, catName }: ReminderInputs): void {
  if (times.length === 0) return

  const shown = readShown()
  const decision = decideReminders({ times, now: new Date(), shown, given, today: day })

  for (const reminder of decision.show) {
    void showNotification(reminder, catName)
  }

  // Only touch storage when the seen-list actually moved — this runs every
  // half-minute for as long as the app is open.
  if (decision.show.length > 0 || decision.seen.size !== shown.size) {
    writeShown(decision.seen)
  }
}

async function showNotification(reminder: Reminder, catName: string): Promise<void> {
  const { title, body } = reminderText(reminder, catName)
  // tag: one that somehow fires twice replaces itself instead of stacking two
  // identical rows on the lock screen.
  const options: NotificationOptions = { body, tag: reminder.id }

  try {
    // iOS shows web notifications only through the service worker
    // registration — the Notification constructor exists there but throws.
    const registration = await navigator.serviceWorker.getRegistration()
    if (registration !== undefined) {
      await registration.showNotification(title, options)
      return
    }
    new Notification(title, options)
  } catch (error) {
    console.warn('[reminders] could not show a notification', error)
  }
}
