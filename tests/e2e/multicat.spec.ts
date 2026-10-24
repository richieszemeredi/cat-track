import { expect, test } from '@playwright/test'
import { seedHousehold, seedSecondCat, tabBar, WAIT } from './seed'

/**
 * Two cats end to end: the switcher appears once there is a second cat, the
 * cat-scoped screens follow it, and the choice survives moving between tabs
 * and a reload (it is remembered on the device).
 */
test('the switcher moves Food, Weight and Profile between cats', async ({ page }, testInfo) => {
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

  // The choice follows the tab bar: Biscuit has no plan, Mochi's 3 bowls are not hers.
  await tabBar(page).getByRole('link', { name: 'Food' }).click()
  await expect(page.getByTestId('plan-setup')).toBeVisible(WAIT)
  await expect(page.getByTestId('today-meals')).toHaveCount(0)

  await tabBar(page).getByRole('link', { name: 'Profile' }).click()
  await expect(page.getByRole('heading', { name: 'Biscuit' })).toBeVisible(WAIT)

  // And a reload: remembered on this device.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Biscuit' })).toBeVisible(WAIT)

  // Back to Mochi: her plan and weight return.
  await switcher.getByRole('button', { name: 'Mochi' }).click()
  await tabBar(page).getByRole('link', { name: 'Food' }).click()
  await expect(page.getByTestId('today-meals')).toHaveText('0 of 3', WAIT)
})
