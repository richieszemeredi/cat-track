import { expect, test } from '@playwright/test'
import { seedHousehold, tabBar, WAIT } from './seed'

/**
 * Water bowls end to end: add one, see it fresh, rename it, mark the water
 * replaced, and delete it. (The stale state needs a backdated write the UI
 * can't make; the layout spec seeds it, and the unit tests pin the hours.)
 */
test('water bowls show when the water was last replaced', async ({ page }, testInfo) => {
  test.setTimeout(180_000)

  await seedHousehold(page, { tag: `water-${testInfo.project.name}` })
  await tabBar(page).getByRole('link', { name: 'Water' }).click()
  await expect(page.getByTestId('water-location')).toBeVisible(WAIT)
  await expect(page.getByText('No water bowls yet.')).toBeVisible(WAIT)

  await page.getByTestId('water-location').fill('Kitchen')
  await page.getByTestId('water-save').click()
  const bowl = page.getByRole('listitem').filter({ hasText: 'Kitchen' })
  await expect(bowl.getByText('Just now')).toBeVisible(WAIT)
  await expect(page.getByText('Time for fresh water')).toHaveCount(0)

  // Home shows the same bowl at a glance, and a tap goes to Water.
  await tabBar(page).getByRole('link', { name: 'Home' }).click()
  const glance = page.getByRole('link', { name: /Kitchen/ })
  await expect(glance).toContainText('Just now', WAIT)
  await glance.click()
  await expect(page.getByRole('heading', { name: 'Water', level: 1 })).toBeVisible(WAIT)

  await bowl.getByRole('button', { name: 'Edit' }).click()
  await bowl.getByTestId('water-location').fill('Pantry')
  await bowl.getByTestId('water-save').click()
  const renamed = page.getByRole('listitem').filter({ hasText: 'Pantry' })
  await expect(renamed).toBeVisible(WAIT)

  await renamed.getByRole('button', { name: 'Replaced now' }).click()
  await expect(renamed.getByText('Just now')).toBeVisible(WAIT)

  page.once('dialog', (dialog) => {
    void dialog.accept()
  })
  await renamed.getByRole('button', { name: 'Edit' }).click()
  await renamed.getByRole('button', { name: 'Delete water bowl' }).click()
  await expect(page.getByText('No water bowls yet.')).toBeVisible(WAIT)
})
