import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test'

// Shared setup for specs that need a populated app: a signed-in user, a
// household, a kitten, a food, a meal and a weigh-in. Each call creates its
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

export async function seedHousehold(page: Page, options: SeedOptions): Promise<void> {
  const email = `${options.tag}-${String(Date.now())}@example.com`

  await page.goto('/')
  await expect(page.getByTestId('dev-sign-in')).toBeVisible(WAIT)
  await page.getByTestId('dev-email').fill(email)
  await page.getByTestId('dev-password').fill('password123')
  await page.getByTestId('dev-submit').click()

  await expect(page.getByTestId('household-name')).toBeVisible(WAIT)
  // Named after the tag so seedYesterdayMeal can find this household's docs.
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

  await tabBar(page).getByRole('link', { name: 'Food' }).click()
  await expect(page.getByTestId('food-add-open')).toBeVisible(WAIT)
  await page.getByTestId('food-add-open').click()
  await page.getByTestId('food-name').fill('Test Kibble with a fairly long name')
  await page.getByTestId('food-type').selectOption('dry')
  await page.getByTestId('food-kcal-per-gram').fill('3.5')
  await page.getByTestId('food-save').click()

  // 69 g a day of a 3.5 kcal/g food is 242 kcal — near enough this kitten's
  // 237 kcal target that the "she's outgrown this" nudge stays quiet.
  await expect(page.getByTestId('plan-setup')).toBeVisible(WAIT)
  await page.getByTestId('plan-setup').click()
  await expect(page.getByTestId('plan-item-grams-0')).toBeVisible(WAIT)
  await page.getByTestId('plan-item-grams-0').fill('69')
  await page.getByTestId('plan-save').click()
  await expect(page.getByTestId('today-meals')).toHaveText('0 of 3', WAIT)
}

// ---------- direct emulator writes ----------
// A plan revision is always "from today" in the UI (by design), so the plan
// history needs an older plan to show. Write it straight to the Firestore
// emulator's REST API, which bypasses rules with the well-known `owner`
// bearer token.

const EMULATOR = 'http://127.0.0.1:8080/v1/projects/demo-cattrack/databases/(default)/documents'
const OWNER = { Authorization: 'Bearer owner' } as const

interface RestDoc {
  name?: string
  fields?: Record<string, { stringValue?: string }>
}

async function listDocs(request: APIRequestContext, path: string): Promise<RestDoc[]> {
  const response = await request.get(`${EMULATOR}/${path}`, { headers: OWNER })
  expect(response.ok(), `emulator list ${path} failed`).toBe(true)
  const body = (await response.json()) as { documents?: RestDoc[] }
  return body.documents ?? []
}

/** Resolve `households/<tag>/cats/<first>` to a REST-relative path. */
async function catPathFor(request: APIRequestContext, tag: string): Promise<string> {
  const households = await listDocs(request, 'households')
  const household = households.find((d) => d.fields?.['name']?.stringValue === tag)
  const householdPath = household?.name
  if (householdPath === undefined) throw new Error(`no household named ${tag}`)
  // The REST `name` is a full resource path; keep the part after /documents/.
  const relative = householdPath.slice(householdPath.indexOf('/documents/') + 11)

  const cats = await listDocs(request, `${relative}/cats`)
  const catPath = cats[0]?.name
  if (catPath === undefined) throw new Error('no cat in that household')
  return catPath.slice(catPath.indexOf('/documents/') + 11)
}

/**
 * Add a superseded plan for the household named `tag`, dated a fortnight ago,
 * so the plan history has something to draw. Points at the household's first
 * food so its energy figure resolves like a real plan's would.
 */
export async function seedPreviousPlan(request: APIRequestContext, tag: string): Promise<void> {
  const catRelative = await catPathFor(request, tag)

  const foods = await listDocs(request, `${catRelative}/foods`)
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
        transition: { nullValue: null },
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
