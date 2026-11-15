import { expect, test } from '@playwright/test'
import {
  addLitterOnSupplies,
  localDaysAgoISO,
  openLitterAddForm,
  openLitterFold,
  seedHousehold,
  tabBar,
  WAIT,
} from './seed'

/**
 * Litter boxes end to end, in Home’s folded "Litter boxes": add one, see its
 * last and next full swap and how far off each is, correct the date after a
 * missed log, and mark it replaced today.
 */
test('litter boxes show their last and next swap and can be re-dated', async ({
  page,
}, testInfo) => {
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
  const lastSwap = box.getByTestId('litter-last-swap')
  const nextSwap = box.getByTestId('litter-next-swap')
  // The two dates that matter, each with how far off it is.
  await expect(lastSwap).toHaveText(/^Last swap · \w{3} \d{1,2} · today$/, WAIT)
  await expect(nextSwap).toHaveText(/^Next swap · \w{3} \d{1,2} · in 4 weeks$/)
  await expect(nextSwap).not.toHaveClass(/text-danger/)
  await expect(box.getByRole('button', { name: 'Replaced today' })).toBeDisabled()
  await expect(page.getByTestId('litter-location')).toBeHidden()
  await openLitterAddForm(page)
  await expect(page.getByTestId('litter-location')).toBeVisible()
  await page.getByTestId('litter-add-toggle').click()
  await expect(page.getByTestId('litter-location')).toBeHidden()
  await expect(summary).toContainText('· next swap', WAIT)
  await expect(page.getByTestId('home-attention')).toHaveCount(0)

  // A clean-out nobody logged: edit the date back to five weeks ago.
  await box.getByRole('button', { name: 'Edit' }).click()
  await box.getByTestId('litter-date').fill(localDaysAgoISO(38))
  await box.getByTestId('litter-save').click()
  await expect(lastSwap).toContainText('· 5 weeks ago', WAIT)
  // 38 days since, on a four-week interval: due ten days ago, and the whole
  // line says so.
  await expect(nextSwap).toHaveText(/^Next swap · was due \w{3} \d{1,2} · 10 days overdue$/)
  await expect(nextSwap).toHaveClass(/text-danger/)
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
  await expect(nextSwap).toHaveText(/^Next swap · \w{3} \d{1,2} · in 4 days$/)
  await expect(nextSwap).not.toHaveClass(/text-danger/)
  await expect(page.getByTestId('home-attention')).toHaveCount(0)

  // One tap says it was done today.
  await box.getByRole('button', { name: 'Replaced today' }).click()
  await expect(lastSwap).toContainText('· today', WAIT)
  await expect(nextSwap).toContainText('· in 6 weeks')

  // And it can go.
  page.once('dialog', (dialog) => {
    void dialog.accept()
  })
  await box.getByRole('button', { name: 'Edit' }).click()
  await box.getByRole('button', { name: 'Delete litter box' }).click()
  await expect(fold.getByText('No litter boxes yet.')).toBeVisible(WAIT)
})

/**
 * Litter stock, per kind: each kind is added and counted on Supplies, each box
 * says which kind it takes, and every "Replaced today" on Home takes that
 * box's bags off ITS kind only. Low means the swaps due within the order lead
 * time would leave less than one full swap of that kind spare.
 */
