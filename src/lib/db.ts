import { queryOptions, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { startOfDay } from 'date-fns'
import { type User } from 'firebase/auth'
import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type CollectionReference,
  type Query,
  type QuerySnapshot,
} from 'firebase/firestore'
import { useEffect } from 'react'
import { type z } from 'zod'
import { displayNameFor } from './display-name'
import { db } from './firebase'
import {
  catSchema,
  feedingSchema,
  foodSchema,
  foodStockEventSchema,
  litterBoxSchema,
  litterSchema,
  litterStockEventSchema,
  waterBowlSchema,
  mealTimeOverrideSchema,
  memberSchema,
  planItemSchema,
  planSchema,
  weightEntrySchema,
  type Cat,
  type Feeding,
  type Food,
  type FoodAnalysis,
  type FoodStockEvent,
  type FoodType,
  type LifeStage,
  type LitterBagUnit,
  type LitterBox,
  type LitterKind,
  type LitterStockEvent,
  type WaterBowl,
  type MealTimeOverride,
  type Plan,
  type PlanItem,
  type Role,
  type Sex,
  type StockUnit,
  type WeightEntry,
} from './schemas'
import { LEGACY_LITTER_ID, type FoodStockKind, type LitterStockKind } from './stock'

// The single data-access layer. Every function takes householdId explicitly —
// today there is exactly one household, but nothing here assumes that, which
// keeps the future public/multiuser jump a UI problem, not a data problem
// (plan §6).

// ---------- read boundary: Zod safeParse, degrade gracefully ----------

function parseDocs<T extends Record<string, unknown>>(
  schema: z.ZodType<T>,
  snap: QuerySnapshot,
): (T & { id: string })[] {
  const out: (T & { id: string })[] = []
  for (const d of snap.docs) {
    // 'estimate': docs with a pending serverTimestamp() (offline queue,
    // latency compensation) surface with a local-clock Timestamp instead of
    // null — otherwise the schema would reject every just-written doc and an
    // offline entry would vanish from the UI until it synced.
    const parsed = schema.safeParse(d.data({ serverTimestamps: 'estimate' }))
    if (parsed.success) {
      out.push({ ...parsed.data, id: d.id })
    } else {
      // Robustness net, not security: skip + log, never white-screen.
      console.error(`[db] skipping malformed doc at ${d.ref.path}`, parsed.error)
    }
  }
  return out
}

// A snapshot listener that errors (e.g. permissions revoked) dies silently
// and would leave the Query cache frozen at staleTime: Infinity. Log it and
// invalidate the key so useQuery refetches and surfaces a visible error state.
function onListenError(qc: QueryClient, key: readonly unknown[]) {
  return (err: unknown) => {
    console.error('[db] snapshot listener error for', key, err)
    void qc.invalidateQueries({ queryKey: key })
  }
}

// ---------- refs ----------

function catsRef(hid: string): CollectionReference {
  return collection(db, 'households', hid, 'cats')
}
function weightsRef(hid: string, catId: string): CollectionReference {
  return collection(db, 'households', hid, 'cats', catId, 'weights')
}
/** The household's food catalog — the tins on the shelf belong to everyone. */
function foodsRef(hid: string): CollectionReference {
  return collection(db, 'households', hid, 'foods')
}
/** Superseded per-cat catalog; read only to copy it across (migrateLegacyFoods). */
function legacyFoodsRef(hid: string, catId: string): CollectionReference {
  return collection(db, 'households', hid, 'cats', catId, 'foods')
}
function foodStockRef(hid: string, foodId: string): CollectionReference {
  return collection(db, 'households', hid, 'foods', foodId, 'stock')
}
function feedingsRef(hid: string, catId: string): CollectionReference {
  return collection(db, 'households', hid, 'cats', catId, 'feedings')
}
function plansRef(hid: string, catId: string): CollectionReference {
  return collection(db, 'households', hid, 'cats', catId, 'plans')
}
function mealTimeOverridesRef(hid: string, catId: string): CollectionReference {
  return collection(db, 'households', hid, 'cats', catId, 'mealTimeOverrides')
}
function litterBoxesRef(hid: string): CollectionReference {
  return collection(db, 'households', hid, 'litterBoxes')
}
/** The household's litter catalog — each kind is counted in its own bags. */
function littersRef(hid: string): CollectionReference {
  return collection(db, 'households', hid, 'litters')
}
function litterStockRef(hid: string): CollectionReference {
  return collection(db, 'households', hid, 'litterStock')
}
function waterBowlsRef(hid: string): CollectionReference {
  return collection(db, 'households', hid, 'waterBowls')
}
function planItemsRef(hid: string, catId: string, planId: string): CollectionReference {
  return collection(db, 'households', hid, 'cats', catId, 'plans', planId, 'items')
}

// ---------- membership discovery ----------

export interface Membership {
  householdId: string
  role: Role
  displayName: string
}

/** Find the signed-in user's household via a members collection-group query. */
export async function findMembership(uid: string): Promise<Membership | null> {
  const snap = await getDocs(
    query(collectionGroup(db, 'members'), where('uid', '==', uid), limit(1)),
  )
  const d = snap.docs[0]
  if (!d) return null
  // 'estimate' for the same reason as parseDocs: a freshly created household's
  // member doc may still have its joinedAt serverTimestamp pending.
  const parsed = memberSchema.safeParse(d.data({ serverTimestamps: 'estimate' }))
  if (!parsed.success) {
    console.error(`[db] malformed member doc at ${d.ref.path}`, parsed.error)
    return null
  }
  const householdId = d.ref.parent.parent?.id
  if (householdId === undefined) return null
  return { householdId, role: parsed.data.role, displayName: parsed.data.displayName }
}

