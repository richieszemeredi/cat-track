import { readFileSync } from 'node:fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  type Firestore,
  getDoc,
  getDocs,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

// Fixed timestamps — the rules only check `is timestamp`, but explicit
// fixtures keep the suite independent of wall-clock behavior.
const CREATED_AT = Timestamp.fromDate(new Date('2026-01-10T08:00:00Z'))
const BIRTH_DATE = Timestamp.fromDate(new Date('2020-05-01T00:00:00Z'))
const ENTRY_DATE = Timestamp.fromDate(new Date('2026-01-15T18:30:00Z'))

const H1 = 'households/h1'
const C1 = `${H1}/cats/c1`

let testEnv: RulesTestEnvironment

// @firebase/rules-unit-testing v5 still types `firestore()` as the compat
// instance; the modular API unwraps it at runtime via getModularInstance,
// so the double assertion is safe.
function modular(ctx: RulesTestContext): Firestore {
  return ctx.firestore() as unknown as Firestore
}

function authedDb(uid: string): Firestore {
  return modular(testEnv.authenticatedContext(uid))
}

function unauthedDb(): Firestore {
  return modular(testEnv.unauthenticatedContext())
}

async function seedDoc(path: string, data: Record<string, unknown>): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(modular(ctx), path), data)
  })
}

// ---------- fixtures (fresh object per call so tests can override) ----------

function household(ownerUid: string) {
  return { name: 'Test household', createdAt: CREATED_AT, ownerUid }
}

function member(uid: string, role: string, displayName: string) {
  return { uid, role, joinedAt: CREATED_AT, displayName }
}

function cat() {
  return {
    name: 'Whiskers',
    birthDate: BIRTH_DATE,
    breed: null,
    sex: 'female',
    neutered: false,
    neuterDate: null,
    idealWeightKg: null,
    lifeStage: null,
    merMultiplierOverride: null,
    householdId: 'h1',
    createdBy: 'alice',
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  }
}

function weight(createdBy: string) {
  return {
    date: ENTRY_DATE,
    weightKg: 1.2,
    bodyConditionScore: null,
    note: null,
    createdBy,
    createdAt: CREATED_AT,
  }
}

function food(createdBy: string) {
  return {
    name: 'Dry chow',
    brand: null,
    type: 'dry',
    kcalPerGram: 3.8,
    packageSizeG: null,
    archived: false,
    createdBy,
    createdAt: CREATED_AT,
  }
}

function feeding(createdBy: string) {
  return {
    datetime: ENTRY_DATE,
    foodId: null,
    foodNameSnapshot: 'Dry chow',
    amountG: 40,
    kcal: 152,
    mealType: null,
    note: null,
    createdBy,
    createdAt: CREATED_AT,
  }
}

// ---------- lifecycle ----------

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-cattrack',
    firestore: {
      rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  })
})

afterAll(async () => {
  await testEnv.cleanup()
})

beforeEach(async () => {
  await testEnv.clearFirestore()
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = modular(ctx)
    await setDoc(doc(db, H1), household('alice'))
    await setDoc(doc(db, `${H1}/members/alice`), member('alice', 'owner', 'Alice'))
    await setDoc(doc(db, `${H1}/members/bob`), member('bob', 'editor', 'Bob'))
    await setDoc(doc(db, `${H1}/members/vera`), member('vera', 'viewer', 'Vera'))
    await setDoc(doc(db, C1), cat())
  })
})

// ---------- households ----------

describe('households', () => {
  it('allows any member (even a viewer) to read the household', async () => {
    await assertSucceeds(getDoc(doc(authedDb('vera'), H1)))
  })

  it('denies household reads to non-members and unauthenticated users', async () => {
    await assertFails(getDoc(doc(authedDb('mallory'), H1)))
    await assertFails(getDoc(doc(unauthedDb(), H1)))
  })

  it('allows creating a household whose ownerUid matches the caller', async () => {
    await assertSucceeds(setDoc(doc(authedDb('alice'), 'households/h2'), household('alice')))
  })

  it('denies creating a household with a mismatched ownerUid', async () => {
    await assertFails(setDoc(doc(authedDb('mallory'), 'households/h2'), household('alice')))
  })

  it('denies creating a household with an unknown extra field', async () => {
    await assertFails(
      setDoc(doc(authedDb('alice'), 'households/h2'), { ...household('alice'), notes: 'extra' }),
    )
  })

  it('allows the owner to rename the household', async () => {
    await assertSucceeds(updateDoc(doc(authedDb('alice'), H1), { name: 'Renamed household' }))
  })

  it('denies the owner changing ownerUid', async () => {
    await assertFails(updateDoc(doc(authedDb('alice'), H1), { ownerUid: 'bob' }))
  })

  it('denies editors updating the household', async () => {
    await assertFails(updateDoc(doc(authedDb('bob'), H1), { name: 'Bob was here' }))
  })

  it('denies household deletion even for the owner', async () => {
    await assertFails(deleteDoc(doc(authedDb('alice'), H1)))
  })
})

