import { type Cat } from './schemas'

// Device-local, never Firestore: which cat one phone is looking at says nothing
// about the other phone, so this touches neither the schema nor the rules.
const storageKey = (householdId: string) => `cattrack.selectedCat.${householdId}`

/**
 * The cat the cat-scoped screens show: the stored one while it still exists,
 * otherwise the first created. A stored id for a deleted cat (or one a
 * household never had) must fall back rather than leave the app with no cat.
 */
export function resolveActiveCat(cats: readonly Cat[], storedId: string | null): Cat | null {
  return cats.find((cat) => cat.id === storedId) ?? cats[0] ?? null
}

// Storage can throw (private window, blocked site data) — a lost choice just
// means the first cat, so every access swallows the error.
export function readSelectedCatId(householdId: string): string | null {
  try {
    return localStorage.getItem(storageKey(householdId))
  } catch {
    return null
  }
}

export function writeSelectedCatId(householdId: string, catId: string): void {
  try {
    localStorage.setItem(storageKey(householdId), catId)
  } catch {
    // Selection still holds for this session through component state.
  }
}
