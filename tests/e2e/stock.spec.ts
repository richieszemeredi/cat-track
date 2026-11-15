import { expect, test } from '@playwright/test'
import { addFoodOnSupplies, seedHousehold, tabBar, WAIT } from './seed'

/**
 * Food stock end to end: a food added with its tin size and how many are on
 * the shelf, eaten down by the meals ticked on Home, recounted, restocked —
 * and, while it would run out within the week, the Supplies dot and a line in
 * Home's "Needs attention".
 */
test('food stock follows the meals, recounts and purchases', async ({ page }, testInfo) => {
  test.setTimeout(180_000)

  await seedHousehold(page, { tag: `stock-${testInfo.project.name}` })

  // 20 tins of 100 g.
  await addFoodOnSupplies(page, {
    name: 'Tuna Pâté',
    type: 'wet',
    kcalPerGram: '0.8',
    unitSizeG: '100',
    openingUnits: '20',
  })
  const tuna = page.getByTestId('food-supply').filter({ hasText: 'Tuna Pâté' })
  const figure = tuna.getByTestId('food-supply-figure')
  await expect(tuna).toContainText('Wet · 100 g tins')
  await expect(figure).toHaveText('20', WAIT)
  await expect(tuna).toContainText('tins left')

  // Her plan becomes the tuna alone: 240 g a day, 80 g a bowl. 20 tins is
  // 2000 g — eight days, past the week it takes to deliver more.
  await tabBar(page).getByRole('link', { name: 'Plan' }).click()
  await page.getByTestId('plan-edit').click()
  await page.getByTestId('plan-item-food-0').selectOption({ label: 'Tuna Pâté' })
  await page.getByTestId('plan-item-grams-0').fill('240')
  await page.getByTestId('plan-save').click()
  await expect(page.getByText('240 g a day').first()).toBeVisible(WAIT)

  await tabBar(page).getByRole('link', { name: 'Supplies' }).click()
  await expect(tuna).toContainText('runs out around', WAIT)
  await expect(page.getByTestId('supplies-dot')).toHaveCount(0)

  // ---- a ticked bowl comes off the shelf ----
  // A tick logs the bowl's due time, and only what is eaten AFTER the count
  // comes off it — so move the given bowl to the end of today, which is after
  // the count whatever the hour this runs at.
  await tabBar(page).getByRole('link', { name: 'Home' }).click()
  await page.getByTestId('meal-tick-0').click()
  await expect(page.getByTestId('meal-tick-0')).toHaveAttribute('aria-pressed', 'true', WAIT)
  await page.getByTestId('meal-time-0').click()
  await page.getByTestId('meal-time-input-0').fill('23:59')
  await page.getByTestId('meal-time-save-0').click()
  await expect(page.getByTestId('meal-time-0')).toContainText('23:59', WAIT)

  await tabBar(page).getByRole('link', { name: 'Supplies' }).click()
  // 20 tins less 80 g: an estimate now.
  await expect(figure).toHaveText('about 19', WAIT)
  await expect(tuna).toContainText('estimated since today’s count')

  // ---- recount: an exact figure again ----
  // Undo the bowl first: anything eaten after a count makes it an estimate.
  await tabBar(page).getByRole('link', { name: 'Home' }).click()
  await page.getByTestId('meal-tick-0').click()
  await expect(page.getByTestId('meal-tick-0')).toHaveAttribute('aria-pressed', 'false', WAIT)

  await tabBar(page).getByRole('link', { name: 'Supplies' }).click()
  await expect(figure).toHaveText('20', WAIT)
  await tuna.getByTestId('food-supply-recount').click()
  // Opens on the figure shown.
  await expect(tuna.getByTestId('food-supply-count-amount')).toHaveValue('20')
  await tuna.getByTestId('food-supply-count-amount').fill('3')
  await tuna.getByTestId('food-supply-count-save').click()
  await expect(figure).toHaveText('3', WAIT)
  await expect(tuna).toContainText('counted just now')

  // 300 g at 240 g a day is a day's food: time to order.
  await expect(tuna).toContainText('About 1 day left — time to order', WAIT)
  await expect(page.getByTestId('supplies-dot')).toBeVisible(WAIT)
  await expect(tabBar(page).getByRole('link', { name: 'Supplies, needs restocking' })).toBeVisible()

  await tabBar(page).getByRole('link', { name: 'Home' }).click()
  const alert = page.getByTestId('home-attention-row').filter({ hasText: 'Order Tuna Pâté' })
  await expect(alert).toContainText('about 1 day left', WAIT)
  // The line goes where the restocking is done.
  await alert.click()
  await expect(page.getByRole('heading', { name: 'Supplies', level: 1 })).toBeVisible(WAIT)

  // ---- bought more: added on top of the count ----
  await tuna.getByTestId('food-supply-bought').click()
  await tuna.getByTestId('food-supply-bought-amount').fill('24')
  await expect(tuna).toContainText('That makes 27 tins.')
  await tuna.getByTestId('food-supply-bought-save').click()
  await expect(figure).toHaveText('about 27', WAIT)
  await expect(tuna).not.toContainText('time to order')
  await expect(page.getByTestId('supplies-dot')).toHaveCount(0, WAIT)

  await tabBar(page).getByRole('link', { name: 'Home' }).click()
  await expect(page.getByTestId('home-attention')).toHaveCount(0, WAIT)
})
