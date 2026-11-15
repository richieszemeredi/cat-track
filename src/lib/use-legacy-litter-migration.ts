import { useEffect } from 'react'
import { useAuth } from './auth'
import { migrateLegacyLitter } from './db'
import { useHousehold } from './household'

// Households already handled this app session — see use-legacy-foods-migration.
const started = new Set<string>()

/**
 * Give the household's pre-kinds litter its `litters/default` doc — once per
 * session, for a member who can write. Every litter box and stock event from
 * before kinds already reads as that kind; this only gives it a name. A
 * failure (offline, say) is logged and retried on the next launch; it never
 * reaches the UI.
 */
export function useLegacyLitterMigration(): void {
  const { householdId, canEdit } = useHousehold()
  const { user } = useAuth()
  const uid = user?.uid ?? null

  useEffect(() => {
    if (!canEdit || uid === null || started.has(householdId)) return
    started.add(householdId)
    migrateLegacyLitter(householdId, uid).then(
      (created) => {
        if (created) console.info('[litter] named the legacy litter kind')
      },
      (err: unknown) => {
        console.error('[litter] legacy migration failed', err)
      },
    )
  }, [householdId, canEdit, uid])
}