export function membershipQueryOptions(uid: string) {
  return queryOptions({
    queryKey: ['membership', uid] as const,
    queryFn: () => findMembership(uid),
    staleTime: 5 * 60_000,
  })
}

// ---------- members ----------

function membersRef(hid: string): CollectionReference {
  return collection(db, 'households', hid, 'members')
}

export function membersQueryOptions(hid: string) {
  return queryOptions({
    queryKey: ['members', hid] as const,
    queryFn: async () =>
      parseDocs(memberSchema, await getDocs(query(membersRef(hid), orderBy('joinedAt', 'asc')))),
    staleTime: Infinity,
  })
}

export function useMembersLive(hid: string): void {
  const qc = useQueryClient()
  useEffect(
    () =>
      onSnapshot(
        query(membersRef(hid), orderBy('joinedAt', 'asc')),
        (snap) => {
          qc.setQueryData(membersQueryOptions(hid).queryKey, parseDocs(memberSchema, snap))
        },
        onListenError(qc, membersQueryOptions(hid).queryKey),
      ),
    [hid, qc],
  )
}

/** Owner-only (enforced by rules): add the partner's account to the household. */
export function addMember(
  hid: string,
  member: { uid: string; role: 'editor' | 'viewer'; displayName: string },
): Promise<unknown> {
  return setDoc(doc(membersRef(hid), member.uid), {
    uid: member.uid,
    role: member.role,
    joinedAt: serverTimestamp(),
    displayName: member.displayName,
  })
}

/**
 * Keep a member's own display name in step with their Firebase Auth
 * profile — see use-display-name-sync.ts, the only caller. Nobody types or
 * edits this; a member can only ever update their OWN doc (rules), so an
 * invited member's placeholder name self-corrects the moment they sign in.
 */
export function updateMemberDisplayName(
  hid: string,
  uid: string,
  displayName: string,
): Promise<unknown> {
  return updateDoc(doc(membersRef(hid), uid), { displayName })
}

// ---------- queries + live subscriptions ----------
// Pattern: the queryOptions do the one-shot fetch (route loaders can
// ensureQueryData them); a matching use*Live hook pushes onSnapshot updates
// into the same cache key, so data stays realtime across both phones.

export function catsQueryOptions(hid: string) {
  return queryOptions({
    queryKey: ['cats', hid] as const,
    queryFn: async () =>
      parseDocs(catSchema, await getDocs(query(catsRef(hid), orderBy('createdAt', 'asc')))),
    staleTime: Infinity,
  })
}

export function useCatsLive(hid: string): void {
  const qc = useQueryClient()
  useEffect(
    () =>
      onSnapshot(
        query(catsRef(hid), orderBy('createdAt', 'asc')),
        (snap) => {
          qc.setQueryData(catsQueryOptions(hid).queryKey, parseDocs(catSchema, snap))
        },
        onListenError(qc, catsQueryOptions(hid).queryKey),
      ),
    [hid, qc],
  )
}

export function weightsQueryOptions(hid: string, catId: string) {
  return queryOptions({
    queryKey: ['weights', hid, catId] as const,
    queryFn: async () =>
      parseDocs(
        weightEntrySchema,
        await getDocs(query(weightsRef(hid, catId), orderBy('date', 'asc'))),
      ),
    staleTime: Infinity,
  })
}

export function useWeightsLive(hid: string, catId: string): void {
  const qc = useQueryClient()
  useEffect(
    () =>
      onSnapshot(
        query(weightsRef(hid, catId), orderBy('date', 'asc')),
        (snap) => {
          qc.setQueryData(
            weightsQueryOptions(hid, catId).queryKey,
            parseDocs(weightEntrySchema, snap),
          )
        },
        onListenError(qc, weightsQueryOptions(hid, catId).queryKey),
      ),
    [hid, catId, qc],
  )
}

/**
 * Several listeners at once, one per id, each feeding its own cache key — for
 * the "every cat" / "every food" reads, where a hook per item would mean hooks
 * in a loop. `ids` is joined into the effect key, so a new array with the same
 * ids does not resubscribe.
 */
