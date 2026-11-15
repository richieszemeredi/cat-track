import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test'

// Shared setup for specs that need a populated app: a signed-in user, a
// household, a kitten, a food, a plan and a weigh-in. Each call creates its
// own user so specs (and projects) never collide on emulator state.

// Firestore emulator + webkit can be slow on first paint / first connection.
export const WAIT = { timeout: 15_000 } as const

export function tabBar(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Main' })
}

/** A date `days` ago as yyyy-MM-dd, via plain ms arithmetic (always valid). */
export function daysAgoISO(days: number): string {
  const iso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  return iso.slice(0, 10)
}

export interface SeedOptions {
  /** Unique-per-spec suffix so parallel projects get separate users. */
  tag: string
  /** Kitten age in days — 90 keeps it in the weeks-labelled kitten range. */
  ageDays?: number
}

/** A date `days` ago in the LOCAL calendar, as a date input wants it. */
export function localDaysAgoISO(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * A signed-in user, a household named `tag`, a kitten called Mochi and one
 * weigh-in of 1.50 kg today, then a food (added on Supplies) and her plan
 * (set on Plan): 69 g a day in three meals. Leaves the page on Plan.
 */
export async function seedHousehold(page: Page, options: SeedOptions): Promise<void> {
  await seedCat(page, options)

  await addFoodOnSupplies(page, {
    name: 'Test Kibble with a fairly long name',
    type: 'dry',
    kcalPerGram: '3.5',
  })

  // 69 g a day of a 3.5 kcal/g food is 242 kcal — near enough this kitten's
  // 237 kcal target that the "she's outgrown this" nudge stays quiet.
  await tabBar(page).getByRole('link', { name: 'Plan' }).click()
  await expect(page.getByTestId('plan-setup')).toBeVisible(WAIT)
  await page.getByTestId('plan-setup').click()
  await expect(page.getByTestId('plan-item-grams-0')).toBeVisible(WAIT)
  await page.getByTestId('plan-item-grams-0').fill('69')
  await page.getByTestId('plan-save').click()
  await expect(page.getByTestId('plan-ratio')).toContainText('%', WAIT)
}

/**
 * Everything in `seedHousehold` up to the food: the user, the household, Mochi
 * and today's 1.50 kg. Leaves the page on Weight.
 */
export async function seedCat(page: Page, options: SeedOptions): Promise<void> {
  const email = `${options.tag}-${String(Date.now())}@example.com`

  await page.goto('/')
  await expect(page.getByTestId('dev-sign-in')).toBeVisible(WAIT)
  await page.getByTestId('dev-email').fill(email)
  await page.getByTestId('dev-password').fill('password123')
  await page.getByTestId('dev-submit').click()

  await expect(page.getByTestId('household-name')).toBeVisible(WAIT)
  // Named after the tag so the REST seeders below can find this household.
  await page.getByTestId('household-name').fill(options.tag)
  await page.getByTestId('household-create').click()
  await expect(tabBar(page)).toBeVisible(WAIT)

  await tabBar(page).getByRole('link', { name: 'Profile' }).click()
  await expect(page.getByTestId('cat-name')).toBeVisible(WAIT)
  await page.getByTestId('cat-name').fill('Mochi')
  await page.getByTestId('cat-birthdate').fill(daysAgoISO(options.ageDays ?? 90))
  await page.getByTestId('cat-sex').selectOption('female')
  await page.getByTestId('cat-save').click()
  await expect(page.getByRole('heading', { name: 'Mochi' })).toBeVisible(WAIT)

  // Weigh in before the plan: the plan records what she weighed when it was
  // set, and needs a target to show a percentage against.
  await tabBar(page).getByRole('link', { name: 'Weight' }).click()
  await expect(page.getByTestId('weight-kg')).toBeVisible(WAIT)
  await page.getByTestId('weight-kg').fill('1.50')
  await page.getByTestId('weight-save').click()
  await expect(page.getByTestId('weight-latest')).toHaveText('1.50 kg', WAIT)
}

export interface FoodSeed {
  name: string
  type: 'dry' | 'wet' | 'treat'
  kcalPerGram: string
  /** Grams in one tin / pouch / bag. */
  unitSizeG?: string
  /** How many are on the shelf when it is added. */
  openingUnits?: string
}

/**
 * Add a food the way a person would: Supplies, "Add food", the form. Leaves
 * the page on Supplies with the food's stock card showing.
 */
export async function addFoodOnSupplies(page: Page, food: FoodSeed): Promise<void> {
  await tabBar(page).getByRole('link', { name: 'Supplies' }).click()
  await expect(page.getByRole('heading', { name: 'Supplies', level: 1 })).toBeVisible(WAIT)
  // The chip is there before the catalog has loaded; the skeleton swaps for
  // the columns once it has, so wait for the column's own label.
  await expect(page.getByRole('heading', { name: 'Food', level: 2 })).toBeVisible(WAIT)
  await page.getByTestId('supplies-add-food').click()
  await expect(page.getByTestId('food-name')).toBeVisible(WAIT)
  await page.getByTestId('food-name').fill(food.name)
  await page.getByTestId('food-type').selectOption(food.type)
  await page.getByTestId('food-kcal-per-gram').fill(food.kcalPerGram)
  if (food.unitSizeG !== undefined) await page.getByTestId('food-unit-size').fill(food.unitSizeG)
  if (food.openingUnits !== undefined) {
    await page.getByTestId('food-opening-units').fill(food.openingUnits)
  }
  await page.getByTestId('food-save').click()

  // A lost click on Add food would otherwise surface as an empty plan form.
  await expect(page.getByTestId('food-supply').filter({ hasText: food.name }).first()).toBeVisible(
    WAIT,
  )
  await expect(page.getByTestId('food-name')).toBeHidden(WAIT)
}

export interface LitterSeed {
  name: string
  /** Bag size as typed, comma or point. */
  bagSize?: string
  bagUnit?: 'kg' | 'L'
  /** How many bags are on the shelf when it is added. */
  openingBags?: string
}

/**
 * Add a kind of litter the way a person would: Supplies, "Add litter", the
 * form. Leaves the page on Supplies with the kind's stock card showing.
 */
export async function addLitterOnSupplies(page: Page, litter: LitterSeed): Promise<void> {
  await tabBar(page).getByRole('link', { name: 'Supplies' }).click()
  await expect(page.getByRole('heading', { name: 'Litter', level: 2 })).toBeVisible(WAIT)
  await page.getByTestId('supplies-add-litter').click()
  await expect(page.getByTestId('litter-kind-name')).toBeVisible(WAIT)
  await page.getByTestId('litter-kind-name').fill(litter.name)
  if (litter.bagSize !== undefined) {
    await page.getByTestId('litter-kind-bag-size').fill(litter.bagSize)
  }
  if (litter.bagUnit !== undefined) {
    await page.getByTestId(`litter-kind-unit-${litter.bagUnit}`).click()
  }
  if (litter.openingBags !== undefined) {
    await page.getByTestId('litter-kind-opening-bags').fill(litter.openingBags)
  }
  await page.getByTestId('litter-kind-save').click()

  await expect(
    page.getByTestId('litter-supply').filter({ hasText: litter.name }).first(),
  ).toBeVisible(WAIT)
  await expect(page.getByTestId('litter-kind-name')).toBeHidden(WAIT)
}

/**
 * A second cat, added the way a person would: through the "Add another cat"
 * section on Profile. Leaves the page on Profile. Mochi stays the active cat —
 * adding one does not switch to it.
 */
export async function seedSecondCat(page: Page, name: string): Promise<void> {
  await tabBar(page).getByRole('link', { name: 'Profile' }).click()
  await page.getByText('Add another cat', { exact: true }).click()
  await page.getByTestId('cat-name').last().fill(name)
  await page.getByTestId('cat-birthdate').last().fill(daysAgoISO(400))
  await page.getByTestId('cat-sex').last().selectOption('male')
  await page.getByTestId('cat-save').last().click()
  // The switcher only exists once there are two cats, so its chip is the
  // proof the write landed.
  await expect(page.getByRole('button', { name, exact: true })).toBeVisible(WAIT)
}

/** Opens Home's folded "Litter boxes" if it is closed. Leaves the page on Home. */
export async function openLitterFold(page: Page): Promise<void> {
  await tabBar(page).getByRole('link', { name: 'Home' }).click()
  const fold = page.getByTestId('home-litter')
  await expect(fold).toBeVisible(WAIT)
  if ((await fold.getAttribute('open')) === null) {
    await page.getByTestId('home-litter-summary').click()
  }
  await expect(fold).toHaveAttribute('open', '', WAIT)
}

/**
 * Opens the "Add litter box" form inside Home's litter fold. It starts open
 * while there are no boxes and closes itself after each save, so the state
 * depends on the moment.
 */
export async function openLitterAddForm(page: Page): Promise<void> {
  await openLitterFold(page)
  if (await page.getByTestId('litter-location').first().isVisible()) return
  await page.getByTestId('litter-add-toggle').click()
  await expect(page.getByTestId('litter-location').first()).toBeVisible(WAIT)
}

/**
 * Two litter boxes — one fresh, one well past its four weeks — so Home's
 * litter fold lays out both states. Leaves the page on Home with it open.
 */
export async function seedLitterBoxes(page: Page): Promise<void> {
  await openLitterAddForm(page)

  await page.getByTestId('litter-location').fill('Bathroom')
  await page.getByTestId('litter-save').click()
  await expect(page.getByTestId('home-litter').getByText('Bathroom', { exact: true })).toBeVisible(
    WAIT,
  )
  // The add form folds away once the server acks — typing the next one
  // before that would be wiped by the reset.
  await expect(page.getByTestId('litter-location')).toBeHidden(WAIT)

  await openLitterAddForm(page)
  await page.getByTestId('litter-location').fill('Hallway behind the big wardrobe')
  // 38 days is five weeks whichever side of midnight UTC the local day falls.
  await page.getByTestId('litter-date').fill(daysAgoISO(38))
  await page.getByTestId('litter-save').click()
  await expect(page.getByText('· 5 weeks ago')).toBeVisible(WAIT)
  await expect(page.getByTestId('litter-location')).toBeHidden(WAIT)
}

/**
 * Two water bowls — one just filled, one left standing for two days — so
 * Home lays out both water states. The stale one is written straight to the
 * emulator: the add form defaults to "now". Leaves the page on Home.
 */
export async function seedWaterBowls(
  page: Page,
  request: APIRequestContext,
  tag: string,
): Promise<void> {
  await tabBar(page).getByRole('link', { name: 'Home' }).click()
  await expect(page.getByTestId('water-track')).toBeVisible(WAIT)
  await page.getByTestId('water-track').click()

  await page.getByTestId('water-location').fill('Kitchen')
  await page.getByTestId('water-save').click()
  await expect(page.getByTestId('home-water-age')).toHaveText('changed just now', WAIT)
  await expect(page.getByTestId('water-location')).toBeHidden(WAIT)

  const relative = await householdPathFor(request, tag)
  const twoDaysAgo = new Date(Date.now() - 49 * 3_600_000).toISOString()
  const response = await request.post(`${EMULATOR}/${relative}/waterBowls`, {
    headers: OWNER,
    data: {
      fields: {
        location: { stringValue: 'Hallway behind the big wardrobe' },
        lastChangedAt: { timestampValue: twoDaysAgo },
        createdBy: { stringValue: 'seed' },
        createdAt: { timestampValue: new Date().toISOString() },
      },
    },
  })
  expect(response.ok(), 'seeding a stale water bowl failed').toBe(true)
  await expect(page.getByText('changed 2 days ago')).toBeVisible(WAIT)
}

// ---------- direct emulator writes ----------
// A plan revision is always "from today" in the UI (by design), so the plan
// history needs an older plan to show. Write it straight to the Firestore
// emulator's REST API, which bypasses rules with the well-known `owner`
// bearer token.

const EMULATOR = 'http://127.0.0.1:8080/v1/projects/demo-cattrack/databases/(default)/documents'
const OWNER = { Authorization: 'Bearer owner' } as const

export interface RestDoc {
  name?: string
  fields?: Record<string, { stringValue?: string }>
}

// The REST list returns 20 documents unless asked for more, and every spec
// run adds a household or two to the one shared emulator — past 20 the
// household a spec just created would not be in the first page.
const LIST_PAGE_SIZE = 300

async function listDocs(request: APIRequestContext, path: string): Promise<RestDoc[]> {
  const response = await request.get(`${EMULATOR}/${path}?pageSize=${String(LIST_PAGE_SIZE)}`, {
    headers: OWNER,
  })
  expect(response.ok(), `emulator list ${path} failed`).toBe(true)
  const body = (await response.json()) as { documents?: RestDoc[] }
  return body.documents ?? []
}

/** Resolve the household named `tag` to a REST-relative path. */
export async function householdPathFor(request: APIRequestContext, tag: string): Promise<string> {
  const households = await listDocs(request, 'households')
  const household = households.find((d) => d.fields?.['name']?.stringValue === tag)
  const householdPath = household?.name
  if (householdPath === undefined) throw new Error(`no household named ${tag}`)
  // The REST `name` is a full resource path; keep the part after /documents/.
  return relativeOf(householdPath)
}

function relativeOf(resourceName: string): string {
  return resourceName.slice(resourceName.indexOf('/documents/') + 11)
}

/** Resolve `households/<tag>/cats/<first>` to a REST-relative path. */
async function catPathFor(request: APIRequestContext, tag: string): Promise<string> {
  const relative = await householdPathFor(request, tag)
  const cats = await listDocs(request, `${relative}/cats`)
  const catPath = cats[0]?.name
  if (catPath === undefined) throw new Error('no cat in that household')
  return relativeOf(catPath)
}

/**
 * Add a superseded plan for the household named `tag`, dated a fortnight ago,
 * so the plan history has something to draw. Points at the household's first
 * food so its energy figure resolves like a real plan's would.
 */
export async function seedPreviousPlan(request: APIRequestContext, tag: string): Promise<void> {
  const catRelative = await catPathFor(request, tag)

  // Foods belong to the household, not the cat.
  const householdRelative = catRelative.slice(0, catRelative.indexOf('/cats/'))
  const foods = await listDocs(request, `${householdRelative}/foods`)
  const foodPath = foods[0]?.name
  if (foodPath === undefined) throw new Error('no food to build a plan from')
  const foodId = foodPath.slice(foodPath.lastIndexOf('/') + 1)
  const foodName = foods[0]?.fields?.['name']?.stringValue ?? 'Test Kibble'

  const twoWeeksAgo = new Date()
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)
  twoWeeksAgo.setHours(0, 0, 0, 0)
  const at = twoWeeksAgo.toISOString()

  const planResponse = await request.post(`${EMULATOR}/${catRelative}/plans`, {
    headers: OWNER,
    data: {
      fields: {
        effectiveFrom: { timestampValue: at },
        mealsPerDay: { integerValue: '4' },
        firstMealAt: { stringValue: '07:00' },
        lastMealAt: { stringValue: '21:00' },
        setAtWeightKg: { doubleValue: 1.1 },
        note: { nullValue: null },
        createdBy: { stringValue: 'seed' },
        createdAt: { timestampValue: at },
      },
    },
  })
  expect(planResponse.ok(), 'seeding a previous plan failed').toBe(true)

  const created = (await planResponse.json()) as RestDoc
  const planPath = created.name
  if (planPath === undefined) throw new Error('emulator returned no plan path')
  const planRelative = planPath.slice(planPath.indexOf('/documents/') + 11)

  const itemResponse = await request.post(`${EMULATOR}/${planRelative}/items`, {
    headers: OWNER,
    data: {
      fields: {
        foodId: { stringValue: foodId },
        foodNameSnapshot: { stringValue: foodName },
        amountPerDayG: { doubleValue: 48 },
      },
    },
  })
  expect(itemResponse.ok(), 'seeding a previous plan item failed').toBe(true)
}

