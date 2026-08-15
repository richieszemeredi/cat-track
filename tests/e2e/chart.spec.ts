import { expect, test } from '@playwright/test'
import { seedHousehold, tabBar, WAIT } from './seed'

/**
 * The growth chart's tooltip must report the EXPECTED RANGE anywhere you
 * touch, not just on the days that happen to have a weigh-in. The band and
 * the actual line used to come from two separate datasets, so a touch could
 * only ever resolve to a weigh-in and the expected range was unreadable.
 */
test('touching the growth chart reveals the expected range', async ({ page }, testInfo) => {
  test.setTimeout(180_000)

  await seedHousehold(page, { tag: `chart-${testInfo.project.name}` })
  await tabBar(page).getByRole('link', { name: 'Weight' }).click()

  const chart = page.getByTestId('weight-chart')
  await expect(chart).toBeVisible(WAIT)
  // Recharts sizes itself from a ResizeObserver callback.
  await page.waitForTimeout(500)

  const surface = chart.locator('.recharts-surface')
  const tooltip = chart.locator('.recharts-tooltip-wrapper')

  // hover() scrolls the chart into view and enters it; the box is only
  // meaningful afterwards, so read it after the hover, not before.
  await surface.hover()
  const box = await surface.boundingBox()
  if (box === null) throw new Error('chart did not render')

  // A point with no weigh-in on it, a quarter of the way along the axis.
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.5)

  await expect(tooltip).toContainText('Expected range', WAIT)
  await expect(tooltip).toContainText('kg')
  // Weeks, not months, while the cat is a 90-day-old kitten.
  await expect(tooltip).toContainText('weeks old')

  // On the weigh-in itself both series report.
  const dot = chart.locator('.recharts-line-dot').first()
  const dotBox = await dot.boundingBox()
  if (dotBox === null) throw new Error('no weigh-in plotted')
  await page.mouse.move(dotBox.x + dotBox.width / 2, box.y + box.height * 0.5)

  await expect(tooltip).toContainText('Actual', WAIT)
  await expect(tooltip).toContainText('Expected range')
})
