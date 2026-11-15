import { useEffect } from 'react'
import { migrateLegacyFoods } from './db'
import { useHousehold } from './household'

// Households already handled this app session. Module-level, so remounting
// the shell (an error boundary reset, a household switch back) doesn't run it
// again; a full reload does, and the copy is idempotent anyway.
const started = new Set<string>()

/**
 * Copy foods from the old per-cat catalogs into the household's — once per
 * session, for a member who can write, as soon as the cats are known. A
 * failure (offline, say) is logged and retried on the next launch; it never
 * reaches the UI.
 */
export function useLegacyFoodsMigration(): void {
  const { householdId, canEdit, cats, catsLoading } = useHousehold()
  const catIds = cats.map((c) => c.id).join('\n')

  useEffect(() => {
    if (!canEdit || catsLoading || catIds === '' || started.has(householdId)) return
    started.add(householdId)
    migrateLegacyFoods(householdId, catIds.split('\n')).then(
      (copied) => {
        if (copied > 0) console.info(`[foods] copied ${String(copied)} food(s) to the household`)
      },
      (err: unknown) => {
        console.error('[foods] legacy migration failed', err)
      },
    )
  }, [householdId, canEdit, catsLoading, catIds])
}