test('a full swap takes its bags off its own litter’s stock', async ({ page }, testInfo) => {
  test.setTimeout(240_000)

  await seedHousehold(page, { tag: `litter-stock-${testInfo.project.name}` })

  // A fresh household has no litter yet, and a box added now says so.
  await tabBar(page).getByRole('link', { name: 'Supplies' }).click()
  await expect(page.getByText('No litter added yet.')).toBeVisible(WAIT)
  await addLitterOnSupplies(page, { name: 'Clumping', bagSize: '10' })
  const clumping = page.getByTestId('litter-supply').filter({ hasText: 'Clumping' })
  const clumpingFigure = clumping.getByTestId('litter-supply-figure')
  await expect(clumping).toContainText('10 L bags')
  await expect(clumpingFigure).toHaveText('Not counted yet', WAIT)
  await expect(page.getByText('No litter added yet.')).toHaveCount(0)

  // A two-bag box, overdue — so it is due within the week. The only kind is
  // already picked.
  await openLitterAddForm(page)
  await expect(page.getByTestId('litter-kind')).toHaveValue(/.+/)
  await expect(page.getByTestId('litter-kind').locator('option:checked')).toHaveText('Clumping')
  await page.getByTestId('litter-location').fill('Bathroom')
  await page.getByTestId('litter-date').fill(localDaysAgoISO(38))
  await page.getByTestId('litter-bags-per-swap').selectOption('2')
  await page.getByTestId('litter-save').click()
  const fold = page.getByTestId('home-litter')
  const bathroom = fold.getByRole('listitem').filter({ hasText: 'Bathroom' })
  await expect(bathroom).toContainText('2 bags a swap', WAIT)
  // One kind: nothing to tell the boxes apart by.
  await expect(bathroom.getByTestId('litter-box-kind')).toHaveCount(0)

  await tabBar(page).getByRole('link', { name: 'Supplies' }).click()
  await expect(clumping).toContainText('10 L bags · Bathroom', WAIT)

  // Recount: an exact figure.
  await clumping.getByTestId('litter-supply-recount').click()
  await clumping.getByTestId('litter-supply-count-amount').fill('5')
  await clumping.getByTestId('litter-supply-count-save').click()
  await expect(clumpingFigure).toHaveText('5', WAIT)
  await expect(clumping).toContainText('enough for 2 full swaps · counted just now')
  // 5 bags less the 2 due this week still leaves a full swap spare.
  await expect(page.getByTestId('supplies-dot')).toHaveCount(0)

  // The swap, on Home.
  await openLitterFold(page)
  await bathroom.getByRole('button', { name: 'Replaced today' }).click()
  await expect(bathroom.getByTestId('litter-last-swap')).toContainText('· today', WAIT)

  await tabBar(page).getByRole('link', { name: 'Supplies' }).click()
  // Derived since the count, so no longer exact.
  await expect(clumpingFigure).toHaveText('about 3', WAIT)
  await expect(clumping).toContainText('enough for 1 full swap · estimated since today’s count')

  // Down to one bag: not even one full swap left, so it's time to order.
  await clumping.getByTestId('litter-supply-recount').click()
  await expect(clumping.getByTestId('litter-supply-count-amount')).toHaveValue('3')
  await clumping.getByTestId('litter-supply-count-amount-down').click()
  await clumping.getByTestId('litter-supply-count-amount-down').click()
  await clumping.getByTestId('litter-supply-count-save').click()
  await expect(clumpingFigure).toHaveText('1', WAIT)
  await expect(clumping).toContainText('Not enough for a full swap — time to order')
  await expect(page.getByTestId('supplies-dot')).toBeVisible(WAIT)
  await expect(tabBar(page).getByRole('link', { name: 'Supplies, needs restocking' })).toBeVisible()

  await tabBar(page).getByRole('link', { name: 'Home' }).click()
  await expect(
    page.getByTestId('home-attention-row').filter({ hasText: 'Order Clumping' }),
  ).toContainText('1 bag left', WAIT)

  // Bought more: added on top, and the warning goes.
  await tabBar(page).getByRole('link', { name: 'Supplies' }).click()
  await clumping.getByTestId('litter-supply-bought').click()
  await clumping.getByTestId('litter-supply-bought-amount').fill('6')
  await expect(clumping).toContainText('That makes 7 bags.')
  await clumping.getByTestId('litter-supply-bought-save').click()
  await expect(clumpingFigure).toHaveText('about 7', WAIT)
  await expect(page.getByTestId('supplies-dot')).toHaveCount(0, WAIT)

  // A second kind, counted as it is added.
  await addLitterOnSupplies(page, {
    name: 'Silica crystals',
    bagSize: '3,8',
    bagUnit: 'kg',
    openingBags: '4',
  })
  const silica = page.getByTestId('litter-supply').filter({ hasText: 'Silica crystals' })
  const silicaFigure = silica.getByTestId('litter-supply-figure')
  await expect(silica).toContainText('3.8 kg bags')
  await expect(silicaFigure).toHaveText('4', WAIT)

  // A box that takes it, also overdue.
  await openLitterAddForm(page)
  await page.getByTestId('litter-location').fill('Hall')
  await page.getByTestId('litter-date').fill(localDaysAgoISO(38))
  await page.getByTestId('litter-kind').selectOption({ label: 'Silica crystals' })
  await page.getByTestId('litter-save').click()
  const hall = fold.getByRole('listitem').filter({ hasText: 'Hall' })
  await expect(hall).toContainText('1 bag a swap', WAIT)
  // Two kinds now, so each row says which it takes.
  await expect(hall.getByTestId('litter-box-kind')).toHaveText('· Silica crystals')
  await expect(bathroom.getByTestId('litter-box-kind')).toHaveText('· Clumping')

  // Replacing the Hall box draws on the silica, and leaves the clumping be.
  await hall.getByRole('button', { name: 'Replaced today' }).click()
  await expect(hall.getByTestId('litter-last-swap')).toContainText('· today', WAIT)

  await tabBar(page).getByRole('link', { name: 'Supplies' }).click()
  await expect(silicaFigure).toHaveText('about 3', WAIT)
  await expect(silica).toContainText('3.8 kg bags · Hall')
  await expect(clumpingFigure).toHaveText('about 7')
  await expect(clumping).toContainText('10 L bags · Bathroom')
})