// ---------- members ----------

describe('members', () => {
  it('allows a new user to bootstrap household + owner membership in one batch', async () => {
    const db = authedDb('dana')
    const batch = writeBatch(db)
    batch.set(doc(db, 'households/hd'), household('dana'))
    batch.set(doc(db, 'households/hd/members/dana'), member('dana', 'owner', 'Dana'))
    await assertSucceeds(batch.commit())
  })

  it('denies bootstrap when the self-created membership role is not owner', async () => {
    const db = authedDb('dana')
    const batch = writeBatch(db)
    batch.set(doc(db, 'households/hd'), household('dana'))
    batch.set(doc(db, 'households/hd/members/dana'), member('dana', 'editor', 'Dana'))
    await assertFails(batch.commit())
  })

  it('denies bootstrap that creates a member doc for another uid', async () => {
    const db = authedDb('dana')
    const batch = writeBatch(db)
    batch.set(doc(db, 'households/hd'), household('dana'))
    batch.set(doc(db, 'households/hd/members/frank'), member('frank', 'owner', 'Frank'))
    await assertFails(batch.commit())
  })

  it('allows the owner to add a member as editor', async () => {
    await assertSucceeds(
      setDoc(doc(authedDb('alice'), `${H1}/members/carl`), member('carl', 'editor', 'Carl')),
    )
  })

  it('denies the owner adding a member with role owner', async () => {
    await assertFails(
      setDoc(doc(authedDb('alice'), `${H1}/members/carl`), member('carl', 'owner', 'Carl')),
    )
  })

  it('denies editors adding members', async () => {
    await assertFails(
      setDoc(doc(authedDb('bob'), `${H1}/members/dave`), member('dave', 'editor', 'Dave')),
    )
  })

  it('allows the owner to change a member role', async () => {
    await assertSucceeds(updateDoc(doc(authedDb('alice'), `${H1}/members/bob`), { role: 'viewer' }))
  })

  it('denies promoting a member to owner via update', async () => {
    await assertFails(updateDoc(doc(authedDb('alice'), `${H1}/members/bob`), { role: 'owner' }))
  })

  it('denies demoting the owner via update', async () => {
    await assertFails(updateDoc(doc(authedDb('alice'), `${H1}/members/alice`), { role: 'editor' }))
  })

  it('allows a member to leave (self-delete)', async () => {
    await assertSucceeds(deleteDoc(doc(authedDb('bob'), `${H1}/members/bob`)))
  })

  it('allows the owner to remove a member', async () => {
    await assertSucceeds(deleteDoc(doc(authedDb('alice'), `${H1}/members/bob`)))
  })

  it('denies deleting the owner membership, even by the owner themselves', async () => {
    await assertFails(deleteDoc(doc(authedDb('alice'), `${H1}/members/alice`)))
  })

  it('allows members to list the member collection', async () => {
    await assertSucceeds(getDocs(collection(authedDb('bob'), `${H1}/members`)))
  })

  it('denies non-members and unauthenticated users listing members', async () => {
    await assertFails(getDocs(collection(authedDb('mallory'), `${H1}/members`)))
    await assertFails(getDocs(collection(unauthedDb(), `${H1}/members`)))
  })
})

// ---------- membership discovery via collection group ----------

describe('membership discovery (collectionGroup on members)', () => {
  it('allows a signed-in user to query their own member docs', async () => {
    const db = authedDb('bob')
    await assertSucceeds(getDocs(query(collectionGroup(db, 'members'), where('uid', '==', 'bob'))))
  })

  it("denies querying another user's member docs", async () => {
    const db = authedDb('bob')
    await assertFails(getDocs(query(collectionGroup(db, 'members'), where('uid', '==', 'alice'))))
  })

  it('denies unauthenticated collection-group queries', async () => {
    const db = unauthedDb()
    await assertFails(getDocs(query(collectionGroup(db, 'members'), where('uid', '==', 'bob'))))
  })
})

// ---------- cats ----------

