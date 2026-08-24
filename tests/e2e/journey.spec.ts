import { expect, test } from '@playwright/test'
import { daysAgoISO, tabBar, WAIT } from './seed'

/**
 * Full household journey against the Firebase emulators (fresh state per
 * `npm run test:e2e` run). A single long test is the most robust shape here:
 * Firebase auth lives in IndexedDB, which Playwright's storageState does not
 * capture, so splitting into separate tests would force a fresh sign-in per
 * test anyway. The email is unique per run so re-runs against a still-warm
 * emulator never collide with an earlier user.
 */

const PASSWORD = 'password123'

// ~3 months ago — always a valid past date (kitten life stage) regardless of
// month boundaries.
const CAT_BIRTH_DATE = daysAgoISO(90)

test('full household journey', async ({ page, context }, testInfo) => {
  // Unique per project as well as per run: the journey runs on both the
  // WebKit and the Chromium project, in parallel, against one emulator.
  const EMAIL = `journey-${testInfo.project.name}-${String(Date.now())}@example.com`

  // Sign-in, household, cat, food, meals, weight and the offline round-trip
  // all run in one flow; give it room beyond the 60s default.
  test.setTimeout(240_000)

  // ---- a. dev sign-in (creates the user in the auth emulator) ----
  await page.goto('/')
  await expect(page.getByTestId('dev-sign-in')).toBeVisible(WAIT)
  await page.getByTestId('dev-email').fill(EMAIL)
  await page.getByTestId('dev-password').fill(PASSWORD)
  await page.getByTestId('dev-submit').click()

  // ---- b. first run: create the household ----
  await expect(page.getByTestId('household-name')).toBeVisible(WAIT)
  await page.getByTestId('household-name').fill('Test Home')
  await page.getByTestId('household-create').click()
  await expect(tabBar(page)).toBeVisible(WAIT)

  // ---- c. cat profile ----
  await tabBar(page).getByRole('link', { name: 'Profile' }).click()
  await expect(page.getByTestId('cat-name')).toBeVisible(WAIT)
  await page.getByTestId('cat-name').fill('Mochi')
  await page.getByTestId('cat-birthdate').fill(CAT_BIRTH_DATE)
  await page.getByTestId('cat-sex').selectOption('female')
  // neutered stays unchecked
  await page.getByTestId('cat-save').click()
  // The saved cat renders as the profile card heading.
  await expect(page.getByRole('heading', { name: 'Mochi' })).toBeVisible(WAIT)

  // ---- d. weigh in, so the plan has a target to sit against ----
  await tabBar(page).getByRole('link', { name: 'Weight' }).click()
  await expect(page.getByTestId('weight-kg')).toBeVisible(WAIT)
  await page.getByTestId('weight-kg').fill('1.50')
  await page.getByTestId('weight-save').click()
  await expect(page.getByTestId('weight-latest')).toHaveText('1.50 kg', WAIT)

  // ---- e. add a food ----
  await tabBar(page).getByRole('link', { name: 'Food' }).click()
  await expect(page.getByTestId('food-add-open')).toBeVisible(WAIT)
  await page.getByTestId('food-add-open').click()
  await page.getByTestId('food-name').fill('Test Kibble')
  await page.getByTestId('food-type').selectOption('dry')
  await page.getByTestId('food-kcal-per-gram').fill('3.5')
  await page.getByTestId('food-save').click()

  // Catalog row: the name, then the energy line "3.5 kcal/g · 350 kcal / 100 g".
  // Scoped to the list item: a bare getByText would also match a form's
  // <option>, which Playwright treats as hidden.
  await expect(page.getByRole('listitem').filter({ hasText: 'Test Kibble' })).toBeVisible(WAIT)
  await expect(page.getByText('3.5 kcal/g · 350 kcal / 100 g')).toBeVisible(WAIT)

  // ---- f. set her plan: a count, a window, and grams a day ----
  await expect(page.getByTestId('plan-setup')).toBeVisible(WAIT)
  await page.getByTestId('plan-setup').click()

  // Meal times are derived, never typed.
  await expect(page.getByTestId('plan-times')).toHaveText('6 h apart — 07:00 · 13:00 · 19:00', WAIT)
  await page.getByTestId('plan-item-grams-0').fill('69')
  // 69 g × 3.5 kcal/g = 242 kcal a day, 23 g a meal.
  await expect(page.getByTestId('plan-daily-kcal')).toHaveText('242')
  await expect(page.getByTestId('plan-per-meal')).toHaveText('Each meal: 23 g Test Kibble')
  await page.getByTestId('plan-save').click()

  // ---- g. tick a bowl ----
  await expect(page.getByTestId('today-meals')).toHaveText('0 of 3', WAIT)
  await expect(page.getByTestId('plan-ratio')).toContainText('%', WAIT)

  await page.getByTestId('meal-tick-0').click()
  await expect(page.getByTestId('today-meals')).toHaveText('1 of 3', WAIT)
  // 23 g × 3.5 = 81 kcal of the 242 the plan is worth.
  await expect(page.getByTestId('today-kcal')).toContainText('81 of 242 kcal', WAIT)

  // A tick is undoable — it deletes the feedings it wrote.
  await page.getByTestId('meal-tick-0').click()
  await expect(page.getByTestId('today-meals')).toHaveText('0 of 3', WAIT)
  await page.getByTestId('meal-tick-0').click()
  await expect(page.getByTestId('today-meals')).toHaveText('1 of 3', WAIT)

  // ---- h. the dashboard leads with the same figure ----
  await tabBar(page).getByRole('link', { name: 'Home' }).click()
  await expect(page.getByTestId('dash-meals-today')).toHaveText('1 of 3', WAIT)
  await expect(page.getByTestId('dash-weight')).toContainText('1.50 kg', WAIT)

  // ---- i. offline: tick another bowl, then sync ----
  await context.setOffline(true)
  await tabBar(page).getByRole('link', { name: 'Food' }).click()
  await expect(page.getByTestId('meal-tick-1')).toBeVisible(WAIT)
  await page.getByTestId('meal-tick-1').click()
  // Firestore latency compensation shows the queued tick immediately.
  await expect(page.getByTestId('today-meals')).toHaveText('2 of 3', WAIT)

  await context.setOffline(false)
  // One short settle so the queued write reaches the emulator before reload.
  // (Even if it hadn't, the pending write persists in IndexedDB and re-syncs.)
  await page.waitForTimeout(2000)
  await page.reload()

  // After reload the app re-authenticates and re-reads from the emulator —
  // the offline tick must still be there.
  await expect(tabBar(page)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('today-meals')).toHaveText('2 of 3', { timeout: 30_000 })
})
