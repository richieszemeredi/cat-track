import { expect, test } from '@playwright/test'
import { daysAgoISO, openAddForm, seedHousehold, tabBar, WAIT } from './seed'

/**
 * Litter boxes end to end: add one, see how old its last clean is in weeks,
 * correct the date after a missed log, and mark it replaced today.
 */
test('litter boxes show their age in weeks and can be re-dated', async ({ page }, testInfo) => {
  test.setTimeout(180_000)

  await seedHousehold(page, { tag: `litter-${testInfo.project.name}` })
  await tabBar(page).getByRole('link', { name: 'Chores' }).click()
  await expect(page.getByTestId('litter-location')).toBeVisible(WAIT)
  await expect(page.getByText('No litter boxes yet.')).toBeVisible(WAIT)

  // The form is open while there is nothing yet, and folds away once saved.
  await expect(page.getByTestId('litter-add-toggle')).toBeVisible(WAIT)
  // Added with the date left at today: cleaned today, nothing due.
  await page.getByTestId('litter-location').fill('Bathroom')
  await page.getByTestId('litter-save').click()
  const box = page.getByRole('listitem').filter({ hasText: 'Bathroom' })
  await expect(box.getByText('Today', { exact: true })).toBeVisible(WAIT)
  await expect(box.getByRole('button', { name: 'Replaced today' })).toBeDisabled()
  await expect(page.getByTestId('litter-location')).toBeHidden()
  await openAddForm(page, 'litter')
  await expect(page.getByTestId('litter-location')).toBeVisible()
  await page.getByTestId('litter-add-toggle').click()
  await expect(page.getByTestId('litter-location')).toBeHidden()
  await expect(page.getByText('Due for a full clean')).toHaveCount(0)

  // A clean-out nobody logged: edit the date back to five weeks ago.
  await box.getByRole('button', { name: 'Edit' }).click()
  await box.getByTestId('litter-date').fill(daysAgoISO(38))
  await box.getByTestId('litter-save').click()
  await expect(box.getByText('5 weeks ago')).toBeVisible(WAIT)
  await expect(box.getByText('Due for a full clean')).toBeVisible(WAIT)

  // Home shows the same box at a glance, overdue first, and a tap goes to Litter.
  await tabBar(page).getByRole('link', { name: 'Home' }).click()
  const glance = page.getByRole('link', { name: /Bathroom/ })
  await expect(glance).toContainText('5 weeks ago', WAIT)
  await expect(glance).toContainText('Due for a full clean')
  await glance.click()
  await expect(page.getByRole('heading', { name: 'Chores', level: 1 })).toBeVisible(WAIT)

  // A slower litter: a 6-week interval makes five weeks old no longer due.
  await box.getByRole('button', { name: 'Edit' }).click()
  await box.getByTestId('litter-interval').selectOption('6')
  await box.getByTestId('litter-save').click()
  await expect(box.getByText('every 6 weeks')).toBeVisible(WAIT)
  await expect(box.getByText('Due for a full clean')).toHaveCount(0)

  // One tap says it was done today.
  await box.getByRole('button', { name: 'Replaced today' }).click()
  await expect(box.getByText('Today', { exact: true })).toBeVisible(WAIT)
  await expect(box.getByText('Due for a full clean')).toHaveCount(0)

  // And it can go.
  page.once('dialog', (dialog) => {
    void dialog.accept()
  })
  await box.getByRole('button', { name: 'Edit' }).click()
  await box.getByRole('button', { name: 'Delete litter box' }).click()
  await expect(page.getByText('No litter boxes yet.')).toBeVisible(WAIT)
})