/**
 * Add a weigh-in a week before the seeded one, so the weight screens show the
 * week-over-week figure ("+180 g per week since ...") rather than the
 * first-weigh-in fallback. That sentence is the longest line the Latest
 * section can produce, which is exactly what the layout pass wants to measure.
 */
export async function seedLastWeeksWeighIn(request: APIRequestContext, tag: string): Promise<void> {
  const catRelative = await catPathFor(request, tag)

  const aWeekAgo = new Date()
  aWeekAgo.setDate(aWeekAgo.getDate() - 7)
  aWeekAgo.setHours(9, 0, 0, 0)
  const at = aWeekAgo.toISOString()

  const response = await request.post(`${EMULATOR}/${catRelative}/weights`, {
    headers: OWNER,
    data: {
      fields: {
        date: { timestampValue: at },
        // 1.32 kg a week before the seeded 1.50 kg: +180 g per week.
        weightKg: { doubleValue: 1.32 },
        note: { nullValue: null },
        createdBy: { stringValue: 'seed' },
        createdAt: { timestampValue: at },
      },
    },
  })
  expect(response.ok(), "seeding last week's weigh-in failed").toBe(true)
}

/**
 * A food as it was stored before foods moved to the household: under the
 * household's first cat, at `cats/{catId}/foods/{foodId}`, and nowhere else —
 * with the retired `packageSizeG` still on it, as the oldest docs have. Plus a
 * plan from today that names it by that id, so the copy only counts as a
 * migration if every screen still resolves the same id. 240 g a day of a
 * 1 kcal/g food in three meals: 80 g a bowl, 240 kcal a day.
 */