describe('cats', () => {
  it('allows members (viewer) to read a cat', async () => {
    await assertSucceeds(getDoc(doc(authedDb('vera'), C1)))
  })

  it('denies non-members reading a cat', async () => {
    await assertFails(getDoc(doc(authedDb('mallory'), C1)))
  })

  it('allows editors to create a fully valid cat', async () => {
    await assertSucceeds(
      addDoc(collection(authedDb('bob'), `${H1}/cats`), { ...cat(), createdBy: 'bob' }),
    )
  })

  it("denies creating a cat stamped with someone else's createdBy", async () => {
    // bob is the caller but the doc claims alice created it
    await assertFails(addDoc(collection(authedDb('bob'), `${H1}/cats`), cat()))
  })

  it('denies creating a cat with a non-string breed', async () => {
    await assertFails(
      addDoc(collection(authedDb('bob'), `${H1}/cats`), { ...cat(), createdBy: 'bob', breed: 7 }),
    )
  })

  it('denies creating a cat with an invalid lifeStage', async () => {
    await assertFails(
      addDoc(collection(authedDb('bob'), `${H1}/cats`), {
        ...cat(),
        createdBy: 'bob',
        lifeStage: 'ancient',
      }),
    )
  })

  it('denies viewers creating a cat', async () => {
    await assertFails(addDoc(collection(authedDb('vera'), `${H1}/cats`), cat()))
  })

  it('denies creating a cat with an empty name', async () => {
    await assertFails(addDoc(collection(authedDb('bob'), `${H1}/cats`), { ...cat(), name: '' }))
  })

  it('denies creating a cat whose birthDate is not a timestamp', async () => {
    await assertFails(
      addDoc(collection(authedDb('bob'), `${H1}/cats`), { ...cat(), birthDate: '2020-05-01' }),
    )
  })

  it('denies creating a cat whose householdId does not match the path', async () => {
    await assertFails(
      addDoc(collection(authedDb('bob'), `${H1}/cats`), { ...cat(), householdId: 'h2' }),
    )
  })

  it('denies merMultiplierOverride above 5', async () => {
    await assertFails(
      addDoc(collection(authedDb('bob'), `${H1}/cats`), { ...cat(), merMultiplierOverride: 6 }),
    )
  })

  it('denies creating a cat with an unknown extra key', async () => {
    await assertFails(
      addDoc(collection(authedDb('bob'), `${H1}/cats`), { ...cat(), color: 'black' }),
    )
  })

  it('allows the owner to delete a cat', async () => {
    await assertSucceeds(deleteDoc(doc(authedDb('alice'), C1)))
  })

  it('denies editors deleting a cat', async () => {
    await assertFails(deleteDoc(doc(authedDb('bob'), C1)))
  })
})

// ---------- weights ----------

describe('weights', () => {
  const weights = `${C1}/weights`

  it('allows editors to create a valid weight entry', async () => {
    await assertSucceeds(addDoc(collection(authedDb('bob'), weights), weight('bob')))
  })

  it('denies weightKg of 0', async () => {
    await assertFails(
      addDoc(collection(authedDb('bob'), weights), { ...weight('bob'), weightKg: 0 }),
    )
  })

  it('denies weightKg above 30', async () => {
    await assertFails(
      addDoc(collection(authedDb('bob'), weights), { ...weight('bob'), weightKg: 31 }),
    )
  })

  it('denies weightKg as a string', async () => {
    await assertFails(
      addDoc(collection(authedDb('bob'), weights), { ...weight('bob'), weightKg: '2' }),
    )
  })

  it('denies bodyConditionScore outside 1-9', async () => {
    await assertFails(
      addDoc(collection(authedDb('bob'), weights), { ...weight('bob'), bodyConditionScore: 10 }),
    )
  })

  it('denies createdBy that is not the caller', async () => {
    await assertFails(addDoc(collection(authedDb('bob'), weights), weight('alice')))
  })

  it('denies viewers creating weight entries', async () => {
    await assertFails(addDoc(collection(authedDb('vera'), weights), weight('vera')))
  })

  it('allows members to read weight entries', async () => {
    await seedDoc(`${weights}/w1`, weight('bob'))
    await assertSucceeds(getDoc(doc(authedDb('vera'), `${weights}/w1`)))
  })

  it('allows editors to delete weight entries', async () => {
    await seedDoc(`${weights}/w1`, weight('bob'))
    await assertSucceeds(deleteDoc(doc(authedDb('bob'), `${weights}/w1`)))
  })

  it('denies edits — weight entries are append-only', async () => {
    await seedDoc(`${weights}/w1`, weight('bob'))
    await assertFails(updateDoc(doc(authedDb('bob'), `${weights}/w1`), { weightKg: 2.5 }))
  })
})

