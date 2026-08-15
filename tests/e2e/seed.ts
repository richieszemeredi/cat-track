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

  await tabBar(page).getByRole('link', { name: 'Food' }).click()
  await expect(page.getByTestId('food-add-open')).toBeVisible(WAIT)
  await page.getByTestId('food-add-open').click()
  await page.getByTestId('food-name').fill('Test Kibble with a fairly long name')
  await page.getByTestId('food-type').selectOption('dry')
  await page.getByTestId('food-kcal-per-gram').fill('3.5')
  await page.getByTestId('food-save').click()

  await expect(page.getByTestId('meal-grams')).toBeVisible(WAIT)
  await page.getByTestId('meal-grams').fill('40')
  await page.getByTestId('meal-save').click()
  await expect(page.getByTestId('today-kcal')).toHaveText('140', WAIT)

  await tabBar(page).getByRole('link', { name: 'Weight' }).click()
  await expect(page.getByTestId('weight-kg')).toBeVisible(WAIT)
  await page.getByTestId('weight-kg').fill('1.50')
  await page.getByTestId('weight-save').click()
  await expect(page.getByTestId('weight-latest')).toHaveText('1.50 kg', WAIT)
}

// ---------- direct emulator writes ----------
// The UI can only log meals for today (by design), so "repeat a previous day"
// needs a yesterday to repeat. Write it straight to the Firestore emulator's
// REST API, which bypasses rules with the well-known `owner` bearer token.

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

/**
 * Log a meal on the previous calendar day for the household named `tag`.
 * Timestamps are built from the local clock so the meal lands on the same
 * "yesterday" the browser computes.
 */
export async function seedYesterdayMeal(request: APIRequestContext, tag: string): Promise<void> {
  const households = await listDocs(request, 'households')
  const household = households.find((d) => d.fields?.['name']?.stringValue === tag)
  const householdPath = household?.name
  if (householdPath === undefined) throw new Error(`no household named ${tag}`)
  // The REST `name` is a full resource path; keep the part after /documents/.
  const relative = householdPath.slice(householdPath.indexOf('/documents/') + 11)

  const cats = await listDocs(request, `${relative}/cats`)
  const catPath = cats[0]?.name
  if (catPath === undefined) throw new Error('no cat to attach a meal to')
  const catRelative = catPath.slice(catPath.indexOf('/documents/') + 11)

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const at = (hours: number, minutes: number) => {
    const when = new Date(yesterday)
    when.setHours(hours, minutes, 0, 0)
    return when.toISOString()
  }

  for (const [hours, minutes, grams] of [
    [7, 15, 35],
    [19, 30, 45],
  ] as const) {
    const response = await request.post(`${EMULATOR}/${catRelative}/feedings`, {
      headers: OWNER,
      data: {
        fields: {
          datetime: { timestampValue: at(hours, minutes) },
          foodId: { nullValue: null },
          foodNameSnapshot: { stringValue: 'Test Kibble with a fairly long name' },
          amountG: { doubleValue: grams },
          kcal: { doubleValue: grams * 3.5 },
          note: { nullValue: null },
          createdBy: { stringValue: 'seed' },
          createdAt: { timestampValue: at(hours, minutes) },
        },
      },
    })
    expect(response.ok(), 'seeding a previous-day meal failed').toBe(true)
  }
}
