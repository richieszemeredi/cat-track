import { expect, test } from '@playwright/test'
import { seedHousehold, seedSecondCat, tabBar, WAIT } from './seed'

/**
 * Two cats end to end: the switcher appears once there is a second cat, the
 * one-cat screens (Weight, Profile) follow it, and the choice survives moving
 * between tabs and a reload (it is remembered on the device).
 */
test('the switcher moves Weight and Profile between cats', async ({ page }, testInfo) => {
  test.setTimeout(180_000)

  await seedHousehold(page, { tag: `multicat-${testInfo.project.name}` })

  // One cat: no switcher anywhere.
  await tabBar(page).getByRole('link', { name: 'Weight' }).click()
  await expect(page.getByTestId('weight-latest')).toHaveText('1.50 kg', WAIT)
  await expect(page.getByRole('group', { name: 'Cat' })).toHaveCount(0)

  await seedSecondCat(page, 'Biscuit')

  // Adding a cat does not switch to it: Profile still shows Mochi.
  await expect(page.getByRole('heading', { name: 'Mochi' })).toBeVisible(WAIT)
  const switcher = page.getByRole('group', { name: 'Cat' })
  await expect(switcher.getByRole('button', { name: 'Mochi' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  // Weight: Mochi has a weigh-in, Biscuit has none.
  await tabBar(page).getByRole('link', { name: 'Weight' }).click()
  await expect(page.getByTestId('weight-latest')).toHaveText('1.50 kg', WAIT)
  await switcher.getByRole('button', { name: 'Biscuit' }).click()
  await expect(page.getByTestId('weight-latest')).toHaveText('—', WAIT)
  await expect(page.getByText('No weigh-ins yet.')).toBeVisible(WAIT)

  // The choice follows the tab bar to Profile.
  await tabBar(page).getByRole('link', { name: 'Profile' }).click()
  await expect(page.getByRole('heading', { name: 'Biscuit' })).toBeVisible(WAIT)

  // And a reload: remembered on this device.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Biscuit' })).toBeVisible(WAIT)

  // Back to Mochi: her weight returns.
  await switcher.getByRole('button', { name: 'Mochi' }).click()
  await tabBar(page).getByRole('link', { name: 'Weight' }).click()
  await expect(page.getByTestId('weight-latest')).toHaveText('1.50 kg', WAIT)
})

/**
 * Home and Plan show every cat at once, whichever one is selected: a block per
 * cat, with no switcher to forget about.
 */
test('Home and Plan give each cat a block of her own', async ({ page }, testInfo) => {
  test.setTimeout(180_000)

  await seedHousehold(page, { tag: `multicat-blocks-${testInfo.project.name}` })
  await seedSecondCat(page, 'Biscuit')

  // ---- Plan: Mochi's plan, and Biscuit's "set her plan" ----
  await tabBar(page).getByRole('link', { name: 'Plan' }).click()
  await expect(page.getByRole('heading', { name: 'Plan', level: 1 })).toBeVisible(WAIT)
  await expect(page.getByRole('group', { name: 'Cat' })).toHaveCount(0)
  const planBlock = (name: string) =>
    page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: new RegExp(`^${name} · `) }) })
  await expect(planBlock('Mochi')).toContainText('69 g a day', WAIT)
  await expect(planBlock('Mochi').getByTestId('plan-ratio')).toContainText('%')
  await expect(planBlock('Biscuit').getByTestId('plan-setup')).toBeVisible(WAIT)

  // Biscuit's plan, from her own block: the editor names her.
  await planBlock('Biscuit').getByTestId('plan-setup').click()
  await expect(page.getByRole('heading', { name: 'Set her plan', level: 1 })).toBeVisible(WAIT)
  await expect(page.getByText('Biscuit', { exact: true })).toBeVisible()
  await page.getByTestId('plan-item-grams-0').fill('60')
  await page.getByTestId('plan-save').click()
  await expect(planBlock('Biscuit')).toContainText('60 g a day', WAIT)
  await expect(planBlock('Mochi')).toContainText('69 g a day')

  // ---- Home: each cat's bowls under her own label ----
  await tabBar(page).getByRole('link', { name: 'Home' }).click()
  await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible(WAIT)
  const homeBlock = (name: string) =>
    page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: new RegExp(`^${name} · `) }) })
  await expect(homeBlock('Mochi')).toContainText('23 g', WAIT)
  await expect(homeBlock('Biscuit')).toContainText('20 g', WAIT)

  // A tick is the cat's own: Biscuit's breakfast leaves Mochi's untouched.
  await homeBlock('Biscuit').getByTestId('meal-tick-0').click()
  await expect(homeBlock('Biscuit').getByTestId('meal-tick-0')).toHaveAttribute(
    'aria-pressed',
    'true',
    WAIT,
  )
  await expect(homeBlock('Mochi').getByTestId('meal-tick-0')).toHaveAttribute(
    'aria-pressed',
    'false',
  )

  // One weight row per cat, named.
  const weightRows = page.getByTestId('home-weight-row')
  await expect(weightRows).toHaveCount(2, WAIT)
  await expect(weightRows.filter({ hasText: 'Mochi' })).toContainText('1.50 kg today')
  await expect(weightRows.filter({ hasText: 'Biscuit' })).toContainText('No weigh-ins yet')

  // The off-plan fold has a list per cat.
  await page.getByTestId('home-off-plan-summary').click()
  const offPlan = page.getByTestId('home-off-plan')
  await expect(offPlan.getByRole('heading', { name: 'Mochi' })).toBeVisible(WAIT)
  await expect(offPlan.getByRole('heading', { name: 'Biscuit' })).toBeVisible()
})