// ---------- foods ----------

describe('foods', () => {
  const foods = `${C1}/foods`

  it('allows editors to create a valid food', async () => {
    await assertSucceeds(addDoc(collection(authedDb('bob'), foods), food('bob')))
  })

  it('denies a type outside dry/wet/treat', async () => {
    await assertFails(addDoc(collection(authedDb('bob'), foods), { ...food('bob'), type: 'raw' }))
  })

  it('denies kcalPerGram above 10', async () => {
    await assertFails(
      addDoc(collection(authedDb('bob'), foods), { ...food('bob'), kcalPerGram: 11 }),
    )
  })

  it('denies a non-numeric packageSizeG', async () => {
    await assertFails(
      addDoc(collection(authedDb('bob'), foods), { ...food('bob'), packageSizeG: 'big bag' }),
    )
  })

  it('denies kcalPerGram of 0', async () => {
    await assertFails(
      addDoc(collection(authedDb('bob'), foods), { ...food('bob'), kcalPerGram: 0 }),
    )
  })

  it('denies non-boolean archived', async () => {
    await assertFails(
      addDoc(collection(authedDb('bob'), foods), { ...food('bob'), archived: 'yes' }),
    )
  })

  it('denies viewers creating foods', async () => {
    await assertFails(addDoc(collection(authedDb('vera'), foods), food('vera')))
  })

  it('allows editors to archive a food', async () => {
    await seedDoc(`${foods}/f1`, food('alice'))
    await assertSucceeds(updateDoc(doc(authedDb('bob'), `${foods}/f1`), { archived: true }))
  })
})

// ---------- feedings ----------

describe('feedings', () => {
  const feedings = `${C1}/feedings`

  it('allows editors to create a valid feeding', async () => {
    await assertSucceeds(addDoc(collection(authedDb('bob'), feedings), feeding('bob')))
  })

  it('denies amountG of 0', async () => {
    await assertFails(
      addDoc(collection(authedDb('bob'), feedings), { ...feeding('bob'), amountG: 0 }),
    )
  })

  it('denies amountG above 500', async () => {
    await assertFails(
      addDoc(collection(authedDb('bob'), feedings), { ...feeding('bob'), amountG: 501 }),
    )
  })

  it('denies negative kcal', async () => {
    await assertFails(
      addDoc(collection(authedDb('bob'), feedings), { ...feeding('bob'), kcal: -1 }),
    )
  })

  it('denies kcal above 2000', async () => {
    await assertFails(
      addDoc(collection(authedDb('bob'), feedings), { ...feeding('bob'), kcal: 2001 }),
    )
  })

  it('denies an empty foodNameSnapshot', async () => {
    await assertFails(
      addDoc(collection(authedDb('bob'), feedings), { ...feeding('bob'), foodNameSnapshot: '' }),
    )
  })

  it('denies createdBy that is not the caller', async () => {
    await assertFails(addDoc(collection(authedDb('bob'), feedings), feeding('alice')))
  })

  it('denies viewers creating feedings', async () => {
    await assertFails(addDoc(collection(authedDb('vera'), feedings), feeding('vera')))
  })

  it('allows members to read feedings', async () => {
    await seedDoc(`${feedings}/fe1`, feeding('bob'))
    await assertSucceeds(getDoc(doc(authedDb('vera'), `${feedings}/fe1`)))
  })

  it('allows editors to delete feedings', async () => {
    await seedDoc(`${feedings}/fe1`, feeding('bob'))
    await assertSucceeds(deleteDoc(doc(authedDb('bob'), `${feedings}/fe1`)))
  })

  it('denies edits — feedings are append-only', async () => {
    await seedDoc(`${feedings}/fe1`, feeding('bob'))
    await assertFails(updateDoc(doc(authedDb('bob'), `${feedings}/fe1`), { kcal: 999 }))
  })
})

// ---------- invites (no match block -> default deny) ----------

describe('invites', () => {
  it('denies all reads', async () => {
    await assertFails(getDoc(doc(authedDb('alice'), 'invites/x')))
    await assertFails(getDoc(doc(unauthedDb(), 'invites/x')))
  })

  it('denies all writes', async () => {
    await assertFails(setDoc(doc(authedDb('alice'), 'invites/x'), { code: 'x' }))
    await assertFails(setDoc(doc(authedDb('mallory'), 'invites/x'), { code: 'x' }))
  })
})
