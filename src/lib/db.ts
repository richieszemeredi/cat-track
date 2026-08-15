import { queryOptions, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { type User } from 'firebase/auth'
import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type CollectionReference,
  type QuerySnapshot,
} from 'firebase/firestore'
import { useEffect } from 'react'
import { type z } from 'zod'
import { db } from './firebase'
import {
  catSchema,
  feedingSchema,
  foodSchema,
  memberSchema,
  weightEntrySchema,
  type Cat,
  type Feeding,
  type Food,
  type FoodType,
  type LifeStage,
  type Role,
  type Sex,
  type WeightEntry,
} from './schemas'

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
function foodsRef(hid: string, catId: string): CollectionReference {
  return collection(db, 'households', hid, 'cats', catId, 'foods')
}
function feedingsRef(hid: string, catId: string): CollectionReference {
  return collection(db, 'households', hid, 'cats', catId, 'feedings')
}

// ---------- membership discovery ----------

export interface Membership {
  householdId: string
  role: Role
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
  return { householdId, role: parsed.data.role }
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

export function foodsQueryOptions(hid: string, catId: string) {
  return queryOptions({
    queryKey: ['foods', hid, catId] as const,
    queryFn: async () =>
      parseDocs(foodSchema, await getDocs(query(foodsRef(hid, catId), orderBy('name', 'asc')))),
    staleTime: Infinity,
  })
}

export function useFoodsLive(hid: string, catId: string): void {
  const qc = useQueryClient()
  useEffect(
    () =>
      onSnapshot(
        query(foodsRef(hid, catId), orderBy('name', 'asc')),
        (snap) => {
          qc.setQueryData(foodsQueryOptions(hid, catId).queryKey, parseDocs(foodSchema, snap))
        },
        onListenError(qc, foodsQueryOptions(hid, catId).queryKey),
      ),
    [hid, catId, qc],
  )
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
            orderBy('datetime', 'desc'),
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
          orderBy('datetime', 'desc'),
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
 * The most recent feedings across all days, newest first — powers the
 * "repeat a previous day" shortcut. Capped: we only ever need the last day or
 * two that actually had meals, and a cat eats a handful of times a day.
 */
const RECENT_FEEDINGS_LIMIT = 40

export function recentFeedingsQueryOptions(hid: string, catId: string) {
  return queryOptions({
    queryKey: ['feedings-recent', hid, catId] as const,
    queryFn: async () =>
      parseDocs(
        feedingSchema,
        await getDocs(
          query(feedingsRef(hid, catId), orderBy('datetime', 'desc'), limit(RECENT_FEEDINGS_LIMIT)),
        ),
      ),
    staleTime: Infinity,
  })
}

export function useRecentFeedingsLive(hid: string, catId: string): void {
  const qc = useQueryClient()
  useEffect(
    () =>
      onSnapshot(
        query(feedingsRef(hid, catId), orderBy('datetime', 'desc'), limit(RECENT_FEEDINGS_LIMIT)),
        (snap) => {
          qc.setQueryData(
            recentFeedingsQueryOptions(hid, catId).queryKey,
            parseDocs(feedingSchema, snap),
          )
        },
        onListenError(qc, recentFeedingsQueryOptions(hid, catId).queryKey),
      ),
    [hid, catId, qc],
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
    displayName: user.displayName ?? user.email ?? 'Owner',
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
}

export function addFood(
  hid: string,
  catId: string,
  uid: string,
  input: FoodInput,
): Promise<unknown> {
  return addDoc(foodsRef(hid, catId), {
    ...input,
    archived: false,
    createdBy: uid,
    createdAt: serverTimestamp(),
  })
}

export function updateFood(
  hid: string,
  catId: string,
  foodId: string,
  patch: Partial<FoodInput & { archived: boolean }>,
): Promise<unknown> {
  return updateDoc(doc(foodsRef(hid, catId), foodId), { ...patch })
}

export interface FeedingInput {
  datetime: Date
  foodId: string | null
  foodNameSnapshot: string
  amountG: number
  kcal: number
  note: string | null
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
 * Log several meals at once ("repeat a previous day"). One batch so the day
 * either lands whole or not at all — a half-copied day is worse than none.
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

// Re-exported so feature code can type cache data without importing schemas.
export type { Cat, Feeding, Food, WeightEntry }