function useLiveEach(
  ids: readonly string[],
  listen: (id: string) => {
    q: Query
    key: readonly unknown[]
    parse: (s: QuerySnapshot) => unknown
  },
  deps: readonly unknown[],
): void {
  const qc = useQueryClient()
  const idKey = ids.join('\n')
  useEffect(() => {
    const unsubs = (idKey === '' ? [] : idKey.split('\n')).map((id) => {
      const { q, key, parse } = listen(id)
      return onSnapshot(
        q,
        (snap) => {
          qc.setQueryData(key, parse(snap))
        },
        onListenError(qc, key),
      )
    })
    return () => {
      for (const unsub of unsubs) unsub()
    }
    // `listen` is rebuilt every render; its inputs are `deps` + the ids.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey, qc, ...deps])
}

export function foodsQueryOptions(hid: string) {
  return queryOptions({
    queryKey: ['foods', hid] as const,
    queryFn: async () =>
      parseDocs(foodSchema, await getDocs(query(foodsRef(hid), orderBy('name', 'asc')))),
    staleTime: Infinity,
  })
}

export function useFoodsLive(hid: string): void {
  const qc = useQueryClient()
  useEffect(
    () =>
      onSnapshot(
        query(foodsRef(hid), orderBy('name', 'asc')),
        (snap) => {
          qc.setQueryData(foodsQueryOptions(hid).queryKey, parseDocs(foodSchema, snap))
        },
        onListenError(qc, foodsQueryOptions(hid).queryKey),
      ),
    [hid, qc],
  )
}

// ---------- food stock ----------

/** One food's stock log, oldest first. */
export function foodStockQueryOptions(hid: string, foodId: string) {
  return queryOptions({
    queryKey: ['foodStock', hid, foodId] as const,
    queryFn: async () =>
      parseDocs(
        foodStockEventSchema,
        await getDocs(query(foodStockRef(hid, foodId), orderBy('at', 'asc'))),
      ),
    staleTime: Infinity,
  })
}

/** Live stock logs for several foods at once (one listener each). */
export function useFoodStocksLive(hid: string, foodIds: readonly string[]): void {
  useLiveEach(
    foodIds,
    (foodId) => ({
      q: query(foodStockRef(hid, foodId), orderBy('at', 'asc')),
      key: foodStockQueryOptions(hid, foodId).queryKey,
      parse: (snap) => parseDocs(foodStockEventSchema, snap),
    }),
    [hid],
  )
}

export interface FoodStockEventInput {
  kind: FoodStockKind
  units: number
  at: Date
}

export function addFoodStockEvent(
  hid: string,
  foodId: string,
  uid: string,
  input: FoodStockEventInput,
): Promise<unknown> {
  return addDoc(foodStockRef(hid, foodId), {
    kind: input.kind,
    units: input.units,
    at: Timestamp.fromDate(input.at),
    createdBy: uid,
    createdAt: serverTimestamp(),
  })
}

// ---------- legacy foods migration ----------

/** The fields a per-cat food could carry — copied across, nothing else. */
const LEGACY_FOOD_KEYS = [
  'name',
  'brand',
  'type',
  'kcalPerGram',
  'analysis',
  'archived',
  'createdBy',
  'createdAt',
] as const

/**
 * Copy every food from the superseded per-cat catalogs into the household's,
 * under the SAME id (feedings and plan items point at it), with its fields
 * verbatim — original createdBy and createdAt included, no unit. Idempotent:
 * a food already in the household collection is never overwritten, which a
 * transaction re-checks so a second phone migrating at the same moment can't
 * clobber an edit made in between. Server reads only: acting on an empty
 * offline cache would mistake every food for missing. Resolves to the number
 * of foods copied.
 */
export async function migrateLegacyFoods(hid: string, catIds: readonly string[]): Promise<number> {
  const legacy = new Map<string, Record<string, unknown>>()
  for (const catId of catIds) {
    const snap = await getDocsFromServer(legacyFoodsRef(hid, catId))
    for (const d of snap.docs) {
      const data = d.data()
      if (!foodSchema.safeParse(data).success) {
        console.error(`[db] not migrating malformed food at ${d.ref.path}`)
        continue
      }
      if (legacy.has(d.id)) continue
      const copy: Record<string, unknown> = {}
      for (const key of LEGACY_FOOD_KEYS) if (key in data) copy[key] = data[key]
      legacy.set(d.id, copy)
    }
  }
  if (legacy.size === 0) return 0

  const existing = await getDocsFromServer(foodsRef(hid))
  const have = new Set(existing.docs.map((d) => d.id))
  const missing = [...legacy].filter(([id]) => !have.has(id))
  if (missing.length === 0) return 0

  return runTransaction(db, async (tx) => {
    const refs = missing.map(([id, data]) => ({ ref: doc(foodsRef(hid), id), data }))
    const snaps = await Promise.all(refs.map(({ ref }) => tx.get(ref)))
    let copied = 0
    refs.forEach(({ ref, data }, i) => {
      if (snaps[i]?.exists() === true) return
      tx.set(ref, data)
      copied += 1
    })
    return copied
  })
}

/** Feedings within [dayStart, dayEnd) — used for "today" totals. */
export function feedingsForDayQueryOptions(
  hid: string,
  catId: string,
  dayStart: Date,
  dayEnd: Date,
) {
  return queryOptions({
    queryKey: ['feedings', hid, catId, dayStart.toISOString()] as const,
    queryFn: async () =>
      parseDocs(
        feedingSchema,
        await getDocs(
          query(
            feedingsRef(hid, catId),
            where('datetime', '>=', Timestamp.fromDate(dayStart)),
            where('datetime', '<', Timestamp.fromDate(dayEnd)),
            // Earliest first: today's meals read top-to-bottom as a morning-to-
            // evening timeline, same order the planned checklist already reads in.
            orderBy('datetime', 'asc'),
          ),
        ),
      ),
    staleTime: Infinity,
  })
}

export function useFeedingsForDayLive(
  hid: string,
  catId: string,
  dayStart: Date,
  dayEnd: Date,
): void {
  const qc = useQueryClient()
  const startMs = dayStart.getTime()
  const endMs = dayEnd.getTime()
  useEffect(
    () =>
      onSnapshot(
        query(
          feedingsRef(hid, catId),
          where('datetime', '>=', Timestamp.fromMillis(startMs)),
          where('datetime', '<', Timestamp.fromMillis(endMs)),
          orderBy('datetime', 'asc'),
        ),
        (snap) => {
          qc.setQueryData(
            feedingsForDayQueryOptions(hid, catId, new Date(startMs), new Date(endMs)).queryKey,
            parseDocs(feedingSchema, snap),
          )
        },
        onListenError(
          qc,
          feedingsForDayQueryOptions(hid, catId, new Date(startMs), new Date(endMs)).queryKey,
        ),
      ),
    [hid, catId, startMs, endMs, qc],
  )
}

/**
 * A cat's feedings from `since` on — what the food stock counts down by. A
 * range on `datetime` alone, so no composite index is needed.
 */
export function feedingsSinceQueryOptions(hid: string, catId: string, since: Date) {
  return queryOptions({
    queryKey: ['feedingsSince', hid, catId, since.toISOString()] as const,
    queryFn: async () =>
      parseDocs(
        feedingSchema,
        await getDocs(
          query(
            feedingsRef(hid, catId),
            where('datetime', '>=', Timestamp.fromDate(since)),
            orderBy('datetime', 'asc'),
          ),
        ),
      ),
    staleTime: Infinity,
  })
}

/** Live feedings since `since` for several cats; nothing while `since` is null. */
export function useFeedingsSinceLive(
  hid: string,
  catIds: readonly string[],
  since: Date | null,
): void {
  const sinceMs = since?.getTime() ?? null
  useLiveEach(
    sinceMs === null ? [] : catIds,
    (catId) => {
      const from = new Date(sinceMs ?? 0)
      return {
        q: query(
          feedingsRef(hid, catId),
          where('datetime', '>=', Timestamp.fromDate(from)),
          orderBy('datetime', 'asc'),
        ),
        key: feedingsSinceQueryOptions(hid, catId, from).queryKey,
        parse: (snap) => parseDocs(feedingSchema, snap),
      }
    },
    [hid, sinceMs],
  )
}

// ---------- meal time overrides ----------

/** Today's one-off nudges to planned meal times, within [dayStart, dayEnd). */
export function mealTimeOverridesForDayQueryOptions(
  hid: string,
  catId: string,
  dayStart: Date,
  dayEnd: Date,
) {
  return queryOptions({
    queryKey: ['mealTimeOverrides', hid, catId, dayStart.toISOString()] as const,
    queryFn: async () =>
      parseDocs(
        mealTimeOverrideSchema,
        await getDocs(
          query(
            mealTimeOverridesRef(hid, catId),
            where('overrideAt', '>=', Timestamp.fromDate(dayStart)),
            where('overrideAt', '<', Timestamp.fromDate(dayEnd)),
            orderBy('overrideAt', 'asc'),
          ),
        ),
      ),
    staleTime: Infinity,
  })
}

export function useMealTimeOverridesForDayLive(
  hid: string,
  catId: string,
  dayStart: Date,
  dayEnd: Date,
): void {
  const qc = useQueryClient()
  const startMs = dayStart.getTime()
  const endMs = dayEnd.getTime()
  useEffect(
    () =>
      onSnapshot(
        query(
          mealTimeOverridesRef(hid, catId),
          where('overrideAt', '>=', Timestamp.fromMillis(startMs)),
          where('overrideAt', '<', Timestamp.fromMillis(endMs)),
          orderBy('overrideAt', 'asc'),
        ),
        (snap) => {
          qc.setQueryData(
            mealTimeOverridesForDayQueryOptions(hid, catId, new Date(startMs), new Date(endMs))
              .queryKey,
            parseDocs(mealTimeOverrideSchema, snap),
          )
        },
        onListenError(
          qc,
          mealTimeOverridesForDayQueryOptions(hid, catId, new Date(startMs), new Date(endMs))
            .queryKey,
        ),
      ),
    [hid, catId, startMs, endMs, qc],
  )
}

export interface MealTimeOverrideInput {
  planId: string
  mealIndex: number
  overrideAt: Date
}

/**
 * Move one of today's planned bowls. Overrides are replaced, not edited (rules
 * deny `update`, as everywhere else), and the replacement goes in the same
 * batch as the delete so a network drop can never leave the bowl with two
 * times or none.
 */
export function setMealTimeOverride(
  hid: string,
  catId: string,
  uid: string,
  input: MealTimeOverrideInput,
  replacedIds: readonly string[] = [],
): Promise<unknown> {
  const batch = writeBatch(db)
  for (const id of replacedIds) batch.delete(doc(mealTimeOverridesRef(hid, catId), id))
  batch.set(doc(mealTimeOverridesRef(hid, catId)), {
    ...input,
    overrideAt: Timestamp.fromDate(input.overrideAt),
    createdBy: uid,
    createdAt: serverTimestamp(),
  })
  return batch.commit()
}

// ---------- plans ----------

/**
 * Every plan, newest first. A plan is never edited: a revision is a new doc,
 * and the one before it is closed by this one's effectiveFrom — so [0] is the
 * plan in force and the rest are the history. Capped because a cat that lived
 * to twenty on fortnightly revisions still would not reach it.
 */
const PLANS_LIMIT = 100

/**
 * Newest first, with same-day revisions broken by when they were written.
 *
 * Ordering on effectiveFrom alone leaves two plans saved on the same day tied,
 * and Firestore then falls back to document id — so "bump the grams, then bump
 * them again" could leave the FIRST revision in force. Sorted here rather than
 * in the query because a second orderBy would need a composite index.
 */
function sortPlans(plans: Plan[]): Plan[] {
  return [...plans].sort(
    (a, b) =>
      b.effectiveFrom.getTime() - a.effectiveFrom.getTime() ||
      b.createdAt.getTime() - a.createdAt.getTime(),
  )
}

export function plansQueryOptions(hid: string, catId: string) {
  return queryOptions({
    queryKey: ['plans', hid, catId] as const,
    queryFn: async () =>
      sortPlans(
        parseDocs(
          planSchema,
          await getDocs(
            query(plansRef(hid, catId), orderBy('effectiveFrom', 'desc'), limit(PLANS_LIMIT)),
          ),
        ),
      ),
    staleTime: Infinity,
  })
}

export function usePlansLive(hid: string, catId: string): void {
  const qc = useQueryClient()
  useEffect(
    () =>
      onSnapshot(
        query(plansRef(hid, catId), orderBy('effectiveFrom', 'desc'), limit(PLANS_LIMIT)),
        (snap) => {
          qc.setQueryData(
            plansQueryOptions(hid, catId).queryKey,
            sortPlans(parseDocs(planSchema, snap)),
          )
        },
        onListenError(qc, plansQueryOptions(hid, catId).queryKey),
      ),
    [hid, catId, qc],
  )
}

/**
 * The foods a plan is made of. A separate collection rather than a list on the
 * plan doc because security rules cannot iterate a list — as its own document
 * every item gets the same hasOnly field validation as everything else.
 */
export function planItemsQueryOptions(hid: string, catId: string, planId: string) {
  return queryOptions({
    queryKey: ['plan-items', hid, catId, planId] as const,
    queryFn: async () =>
      parseDocs(planItemSchema, await getDocs(query(planItemsRef(hid, catId, planId)))),
    staleTime: Infinity,
  })
}

export function usePlanItemsLive(hid: string, catId: string, planId: string | null): void {
  const qc = useQueryClient()
  useEffect(() => {
    if (planId === null) return
    return onSnapshot(
      query(planItemsRef(hid, catId, planId)),
      (snap) => {
        qc.setQueryData(
          planItemsQueryOptions(hid, catId, planId).queryKey,
          parseDocs(planItemSchema, snap),
        )
      },
      onListenError(qc, planItemsQueryOptions(hid, catId, planId).queryKey),
    )
  }, [hid, catId, planId, qc])
}

/** usePlansLive for several cats at once. */
export function usePlansLiveForCats(hid: string, catIds: readonly string[]): void {
  useLiveEach(
    catIds,
    (catId) => ({
      q: query(plansRef(hid, catId), orderBy('effectiveFrom', 'desc'), limit(PLANS_LIMIT)),
      key: plansQueryOptions(hid, catId).queryKey,
      parse: (snap) => sortPlans(parseDocs(planSchema, snap)),
    }),
    [hid],
  )
}

/** usePlanItemsLive for several plans at once, each named `catId/planId`. */
export function usePlanItemsLiveForPlans(
  hid: string,
  plans: readonly { catId: string; planId: string }[],
): void {
  useLiveEach(
    plans.map(({ catId, planId }) => `${catId}/${planId}`),
    (path) => {
      const [catId = '', planId = ''] = path.split('/')
      return {
        q: query(planItemsRef(hid, catId, planId)),
        key: planItemsQueryOptions(hid, catId, planId).queryKey,
        parse: (snap) => parseDocs(planItemSchema, snap),
      }
    },
    [hid],
  )
}

// ---------- litter boxes ----------

export function litterBoxesQueryOptions(hid: string) {
  return queryOptions({
    queryKey: ['litterBoxes', hid] as const,
    queryFn: async () =>
      parseDocs(
        litterBoxSchema,
        await getDocs(query(litterBoxesRef(hid), orderBy('createdAt', 'asc'))),
      ),
    staleTime: Infinity,
  })
}

export function useLitterBoxesLive(hid: string): void {
  const qc = useQueryClient()
  useEffect(
    () =>
      onSnapshot(
        query(litterBoxesRef(hid), orderBy('createdAt', 'asc')),
        (snap) => {
          qc.setQueryData(litterBoxesQueryOptions(hid).queryKey, parseDocs(litterBoxSchema, snap))
        },
        onListenError(qc, litterBoxesQueryOptions(hid).queryKey),
      ),
    [hid, qc],
  )
}

// ---------- litter kinds ----------

/** Every litter kind, archived included, by name. */
export function littersQueryOptions(hid: string) {
  return queryOptions({
    queryKey: ['litters', hid] as const,
    queryFn: async () =>
      parseDocs(litterSchema, await getDocs(query(littersRef(hid), orderBy('name', 'asc')))),
    staleTime: Infinity,
  })
}

export function useLittersLive(hid: string): void {
  const qc = useQueryClient()
  useEffect(
    () =>
      onSnapshot(
        query(littersRef(hid), orderBy('name', 'asc')),
        (snap) => {
          qc.setQueryData(littersQueryOptions(hid).queryKey, parseDocs(litterSchema, snap))
        },
        onListenError(qc, littersQueryOptions(hid).queryKey),
      ),
    [hid, qc],
  )
}

// ---------- litter stock ----------

/** The household's litter stock log, oldest first. */
export function litterStockQueryOptions(hid: string) {
  return queryOptions({
    queryKey: ['litterStock', hid] as const,
    queryFn: async () =>
      parseDocs(
        litterStockEventSchema,
        await getDocs(query(litterStockRef(hid), orderBy('at', 'asc'))),
      ),
    staleTime: Infinity,
  })
}

export function useLitterStockLive(hid: string): void {
  const qc = useQueryClient()
  useEffect(
    () =>
      onSnapshot(
        query(litterStockRef(hid), orderBy('at', 'asc')),
        (snap) => {
          qc.setQueryData(
            litterStockQueryOptions(hid).queryKey,
            parseDocs(litterStockEventSchema, snap),
          )
        },
        onListenError(qc, litterStockQueryOptions(hid).queryKey),
      ),
    [hid, qc],
  )
}

// ---------- water bowls ----------

export function waterBowlsQueryOptions(hid: string) {
  return queryOptions({
    queryKey: ['waterBowls', hid] as const,
    queryFn: async () =>
      parseDocs(
        waterBowlSchema,
        await getDocs(query(waterBowlsRef(hid), orderBy('createdAt', 'asc'))),
      ),
    staleTime: Infinity,
  })
}

export function useWaterBowlsLive(hid: string): void {
  const qc = useQueryClient()
  useEffect(
    () =>
      onSnapshot(
        query(waterBowlsRef(hid), orderBy('createdAt', 'asc')),
        (snap) => {
          qc.setQueryData(waterBowlsQueryOptions(hid).queryKey, parseDocs(waterBowlSchema, snap))
        },
        onListenError(qc, waterBowlsQueryOptions(hid).queryKey),
      ),
    [hid, qc],
  )
}

// ---------- offline-aware write helper ----------

/**
 * Firestore write promises only resolve on server ack, so awaiting them
 * offline hangs forever even though latency compensation already applied the
 * write locally. Race with a short timer: 'confirmed' = server (or emulator)
 * acked; 'queued' = accepted locally, will sync when back online. A rules
 * rejection while online rejects fast and propagates as a normal error.
 */
export async function awaitOrQueued(
  write: Promise<unknown>,
  ms = 1500,
): Promise<'confirmed' | 'queued'> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const queued = new Promise<'queued'>((resolve) => {
    timer = setTimeout(() => {
      resolve('queued')
    }, ms)
  })
  try {
    const result = await Promise.race([write.then(() => 'confirmed' as const), queued])
    if (result === 'queued') {
      // If the queued write is later rejected on sync (rules), surface it in
      // the console instead of an unhandled rejection. Client-side validation
      // mirrors the rules, so this firing means a bug — worth the log.
      write.catch((err: unknown) => {
        console.error('[db] queued write failed after sync', err)
      })
    }
    return result
  } finally {
    clearTimeout(timer)
  }
}

// ---------- mutations ----------

export async function createHouseholdWithOwner(name: string, user: User): Promise<string> {
  const householdRef = doc(collection(db, 'households'))
  const memberRef = doc(collection(householdRef, 'members'), user.uid)
  const batch = writeBatch(db)
  batch.set(householdRef, { name, createdAt: serverTimestamp(), ownerUid: user.uid })
  batch.set(memberRef, {
    uid: user.uid,
    role: 'owner',
    joinedAt: serverTimestamp(),
    displayName: displayNameFor(user, 'Owner'),
  })
  await batch.commit()
  return householdRef.id
}

export interface CatInput {
  name: string
  birthDate: Date
  breed: string | null
  sex: Sex
  neutered: boolean
  neuterDate: Date | null
  idealWeightKg: number | null
  lifeStage: LifeStage | null
  merMultiplierOverride: number | null
}

export function createCat(hid: string, uid: string, input: CatInput): Promise<unknown> {
  return addDoc(catsRef(hid), {
    ...input,
    birthDate: Timestamp.fromDate(input.birthDate),
    neuterDate: input.neuterDate ? Timestamp.fromDate(input.neuterDate) : null,
    householdId: hid,
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export function updateCat(hid: string, catId: string, patch: Partial<CatInput>): Promise<unknown> {
  const data: Record<string, unknown> = { ...patch, updatedAt: serverTimestamp() }
  if (patch.birthDate !== undefined) data['birthDate'] = Timestamp.fromDate(patch.birthDate)
  if (patch.neuterDate !== undefined) {
    data['neuterDate'] = patch.neuterDate ? Timestamp.fromDate(patch.neuterDate) : null
  }
  return updateDoc(doc(catsRef(hid), catId), data)
}

export interface WeightInput {
  date: Date
  weightKg: number
  note: string | null
}

export function addWeightEntry(
  hid: string,
  catId: string,
  uid: string,
  input: WeightInput,
): Promise<unknown> {
  return addDoc(weightsRef(hid, catId), {
    ...input,
    date: Timestamp.fromDate(input.date),
    createdBy: uid,
    createdAt: serverTimestamp(),
  })
}

export function deleteWeightEntry(hid: string, catId: string, entryId: string): Promise<unknown> {
  return deleteDoc(doc(weightsRef(hid, catId), entryId))
}

export interface FoodInput {
  name: string
  brand: string | null
  type: FoodType
  kcalPerGram: number
  /** The label constituents kcalPerGram was calculated from, if it was. */
  analysis: FoodAnalysis | null
  /** What it comes in; null = derive from type (stock.ts unitFor). */
  unit: StockUnit | null
  /** Grams in one tin / pouch / bag; null = unknown, stock won't count down. */
  unitSizeG: number | null
}

/**
 * Add a household food. With `openingUnits`, the opening stock count goes in
 * the same batch, so a food never lands without the count typed beside it.
 */
export function addFood(
  hid: string,
  uid: string,
  input: FoodInput,
  openingUnits: number | null = null,
): Promise<unknown> {
  const foodDoc = doc(foodsRef(hid))
  const batch = writeBatch(db)
  batch.set(foodDoc, {
    ...input,
    archived: false,
    createdBy: uid,
    createdAt: serverTimestamp(),
  })
  if (openingUnits !== null) {
    batch.set(doc(foodStockRef(hid, foodDoc.id)), {
      kind: 'count',
      units: openingUnits,
      at: Timestamp.now(),
      createdBy: uid,
      createdAt: serverTimestamp(),
    })
  }
  return batch.commit()
}

export function updateFood(
  hid: string,
  foodId: string,
  patch: Partial<FoodInput & { archived: boolean }>,
): Promise<unknown> {
  return updateDoc(doc(foodsRef(hid), foodId), { ...patch })
}

export interface LitterBoxInput {
  location: string
  lastChangedAt: Date
  changeEveryWeeks: number
  bagsPerSwap: number
  /** The litter kind it takes; null = none chosen (a swap then counts no bags). */
  litterId: string | null
}

export function addLitterBox(hid: string, uid: string, input: LitterBoxInput): Promise<unknown> {
  return addDoc(litterBoxesRef(hid), {
    location: input.location,
    lastChangedAt: Timestamp.fromDate(input.lastChangedAt),
    changeEveryWeeks: input.changeEveryWeeks,
    bagsPerSwap: input.bagsPerSwap,
    litterId: input.litterId,
    createdBy: uid,
    createdAt: serverTimestamp(),
  })
}

export function updateLitterBox(
  hid: string,
  boxId: string,
  patch: Partial<LitterBoxInput>,
): Promise<unknown> {
  const data: Record<string, unknown> = { ...patch }
  if (patch.lastChangedAt !== undefined) {
    data['lastChangedAt'] = Timestamp.fromDate(patch.lastChangedAt)
  }
  return updateDoc(doc(litterBoxesRef(hid), boxId), data)
}

/**
 * "Replaced today": the box's last full clean moves to the day of `at`, and
 * its bags come off ITS litter kind's stock — in ONE batch, so the stock never
 * counts a swap the box doesn't show, or the other way round. The event keeps
 * the real time, so it sorts correctly against a recount made earlier today.
 * A box with no kind chosen only moves its date: there is no stock to draw
 * from. Editing a box's date in its form is a correction, not a swap, and
 * goes through updateLitterBox instead.
 */
export function replaceLitterBox(
  hid: string,
  uid: string,
  box: Pick<LitterBox, 'id' | 'bagsPerSwap' | 'litterId'>,
  at: Date,
): Promise<unknown> {
  const batch = writeBatch(db)
  batch.update(doc(litterBoxesRef(hid), box.id), {
    lastChangedAt: Timestamp.fromDate(startOfDay(at)),
  })
  if (box.litterId !== null) {
    batch.set(doc(litterStockRef(hid)), {
      kind: 'swap',
      bags: box.bagsPerSwap,
      litterId: box.litterId,
      at: Timestamp.fromDate(at),
      createdBy: uid,
      createdAt: serverTimestamp(),
    })
  }
  return batch.commit()
}

export interface LitterStockEventInput {
  /** The litter kind these bags are. */
  litterId: string
  kind: LitterStockKind
  bags: number
  at: Date
}

export function addLitterStockEvent(
  hid: string,
  uid: string,
  input: LitterStockEventInput,
): Promise<unknown> {
  return addDoc(litterStockRef(hid), {
    kind: input.kind,
    bags: input.bags,
    litterId: input.litterId,
    at: Timestamp.fromDate(input.at),
    createdBy: uid,
    createdAt: serverTimestamp(),
  })
}

export interface LitterInput {
  name: string
  /** Descriptive only ("10 L bags"); null = unknown. */
  bagSize: number | null
  bagUnit: LitterBagUnit | null
}

/**
 * Add a litter kind. With `openingBags`, the opening stock count goes in the
 * same batch, so a kind never lands without the count typed beside it.
 */
export function addLitter(
  hid: string,
  uid: string,
  input: LitterInput,
  openingBags: number | null = null,
): Promise<unknown> {
  const litterDoc = doc(littersRef(hid))
  const batch = writeBatch(db)
  batch.set(litterDoc, {
    name: input.name,
    bagSize: input.bagSize,
    bagUnit: input.bagUnit,
    archived: false,
    createdBy: uid,
    createdAt: serverTimestamp(),
  })
  if (openingBags !== null) {
    batch.set(doc(litterStockRef(hid)), {
      kind: 'count',
      bags: openingBags,
      litterId: litterDoc.id,
      at: Timestamp.now(),
      createdBy: uid,
      createdAt: serverTimestamp(),
    })
  }
  return batch.commit()
}

export function updateLitter(
  hid: string,
  litterId: string,
  patch: Partial<LitterInput & { archived: boolean }>,
): Promise<unknown> {
  return updateDoc(doc(littersRef(hid), litterId), { ...patch })
}

// ---------- legacy litter migration ----------

/**
 * Give the household's pre-kinds litter a name: every stock event and box
 * written before kinds has no litterId and reads as LEGACY_LITTER_ID, so a
 * household with any of them gets a `litters/default` doc ("Litter", no bag
 * size) for the owner to rename. Nothing else is rewritten. Idempotent: it
 * never overwrites the doc, which a transaction re-checks so a second phone
 * migrating at the same moment can't clobber a rename made in between.
 * Server reads only — an empty offline cache would look like "no litter".
 * Resolves to whether it created the doc.
 */
export async function migrateLegacyLitter(hid: string, uid: string): Promise<boolean> {
  const legacyRef = doc(littersRef(hid), LEGACY_LITTER_ID)
  if ((await getDocFromServer(legacyRef)).exists()) return false

  const [boxes, events] = await Promise.all([
    getDocsFromServer(query(litterBoxesRef(hid), limit(1))),
    getDocsFromServer(query(litterStockRef(hid), limit(1))),
  ])
  if (boxes.empty && events.empty) return false

  return runTransaction(db, async (tx) => {
    if ((await tx.get(legacyRef)).exists()) return false
    tx.set(legacyRef, {
      name: 'Litter',
      bagSize: null,
      bagUnit: null,
      archived: false,
      createdBy: uid,
      createdAt: serverTimestamp(),
    })
    return true
  })
}

export function deleteLitterBox(hid: string, boxId: string): Promise<unknown> {
  return deleteDoc(doc(litterBoxesRef(hid), boxId))
}

export interface WaterBowlInput {
  location: string
  lastChangedAt: Date
}

export function addWaterBowl(hid: string, uid: string, input: WaterBowlInput): Promise<unknown> {
  return addDoc(waterBowlsRef(hid), {
    location: input.location,
    lastChangedAt: Timestamp.fromDate(input.lastChangedAt),
    createdBy: uid,
    createdAt: serverTimestamp(),
  })
}

export function updateWaterBowl(
  hid: string,
  bowlId: string,
  patch: Partial<WaterBowlInput>,
): Promise<unknown> {
  const data: Record<string, unknown> = { ...patch }
  if (patch.lastChangedAt !== undefined) {
    data['lastChangedAt'] = Timestamp.fromDate(patch.lastChangedAt)
  }
  return updateDoc(doc(waterBowlsRef(hid), bowlId), data)
}

export function deleteWaterBowl(hid: string, bowlId: string): Promise<unknown> {
  return deleteDoc(doc(waterBowlsRef(hid), bowlId))
}

export interface PlanInput {
  effectiveFrom: Date
  mealsPerDay: number
  firstMealAt: string
  lastMealAt: string
  mealTimes: string[]
  setAtWeightKg: number | null
  note: string | null
}

export interface PlanItemInput {
  foodId: string
  foodNameSnapshot: string
  amountPerDayG: number
}

/**
 * Save a plan revision: a new plan doc plus its items, in one batch. Atomic
 * because a plan whose items half-landed would silently under-feed the cat —
 * and unlike a half-copied day, nobody would notice by looking.
 */
export function savePlan(
  hid: string,
  catId: string,
  uid: string,
  input: PlanInput,
  items: readonly PlanItemInput[],
): Promise<unknown> {
  const batch = writeBatch(db)
  const planDoc = doc(plansRef(hid, catId))

  batch.set(planDoc, {
    ...input,
    effectiveFrom: Timestamp.fromDate(input.effectiveFrom),
    createdBy: uid,
    createdAt: serverTimestamp(),
  })

  for (const item of items) {
    batch.set(doc(planItemsRef(hid, catId, planDoc.id)), { ...item })
  }

  return batch.commit()
}

/** Remove a plan and its items — for a revision saved by mistake. */
export async function deletePlan(hid: string, catId: string, planId: string): Promise<unknown> {
  const items = await getDocs(query(planItemsRef(hid, catId, planId)))
  const batch = writeBatch(db)
  for (const item of items.docs) batch.delete(item.ref)
  batch.delete(doc(plansRef(hid, catId), planId))
  return batch.commit()
}

export interface FeedingInput {
  datetime: Date
  foodId: string | null
  foodNameSnapshot: string
  amountG: number
  kcal: number
  note: string | null
  /** The planned bowl this ticks off; both null for anything off-plan. */
  planId: string | null
  mealIndex: number | null
}

export function addFeeding(
  hid: string,
  catId: string,
  uid: string,
  input: FeedingInput,
): Promise<unknown> {
  return addDoc(feedingsRef(hid, catId), {
    ...input,
    datetime: Timestamp.fromDate(input.datetime),
    createdBy: uid,
    createdAt: serverTimestamp(),
  })
}

/**
 * Log several foods at once — ticking one planned bowl during a flavour
 * switch writes a feeding per food. One batch, so a bowl either lands whole or
 * not at all; a half-recorded meal would read as a smaller portion than the
 * cat actually got.
 */
export function addFeedings(
  hid: string,
  catId: string,
  uid: string,
  inputs: readonly FeedingInput[],
): Promise<unknown> {
  const batch = writeBatch(db)
  for (const input of inputs) {
    batch.set(doc(feedingsRef(hid, catId)), {
      ...input,
      datetime: Timestamp.fromDate(input.datetime),
      createdBy: uid,
      createdAt: serverTimestamp(),
    })
  }
  return batch.commit()
}

export function deleteFeeding(hid: string, catId: string, entryId: string): Promise<unknown> {
  return deleteDoc(doc(feedingsRef(hid, catId), entryId))
}

/** Un-tick a bowl: every feeding it wrote goes, or none does. */
export function deleteFeedings(
  hid: string,
  catId: string,
  entryIds: readonly string[],
): Promise<unknown> {
  const batch = writeBatch(db)
  for (const entryId of entryIds) batch.delete(doc(feedingsRef(hid, catId), entryId))
  return batch.commit()
}

/**
 * Correct when a ticked bowl actually happened. Feedings are append-only
 * (rules deny `update`), so this is a delete-and-recreate — done as one
 * batch so a network drop mid-fix can never leave the bowl un-ticked.
 */
export function retimeFeedings(
  hid: string,
  catId: string,
  uid: string,
  entries: readonly Feeding[],
  datetime: Date,
): Promise<unknown> {
  const batch = writeBatch(db)
  const stamp = Timestamp.fromDate(datetime)
  for (const entry of entries) {
    batch.delete(doc(feedingsRef(hid, catId), entry.id))
    batch.set(doc(feedingsRef(hid, catId)), {
      datetime: stamp,
      foodId: entry.foodId,
      foodNameSnapshot: entry.foodNameSnapshot,
      amountG: entry.amountG,
      kcal: entry.kcal,
      note: entry.note,
      planId: entry.planId,
      mealIndex: entry.mealIndex,
      createdBy: uid,
      createdAt: serverTimestamp(),
    })
  }
  return batch.commit()
}

// Re-exported so feature code can type cache data without importing schemas.
export type {
  Cat,
  Feeding,
  Food,
  FoodStockEvent,
  LitterBagUnit,
  LitterBox,
  LitterKind,
  LitterStockEvent,
  MealTimeOverride,
  Plan,
  PlanItem,
  WaterBowl,
  WeightEntry,
}
