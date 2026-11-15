import { expect, test } from '@playwright/test'
import { daysAgoISO, seedHousehold, tabBar, WAIT } from './seed'

/**
 * Water bowls end to end, on Home under the meals: start tracking one, see it
 * fresh, rename it, correct the time after a missed log, mark the water
 * refreshed, add a second bowl, and delete one.
 */
test('water bowls show when the water was last replaced', async ({ page }, testInfo) => {
  test.setTimeout(180_000)

  await seedHousehold(page, { tag: `water-${testInfo.project.name}` })
  await tabBar(page).getByRole('link', { name: 'Home' }).click()

  // Nothing tracked yet: just the chip.
  await expect(page.getByTestId('water-track')).toBeVisible(WAIT)
  await expect(page.getByTestId('home-water')).toHaveCount(0)
  await page.getByTestId('water-track').click()
  await page.getByTestId('water-location').fill('Kitchen')
  await page.getByTestId('water-save').click()

  const row = page.getByTestId('home-water-row')
  const age = page.getByTestId('home-water-age')
  // One bowl is just "Water"; the location only tells several apart.
  await expect(row).toContainText('Water', WAIT)
  await expect(row).not.toContainText('Kitchen')
  await expect(age).toHaveText('changed just now', WAIT)
  await expect(page.getByTestId('water-location')).toBeHidden(WAIT)
  // Under a minute old: nothing to refresh.
  await expect(page.getByTestId('water-refreshed')).toBeDisabled()

  // A refill nobody logged: edit the date back a couple of days, and it is stale.
  await page.getByTestId('water-edit').click()
  await row.getByTestId('water-location').fill('Pantry')
  await row.getByTestId('water-date').fill(daysAgoISO(2))
  await row.getByTestId('water-save').click()
  await expect(age).toHaveText(/changed \d days ago/, WAIT)
  await expect(age).toHaveClass(/text-danger/)

  await page.getByTestId('water-refreshed').click()
  await expect(age).toHaveText('changed just now', WAIT)
  await expect(age).not.toHaveClass(/text-danger/)

  // A second bowl, through the first one's Edit: now each row is its location.
  await page.getByTestId('water-edit').click()
  await page.getByTestId('water-add-another').click()
  await expect(page.getByTestId('home-water-add')).toBeVisible(WAIT)
  await page.getByTestId('home-water-add').getByTestId('water-location').fill('Bedroom')
  await page.getByTestId('home-water-add').getByTestId('water-save').click()
  await expect(row).toHaveCount(2, WAIT)
  await expect(row.filter({ hasText: 'Pantry' })).toBeVisible()
  await expect(row.filter({ hasText: 'Bedroom' })).toBeVisible()

  // And one can go.
  page.once('dialog', (dialog) => {
    void dialog.accept()
  })
  const pantry = row.filter({ hasText: 'Pantry' })
  await pantry.getByTestId('water-edit').click()
  await pantry.getByRole('button', { name: 'Delete water bowl' }).click()
  await expect(row).toHaveCount(1, WAIT)
  await expect(row).toContainText('Water')
})
