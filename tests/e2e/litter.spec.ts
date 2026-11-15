import { expect, test } from '@playwright/test'
import { daysAgoISO, openLitterAddForm, openLitterFold, seedHousehold, tabBar, WAIT } from './seed'

/**
 * Litter boxes end to end, in Home's folded "Litter boxes": add one, see how
 * old its last clean is in weeks, correct the date after a missed log, and
 * mark it replaced today.
 */
test('litter boxes show their age in weeks and can be re-dated', async ({ page }, testInfo) => {
  test.setTimeout(180_000)

  await seedHousehold(page, { tag: `litter-${testInfo.project.name}` })
  await openLitterFold(page)
  const fold = page.getByTestId('home-litter')
  const summary = page.getByTestId('home-litter-summary')
  await expect(summary).toContainText('· none yet', WAIT)
  await expect(fold.getByText('No litter boxes yet.')).toBeVisible(WAIT)

  // The form is open while there is nothing yet, and folds away once saved.
  await expect(page.getByTestId('litter-location')).toBeVisible(WAIT)
  // Added with the date left at today: cleaned today, nothing due.
  await page.getByTestId('litter-location').fill('Bathroom')
  await page.getByTestId('litter-save').click()
  const box = fold.getByRole('listitem').filter({ hasText: 'Bathroom' })
  await expect(box.getByText('Today', { exact: true })).toBeVisible(WAIT)
  await expect(box.getByRole('button', { name: 'Replaced today' })).toBeDisabled()
  await expect(page.getByTestId('litter-location')).toBeHidden()
  await openLitterAddForm(page)
  await expect(page.getByTestId('litter-location')).toBeVisible()
  await page.getByTestId('litter-add-toggle').click()
  await expect(page.getByTestId('litter-location')).toBeHidden()
  await expect(page.getByText('Due for a full clean')).toHaveCount(0)
  await expect(summary).toContainText('· next swap', WAIT)
  await expect(page.getByTestId('home-attention')).toHaveCount(0)

  // A clean-out nobody logged: edit the date back to five weeks ago.
  await box.getByRole('button', { name: 'Edit' }).click()
  await box.getByTestId('litter-date').fill(daysAgoISO(38))
  await box.getByTestId('litter-save').click()
  await expect(box.getByText('5 weeks ago')).toBeVisible(WAIT)
  await expect(box.getByText('Due for a full clean')).toBeVisible(WAIT)
  await expect(summary).toContainText('· Bathroom due')

  // Needs attention says so too, and its line opens the fold rather than
  // going anywhere: the boxes are on this screen.
  const attention = page.getByTestId('home-attention-row').filter({ hasText: 'Bathroom' })
  await expect(attention).toContainText('due for a full clean', WAIT)
  await summary.click()
  await expect(fold).not.toHaveAttribute('open')
  await attention.click()
  await expect(fold).toHaveAttribute('open', '', WAIT)
  await expect(page.getByRole('heading', { name: 'Mochi', level: 1 })).toBeVisible()

  // A slower litter: a 6-week interval makes five weeks old no longer due.
  await box.getByRole('button', { name: 'Edit' }).click()
  await box.getByTestId('litter-interval').selectOption('6')
  await box.getByTestId('litter-save').click()
  await expect(box.getByText(/every 6 weeks/)).toBeVisible(WAIT)
  await expect(box.getByText('Due for a full clean')).toHaveCount(0)
  await expect(page.getByTestId('home-attention')).toHaveCount(0)

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
  await expect(fold.getByText('No litter boxes yet.')).toBeVisible(WAIT)
})

/**
 * Litter stock: counted on Supplies, and every "Replaced today" on Home takes
 * that box's bags off. Low means the swaps due within the order lead time
 * would leave less than one full swap spare.
 */
test('a full swap takes its bags off the litter stock', async ({ page }, testInfo) => {
  test.setTimeout(180_000)

  await seedHousehold(page, { tag: `litter-stock-${testInfo.project.name}` })

  // A two-bag box, overdue — so it is due within the week.
  await openLitterAddForm(page)
  await page.getByTestId('litter-location').fill('Bathroom')
  await page.getByTestId('litter-date').fill(daysAgoISO(38))
  await page.getByTestId('litter-bags-per-swap').selectOption('2')
  await page.getByTestId('litter-save').click()
  const box = page.getByTestId('home-litter').getByRole('listitem').filter({ hasText: 'Bathroom' })
  await expect(box).toContainText('2 bags a swap', WAIT)

  await tabBar(page).getByRole('link', { name: 'Supplies' }).click()
  const litter = page.getByTestId('litter-supply')
  const figure = litter.getByTestId('litter-supply-figure')
  await expect(figure).toHaveText('Not counted yet', WAIT)

  // Recount: an exact figure.
  await litter.getByTestId('litter-supply-recount').click()
  await litter.getByTestId('litter-supply-count-amount').fill('5')
  await litter.getByTestId('litter-supply-count-save').click()
  await expect(figure).toHaveText('5', WAIT)
  await expect(litter).toContainText('enough for 2 full swaps · counted just now')
  // 5 bags less the 2 due this week still leaves a full swap spare.
  await expect(page.getByTestId('supplies-dot')).toHaveCount(0)

  // The swap, on Home.
  await openLitterFold(page)
  await box.getByRole('button', { name: 'Replaced today' }).click()
  await expect(box.getByText('Today', { exact: true })).toBeVisible(WAIT)

  await tabBar(page).getByRole('link', { name: 'Supplies' }).click()
  // Derived since the count, so no longer exact.
  await expect(figure).toHaveText('about 3', WAIT)
  await expect(litter).toContainText('enough for 1 full swap · estimated since today’s count')

  // Down to one bag: not even one full swap left, so it's time to order.
  await litter.getByTestId('litter-supply-recount').click()
  await expect(litter.getByTestId('litter-supply-count-amount')).toHaveValue('3')
  await litter.getByTestId('litter-supply-count-amount-down').click()
  await litter.getByTestId('litter-supply-count-amount-down').click()
  await litter.getByTestId('litter-supply-count-save').click()
  await expect(figure).toHaveText('1', WAIT)
  await expect(litter).toContainText('Not enough for a full swap — time to order')
  await expect(page.getByTestId('supplies-dot')).toBeVisible(WAIT)
  await expect(tabBar(page).getByRole('link', { name: 'Supplies, needs restocking' })).toBeVisible()

  await tabBar(page).getByRole('link', { name: 'Home' }).click()
  await expect(
    page.getByTestId('home-attention-row').filter({ hasText: 'Order litter' }),
  ).toContainText('1 bag left', WAIT)

  // Bought more: added on top, and the warning goes.
  await tabBar(page).getByRole('link', { name: 'Supplies' }).click()
  await litter.getByTestId('litter-supply-bought').click()
  await litter.getByTestId('litter-supply-bought-amount').fill('6')
  await expect(litter).toContainText('That makes 7 bags.')
  await litter.getByTestId('litter-supply-bought-save').click()
  await expect(figure).toHaveText('about 7', WAIT)
  await expect(page.getByTestId('supplies-dot')).toHaveCount(0, WAIT)
})