export async function seedLegacyFoodAndPlan(
  request: APIRequestContext,
  tag: string,
  food: { id: string; name: string },
): Promise<void> {
  const catRelative = await catPathFor(request, tag)
  const created = new Date(Date.now() - 30 * 24 * 3_600_000).toISOString()

  const foodResponse = await request.post(
    `${EMULATOR}/${catRelative}/foods?documentId=${encodeURIComponent(food.id)}`,
    {
      headers: OWNER,
      data: {
        fields: {
          name: { stringValue: food.name },
          brand: { nullValue: null },
          type: { stringValue: 'wet' },
          kcalPerGram: { doubleValue: 1 },
          packageSizeG: { integerValue: '400' },
          archived: { booleanValue: false },
          createdBy: { stringValue: 'legacy-seed' },
          createdAt: { timestampValue: created },
        },
      },
    },
  )
  expect(foodResponse.ok(), 'seeding a legacy food failed').toBe(true)

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const planResponse = await request.post(`${EMULATOR}/${catRelative}/plans`, {
    headers: OWNER,
    data: {
      fields: {
        effectiveFrom: { timestampValue: today.toISOString() },
        mealsPerDay: { integerValue: '3' },
        firstMealAt: { stringValue: '07:00' },
        lastMealAt: { stringValue: '19:00' },
        setAtWeightKg: { doubleValue: 1.5 },
        note: { nullValue: null },
        createdBy: { stringValue: 'legacy-seed' },
        createdAt: { timestampValue: new Date().toISOString() },
      },
    },
  })
  expect(planResponse.ok(), 'seeding a legacy plan failed').toBe(true)
  const plan = (await planResponse.json()) as RestDoc
  if (plan.name === undefined) throw new Error('emulator returned no plan path')

  const itemResponse = await request.post(`${EMULATOR}/${relativeOf(plan.name)}/items`, {
    headers: OWNER,
    data: {
      fields: {
        foodId: { stringValue: food.id },
        foodNameSnapshot: { stringValue: food.name },
        amountPerDayG: { doubleValue: 240 },
      },
    },
  })
  expect(itemResponse.ok(), 'seeding a legacy plan item failed').toBe(true)
}

/** The household-level food doc with this id, or null while there is none. */
export async function householdFood(
  request: APIRequestContext,
  tag: string,
  foodId: string,
): Promise<RestDoc | null> {
  const relative = await householdPathFor(request, tag)
  const response = await request.get(`${EMULATOR}/${relative}/foods/${foodId}`, {
    headers: OWNER,
  })
  if (response.status() === 404) return null
  expect(response.ok(), 'reading a household food failed').toBe(true)
  return (await response.json()) as RestDoc
}
