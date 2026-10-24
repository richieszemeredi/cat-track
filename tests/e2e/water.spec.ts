import { expect, test } from '@playwright/test'
import { daysAgoISO, seedHousehold, tabBar, WAIT } from './seed'

/**
 * Water bowls end to end: add one, see it fresh, rename it, correct the time
 * after a missed log, mark the water replaced, and delete it.
 */
test('water bowls show when the water was last replaced', async ({ page }, testInfo) => {
  test.setTimeout(180_000)

  await seedHousehold(page, { tag: `water-${testInfo.project.name}` })
  await tabBar(page).getByRole('link', { name: 'Chores' }).click()
  await expect(page.getByTestId('water-location')).toBeVisible(WAIT)
  await expect(page.getByText('No water bowls yet.')).toBeVisible(WAIT)

  await page.getByTestId('water-location').fill('Kitchen')
  await page.getByTestId('water-save').click()
  const bowl = page.getByRole('listitem').filter({ hasText: 'Kitchen' })
  await expect(bowl.getByText('Just now')).toBeVisible(WAIT)
  // Once there is a bowl the add form folds away.
  await expect(page.getByTestId('water-location')).toBeHidden(WAIT)
  await expect(page.getByText('Time for fresh water')).toHaveCount(0)

  // Home shows the same bowl at a glance, and a tap goes to Water.
  await tabBar(page).getByRole('link', { name: 'Home' }).click()
  const glance = page.getByRole('link', { name: /Kitchen/ })
  await expect(glance).toContainText('Just now', WAIT)
  await glance.click()
  await expect(page.getByRole('heading', { name: 'Chores', level: 1 })).toBeVisible(WAIT)

  await bowl.getByRole('button', { name: 'Edit' }).click()
  await bowl.getByTestId('water-location').fill('Pantry')
  await bowl.getByTestId('water-save').click()
  const renamed = page.getByRole('listitem').filter({ hasText: 'Pantry' })
  await expect(renamed).toBeVisible(WAIT)

  // A refill nobody logged: edit the date back a couple of days, and it is overdue.
  await renamed.getByRole('button', { name: 'Edit' }).click()
  await renamed.getByTestId('water-date').fill(daysAgoISO(2))
  await renamed.getByTestId('water-save').click()
  await expect(renamed.getByText(/\d days ago/)).toBeVisible(WAIT)
  await expect(renamed.getByText('Time for fresh water')).toBeVisible(WAIT)

  await renamed.getByRole('button', { name: 'Replaced now' }).click()
  await expect(renamed.getByText('Just now')).toBeVisible(WAIT)

  page.once('dialog', (dialog) => {
    void dialog.accept()
  })
  await renamed.getByRole('button', { name: 'Edit' }).click()
  await renamed.getByRole('button', { name: 'Delete water bowl' }).click()
  await expect(page.getByText('No water bowls yet.')).toBeVisible(WAIT)
})
