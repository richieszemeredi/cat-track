import { type User } from 'firebase/auth'
import { useEffect } from 'react'
import { awaitOrQueued, updateMemberDisplayName } from './db'

// A member's display name is never typed or edited — it tracks their own
// Firebase Auth profile automatically, so "I can't fix my name" is not a
// thing that can happen. The owner adding a member still writes a
// placeholder (nobody can look up another uid's Auth profile client-side,
// and there is no Cloud Function on the Spark tier to do it for them), and
// this hook is what corrects it the moment that member's own client loads.

/** Enough of a resolved membership to compare and correct its display name. */
export interface DisplayNameSyncTarget {
  householdId: string
  displayName: string
}

/**
 * Keeps `target`'s stored display name equal to `user`'s own Auth name (or
 * email, for the dev/email-password sign-in path, which never sets one). A
 * no-op once they already match, so this is safe to call on every render.
 */
export function useDisplayNameSync(user: User, target: DisplayNameSyncTarget | null): void {
  useEffect(() => {
    if (target === null) return
    const wanted = user.displayName ?? user.email ?? 'You'
    if (target.displayName === wanted) return
    awaitOrQueued(updateMemberDisplayName(target.householdId, user.uid, wanted)).catch(() => {
      // Best-effort — a stale name is cosmetic, never worth surfacing an error for.
    })
  }, [user.uid, user.displayName, user.email, target])
}
