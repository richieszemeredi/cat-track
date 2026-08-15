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

const RUN_ID = String(Date.now())
const EMAIL = `journey-${RUN_ID}@example.com`
const PASSWORD = 'password123'

// ~3 months ago — always a valid past date (kitten life stage) regardless of
// month boundaries.
const CAT_BIRTH_DATE = daysAgoISO(90)

test('full household journey', async ({ page, context }) => {
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
  // The saved cat renders as the profile card heading ("🐾 Mochi").
  await expect(page.getByRole('heading', { name: 'Mochi' })).toBeVisible(WAIT)

  // ---- d. add a food, log a meal ----
  await tabBar(page).getByRole('link', { name: 'Food' }).click()
  await expect(page.getByTestId('food-add-open')).toBeVisible(WAIT)
  await page.getByTestId('food-add-open').click()
  await page.getByTestId('food-name').fill('Test Kibble')
  await page.getByTestId('food-type').selectOption('dry')
  await page.getByTestId('food-kcal-per-gram').fill('3.5')
  await page.getByTestId('food-save').click()

  // Catalog row: "{name} {badge}" plus the energy line "3.5 kcal/g · 350 kcal / 100 g".
  // Scoped to the list item: a bare getByText would also match the meal form's
  // <option>, which Playwright treats as hidden.
  await expect(page.getByRole('listitem').filter({ hasText: 'Test Kibble' })).toBeVisible(WAIT)
  await expect(page.getByText('3.5 kcal/g · 350 kcal / 100 g')).toBeVisible(WAIT)

  // The meal form only renders once an active food exists.
  await expect(page.getByTestId('meal-grams')).toBeVisible(WAIT)
  await page.getByTestId('meal-grams').fill('40')
  // 40 g × 3.5 kcal/g = 140 kcal live preview.
  await expect(page.getByTestId('meal-kcal-preview')).toHaveText('≈ 140 kcal')
  await page.getByTestId('meal-save').click()

  // Today's list + totals reflect the meal (no weigh-in yet, so no target).
  await expect(page.getByTestId('today-kcal')).toHaveText('140', WAIT)
  await expect(page.getByText('Total: 40 g · 140 kcal')).toBeVisible(WAIT)

  // ---- e. weigh in, check the dashboard ----
  await tabBar(page).getByRole('link', { name: 'Weight' }).click()
  await expect(page.getByTestId('weight-kg')).toBeVisible(WAIT)
  await page.getByTestId('weight-kg').fill('1.50')
  await page.getByTestId('weight-save').click()
  await expect(page.getByTestId('weight-latest')).toHaveText('1.50 kg', WAIT)

  await tabBar(page).getByRole('link', { name: 'Home' }).click()
  // With a weight logged there is a daily target: "140 / <target> kcal".
  await expect(page.getByTestId('dash-kcal-today')).toContainText('140', WAIT)
  await expect(page.getByTestId('dash-weight')).toContainText('1.50 kg', WAIT)

  // ---- f. offline: log a meal, then sync ----
  await context.setOffline(true)
  await tabBar(page).getByRole('link', { name: 'Food' }).click()
  await expect(page.getByTestId('meal-grams')).toBeVisible(WAIT)
  await page.getByTestId('meal-grams').fill('30')
  await page.getByTestId('meal-save').click()
  // Firestore latency compensation shows the queued meal immediately:
  // 40+30 g and 140+105 kcal.
  await expect(page.getByText('Total: 70 g · 245 kcal')).toBeVisible(WAIT)

  await context.setOffline(false)
  // One short settle so the queued write reaches the emulator before reload.
  // (Even if it hadn't, the pending write persists in IndexedDB and re-syncs.)
  await page.waitForTimeout(2000)
  await page.reload()

  // After reload the app re-authenticates and re-reads from the emulator —
  // the offline-logged meal must still be there.
  await expect(tabBar(page)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('Total: 70 g · 245 kcal')).toBeVisible({ timeout: 30_000 })
})
