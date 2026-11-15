import { expect, test } from '@playwright/test'
import { addFoodOnSupplies, daysAgoISO, localDaysAgoISO, tabBar, WAIT } from './seed'

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

  // ---- d. yesterday's weigh-in, so the plan has a target to sit against ----
  await tabBar(page).getByRole('link', { name: 'Weight' }).click()
  await expect(page.getByTestId('weight-kg')).toBeVisible(WAIT)
  await page.getByTestId('weight-kg').fill('1.50')
  await page.getByLabel('Date').fill(localDaysAgoISO(1))
  await page.getByTestId('weight-save').click()
  await expect(page.getByTestId('weight-latest')).toHaveText('1.50 kg', WAIT)

  // ---- e. Home before there is a plan: it says so, and points at Plan ----
  await tabBar(page).getByRole('link', { name: 'Home' }).click()
  await expect(page.getByRole('heading', { name: 'Mochi', level: 1 })).toBeVisible(WAIT)
  await expect(page.getByText('No feeding plan yet.')).toBeVisible(WAIT)
  await expect(page.getByRole('link', { name: 'Set a plan' })).toBeVisible()

  // ---- f. add a food on Supplies, with what it comes in and how many ----
  await addFoodOnSupplies(page, {
    name: 'Test Kibble',
    type: 'dry',
    kcalPerGram: '3.5',
    unitSizeG: '2000',
    openingUnits: '3',
  })
  const kibble = page.getByTestId('food-supply').filter({ hasText: 'Test Kibble' })
  await expect(kibble).toContainText('Dry · 2000 g bags')
  // Just counted, nothing eaten since: an exact figure, no "about".
  await expect(kibble.getByTestId('food-supply-figure')).toHaveText('3', WAIT)
  await expect(kibble).toContainText('bags left')
  await expect(kibble).toContainText('not on a plan · counted just now')

  // ---- g. set her plan on Plan: a count, a window, and grams a day ----
  await tabBar(page).getByRole('link', { name: 'Plan' }).click()
  await expect(page.getByTestId('plan-setup')).toBeVisible(WAIT)
  await page.getByTestId('plan-setup').click()

  // Meal times are derived, never typed.
  await expect(page.getByTestId('plan-times')).toHaveText('6 h apart — 07:00 · 13:00 · 19:00', WAIT)
  await page.getByTestId('plan-item-grams-0').fill('69')
  // 69 g × 3.5 kcal/g = 242 kcal a day, 23 g a meal.
  await expect(page.getByTestId('plan-daily-kcal')).toHaveText('242')
  await expect(page.getByTestId('plan-per-meal')).toHaveText('Each meal: 23 g Test Kibble')
  await page.getByTestId('plan-save').click()

  await expect(page.getByTestId('plan-ratio')).toContainText('%', WAIT)
  await expect(page.getByText('3 meals, 07:00 to 19:00')).toBeVisible()
  await expect(page.getByText('69 g a day')).toBeVisible()
  await expect(page.getByText('23 g a meal')).toBeVisible()
  await expect(page.getByTestId('plan-since')).toContainText('Mochi · in force since')

  // ---- h. tick a bowl on Home ----
  await tabBar(page).getByRole('link', { name: 'Home' }).click()
  const firstTick = page.getByTestId('meal-tick-0')
  await expect(firstTick).toHaveAttribute('aria-pressed', 'false', WAIT)
  // Grams only on Home — the calories live on Plan.
  const breakfast = page.getByRole('listitem').filter({ has: firstTick })
  await expect(breakfast).toContainText('Test Kibble')
  await expect(breakfast).toContainText('23 g')
  await expect(breakfast).not.toContainText('kcal')

  await firstTick.click()
  await expect(firstTick).toHaveAttribute('aria-pressed', 'true', WAIT)
  // A tick is undoable — it deletes the feedings it wrote.
  await firstTick.click()
  await expect(firstTick).toHaveAttribute('aria-pressed', 'false', WAIT)
  await firstTick.click()
  await expect(firstTick).toHaveAttribute('aria-pressed', 'true', WAIT)

  // ---- h2. a bowl given late drags the rest of the day with it ----
  // The tick logs the bowl's own due time, so a day only runs off schedule
  // once a given meal is corrected to when it really happened. Everything
  // after it shifts by that much — which is the state a moved bowl has to
  // survive.
  await page.getByTestId('meal-time-0').click()
  await page.getByTestId('meal-time-input-0').fill('07:30')
  await page.getByTestId('meal-time-save-0').click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Planned 13:00' })).toContainText(
    '13:30',
    WAIT,
  )

  // ---- h3. move a bowl without touching the plan ----
  // A plan is never edited, so "feed her an hour early today" is an override
  // both phones read. It lands on the time typed and nowhere else — the 30
  // minutes breakfast ran late must not slide 12:00 to 12:30 — and the bowls
  // after it follow by that same hour, so the day keeps the plan's spacing.
  await page.getByTestId('meal-time-1').click()
  await page.getByTestId('meal-time-input-1').fill('12:00')
  await page.getByTestId('meal-time-save-1').click()
  const middayMeal = page.getByRole('listitem').filter({ hasText: 'Planned 13:00' })
  await expect(middayMeal).toContainText('12:00', WAIT)
  await expect(middayMeal).not.toContainText('12:30')
  await expect(page.getByRole('listitem').filter({ hasText: 'Planned 19:00' })).toContainText(
    '18:00',
    WAIT,
  )

  // ---- i. start tracking the water, right under the bowls ----
  await page.getByTestId('water-track').click()
  await page.getByTestId('water-location').fill('Kitchen')
  await page.getByTestId('water-save').click()
  const water = page.getByTestId('home-water-row')
  // One bowl is just "Water"; the location only tells several apart.
  await expect(water).toContainText('Water', WAIT)
  await expect(page.getByTestId('home-water-age')).toHaveText('changed just now', WAIT)
  // Refreshed a moment ago: nothing to refresh yet.
  await expect(page.getByTestId('water-refreshed')).toBeDisabled()

  // ---- j. weigh in on Home, and the row moves on ----
  await expect(page.getByTestId('home-weight-latest')).toHaveText('1.50 kg', WAIT)
  // A comma, as the iOS decimal keypad types one.
  await page.getByTestId('home-weight-kg').fill('1,62')
  await page.getByTestId('home-weight-save').click()
  await expect(page.getByTestId('home-weight-latest')).toHaveText('1.62 kg', WAIT)
  // A day apart is too short a span for a weekly figure: the raw change.
  await expect(page.getByTestId('home-weight-trend')).toHaveText(
    '+120 g since the last weigh-in',
    WAIT,
  )
  // Weighed today: the field goes until tomorrow.
  await expect(page.getByTestId('home-weight-kg')).toHaveCount(0)

  // The same weigh-in, on the Weight screen.
  await tabBar(page).getByRole('link', { name: 'Weight' }).click()
  await expect(page.getByTestId('weight-latest')).toHaveText('1.62 kg', WAIT)

  // ---- k. offline: tick another bowl, then sync ----
  await tabBar(page).getByRole('link', { name: 'Home' }).click()
  const secondTick = page.getByTestId('meal-tick-1')
  await expect(secondTick).toBeVisible(WAIT)
  await context.setOffline(true)
  await secondTick.click()
  // Firestore latency compensation shows the queued tick immediately.
  await expect(secondTick).toHaveAttribute('aria-pressed', 'true', WAIT)

  await context.setOffline(false)
  // One short settle so the queued write reaches the emulator before reload.
  // (Even if it hadn't, the pending write persists in IndexedDB and re-syncs.)
  await page.waitForTimeout(2000)
  await page.reload()

  // After reload the app re-authenticates and re-reads from the emulator —
  // the offline tick must still be there.
  await expect(tabBar(page)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('meal-tick-1')).toHaveAttribute('aria-pressed', 'true', {
    timeout: 30_000,
  })
  await expect(page.getByTestId('meal-tick-0')).toHaveAttribute('aria-pressed', 'true')
  // The moved bowl came from Firestore, not from this tab's state — which is
  // what makes it visible on the household's other phone.
  await expect(middayMeal).toContainText('12:00', { timeout: 30_000 })
})
