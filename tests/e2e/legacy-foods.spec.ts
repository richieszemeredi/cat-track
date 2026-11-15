import { expect, test } from '@playwright/test'
import { householdFood, seedCat, seedLegacyFoodAndPlan, tabBar, WAIT } from './seed'

/**
 * Foods used to live under each cat; they now belong to the household. A
 * household whose foods exist ONLY at the old per-cat path must come through
 * the move by itself: the first editor to open the app copies each one up
 * under the same id, so the plans and feedings that name it keep resolving.
 */
test('foods at the legacy per-cat path are copied to the household', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(180_000)

  const tag = `legacy-${testInfo.project.name}-${String(testInfo.retry)}-${String(Date.now())}`
  const food = { id: `legacy-pate-${String(Date.now())}`, name: 'Legacy Pâté' }

  await seedCat(page, { tag })
  // Written behind the app's back, as the old version of it would have.
  await seedLegacyFoodAndPlan(request, tag, food)
  expect(await householdFood(request, tag, food.id)).toBeNull()

  // The copy runs once per app session, when the cats load: a reload is the
  // next launch.
  await page.reload()
  await expect(tabBar(page)).toBeVisible({ timeout: 30_000 })

  // Supplies lists it, from the household catalog.
  await tabBar(page).getByRole('link', { name: 'Supplies' }).click()
  const card = page.getByTestId('food-supply').filter({ hasText: food.name })
  await expect(card).toBeVisible(WAIT)
  // No unit was ever stored: a wet food is counted in tins.
  await expect(card).toContainText('Wet · in tins')

  // Same id, original authorship, and the retired field left behind.
  await expect
    .poll(async () => (await householdFood(request, tag, food.id))?.fields?.['createdBy'], WAIT)
    .toEqual({ stringValue: 'legacy-seed' })
  const copied = await householdFood(request, tag, food.id)
  expect(Object.keys(copied?.fields ?? {})).not.toContain('packageSizeG')

  // A count against it ties the plan's grams to the household doc: "not on a
  // plan" would mean the plan's foodId no longer finds it.
  await card.getByTestId('food-supply-recount').click()
  await card.getByTestId('food-supply-count-amount').fill('10')
  await card.getByTestId('food-supply-count-save').click()
  await expect(card.getByTestId('food-supply-figure')).toHaveText('10', WAIT)
  await expect(card).toContainText('no tin size · counted just now')
  await expect(card).not.toContainText('not on a plan')

  // Plan resolves its energy through the same id: 240 g × 1 kcal/g.
  await tabBar(page).getByRole('link', { name: 'Plan' }).click()
  await expect(page.getByText('240 kcal of a', { exact: false })).toBeVisible(WAIT)
  await expect(page.getByText('80 g a meal')).toBeVisible()

  // Home ticks the planned bowl.
  await tabBar(page).getByRole('link', { name: 'Home' }).click()
  const tick = page.getByTestId('meal-tick-0')
  const bowl = page.getByRole('listitem').filter({ has: tick })
  await expect(bowl).toContainText(food.name, WAIT)
  await expect(bowl).toContainText('80 g')
  await tick.click()
  await expect(tick).toHaveAttribute('aria-pressed', 'true', WAIT)

  // The off-plan form offers it too: it is in the household's active foods.
  await page.getByTestId('home-off-plan-summary').click()
  await page.getByTestId('off-plan-open').click()
  await expect(page.getByTestId('meal-food-select')).toContainText(food.name, WAIT)
})
