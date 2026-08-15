import { expect, test, type Page } from '@playwright/test'
import { seedHousehold, seedYesterdayMeal, tabBar, WAIT } from './seed'

/**
 * Layout pass on the two phones this household uses (iPhone 14 Pro, 393pt and
 * iPhone 12 mini, 375pt — see playwright.config.ts).
 *
 * Every screen is checked for horizontal overflow and screenshotted into
 * test-results/screenshots/, so a change that squeezes a control off-screen
 * fails here instead of on a phone. The weigh-in form used to put "Weight" and
 * "Date" in a two-column grid, which a native date picker blew straight out
 * of on a 393pt screen — that is the class of bug this catches.
 */

const PAGES = ['Home', 'Food', 'Weight', 'Profile'] as const

// tests/e2e compiles under the node tsconfig (no DOM lib), so the browser
// globals used inside page.evaluate are typed structurally here — same
// approach as pwa.spec.ts.
interface DomRect {
  width: number
  height: number
  left: number
  right: number
}
interface DomElement {
  tagName: string
  className: unknown
  textContent: string | null
  getAttribute: (name: string) => string | null
  closest: (selector: string) => DomElement | null
  getBoundingClientRect: () => DomRect
}

/** Elements that stick out past either edge of the viewport. */
async function overflowingElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const g = globalThis as unknown as {
      innerWidth: number
      document: { querySelectorAll: (selector: string) => Iterable<DomElement> }
    }
    const limit = g.innerWidth + 1
    const offenders: string[] = []
    for (const el of g.document.querySelectorAll('body *')) {
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) continue
      if (rect.right > limit || rect.left < -1) {
        const cls = typeof el.className === 'string' ? el.className.slice(0, 60) : ''
        offenders.push(
          `<${el.tagName.toLowerCase()} class="${cls}"> ` +
            `left=${String(Math.round(rect.left))} right=${String(Math.round(rect.right))} limit=${String(limit)}`,
        )
      }
    }
    // Nested offenders repeat the same root cause; the first few are enough.
    return offenders.slice(0, 5)
  })
}

/**
 * Controls that escape the card they sit in. The viewport check alone missed
 * this: a time input punched through the right edge of its card on a real
 * iPhone while still being well inside the screen.
 */
async function controlsOutsideTheirCard(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const g = globalThis as unknown as {
      document: { querySelectorAll: (selector: string) => Iterable<DomElement> }
    }
    const out: string[] = []
    for (const el of g.document.querySelectorAll('input, select, textarea, button')) {
      const card = el.closest('.surface')
      if (card === null) continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) continue
      const c = card.getBoundingClientRect()
      if (r.right > c.right + 1 || r.left < c.left - 1) {
        out.push(
          `${el.tagName.toLowerCase()}[${el.getAttribute('type') ?? '-'}] ` +
            `${String(Math.round(r.left))}..${String(Math.round(r.right))} ` +
            `escapes card ${String(Math.round(c.left))}..${String(Math.round(c.right))}`,
        )
      }
    }
    return out.slice(0, 5)
  })
}

/** Interactive elements too small to hit reliably with a thumb. */
async function smallTouchTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const MIN = 36
    const g = globalThis as unknown as {
      document: { querySelectorAll: (selector: string) => Iterable<DomElement> }
    }
    const out: string[] = []
    for (const el of g.document.querySelectorAll('button, a[href], summary')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) continue
      if (r.height < MIN || r.width < MIN) {
        out.push(
          `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 24)}" ` +
            `${String(Math.round(r.width))}x${String(Math.round(r.height))}`,
        )
      }
    }
    return out.slice(0, 6)
  })
}

/**
 * One text column. `.gutter` elements sit exactly one card-padding inside the
 * cards, so page labels line up with the text inside cards instead of leaving
 * a ragged left edge down the screen.
 */
async function textColumnMisalignments(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const CARD_PADDING = 16
    const g = globalThis as unknown as {
      document: { querySelectorAll: (selector: string) => Iterable<DomElement> }
    }
    // getBoundingClientRect().left is the BORDER edge; the gutter's indent is
    // padding, which lives inside it. Measure where the text actually starts.
    const gg = globalThis as unknown as {
      getComputedStyle: (el: DomElement) => { paddingLeft: string }
    }
    const lefts = (selector: string, withPadding: boolean) => {
      const values = new Set<number>()
      for (const el of g.document.querySelectorAll(selector)) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 && r.height === 0) continue
        const pad = withPadding ? parseFloat(gg.getComputedStyle(el).paddingLeft) : 0
        values.add(Math.round(r.left + pad))
      }
      return [...values]
    }
    const gutters = lefts('.gutter', true)
    const cards = lefts('.surface', false)
    const out: string[] = []
    if (gutters.length > 1) out.push(`.gutter text at several x: ${gutters.join(', ')}`)
    if (cards.length > 1) out.push(`.surface elements at several x: ${cards.join(', ')}`)
    const gutter = gutters[0]
    const card = cards[0]
    if (gutter !== undefined && card !== undefined && gutter - card !== CARD_PADDING) {
      out.push(
        `gutter x=${String(gutter)} is not ${String(CARD_PADDING)}px inside card x=${String(card)}`,
      )
    }
    return out
  })
}

async function documentScrollsSideways(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const g = globalThis as unknown as {
      document: { documentElement: { scrollWidth: number; clientWidth: number } }
    }
    const el = g.document.documentElement
    return el.scrollWidth > el.clientWidth + 1
  })
}

test('every screen fits the viewport without sideways scroll', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(180_000)

  const tag = `layout-${testInfo.project.name}`
  await seedHousehold(page, { tag })
  // A previous day to repeat, so the Food page renders its repeat card here.
  await seedYesterdayMeal(request, tag)

  for (const name of PAGES) {
    await tabBar(page).getByRole('link', { name }).click()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible(WAIT)
    // Recharts measures its container on a frame; give the chart one.
    await page.waitForTimeout(500)

    await testInfo.attach(`${testInfo.project.name}-${name}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
    await page.screenshot({
      path: `test-results/screenshots/${testInfo.project.name}-${name.toLowerCase()}.png`,
      fullPage: true,
    })

    expect(await overflowingElements(page), `${name} has elements past the viewport`).toEqual([])
    expect(await documentScrollsSideways(page), `${name} scrolls sideways`).toBe(false)
    expect(await controlsOutsideTheirCard(page), `${name} has controls escaping a card`).toEqual([])
    expect(await smallTouchTargets(page), `${name} has under-sized tap targets`).toEqual([])
    expect(await textColumnMisalignments(page), `${name} has a ragged text column`).toEqual([])
  }
})

test('the weigh-in form fields each get a full-width row', async ({ page }, testInfo) => {
  test.setTimeout(180_000)

  await seedHousehold(page, { tag: `weighform-${testInfo.project.name}` })
  await tabBar(page).getByRole('link', { name: 'Weight' }).click()

  const weight = page.getByTestId('weight-kg')
  const date = page.getByLabel('Date')
  await expect(weight).toBeVisible(WAIT)

  const weightBox = await weight.boundingBox()
  const dateBox = await date.boundingBox()
  if (weightBox === null || dateBox === null) throw new Error('weigh-in fields not laid out')

  // Stacked, not side by side: the date row starts below the weight row.
  expect(dateBox.y).toBeGreaterThan(weightBox.y + weightBox.height - 1)
  // Both fields span the same full row. Compared to each other rather than to
  // the viewport: on the desktop the app is a fixed-width column.
  expect(Math.abs(weightBox.width - dateBox.width)).toBeLessThanOrEqual(1)
  expect(weightBox.width).toBeGreaterThan(200)
})

test('the repeat-a-day card offers yesterday and copies it onto today', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(180_000)

  const tag = `repeat-${testInfo.project.name}`
  await seedHousehold(page, { tag })
  await seedYesterdayMeal(request, tag)

  await tabBar(page).getByRole('link', { name: 'Food' }).click()
  const card = page.getByTestId('repeat-day')
  await expect(card).toBeVisible(WAIT)
  await expect(card).toContainText('Same as yesterday')
  await expect(card).toContainText('2 meals · 280 kcal')

  // Today already has the 40 g / 140 kcal meal from the seed.
  await expect(page.getByTestId('today-kcal')).toHaveText('140', WAIT)
  await page.getByTestId('repeat-day-all').click()

  // 140 + 280 kcal, and yesterday's times carried over onto today's list
  // (scoped: the repeat card shows the same times).
  await expect(page.getByTestId('today-kcal')).toHaveText('420', WAIT)
  await expect(page.getByText('Total: 120 g · 420 kcal')).toBeVisible(WAIT)
  const todaysMeals = page.locator('section').filter({ hasText: "Today's meals" })
  await expect(todaysMeals.getByText('07:15')).toBeVisible()
  await expect(todaysMeals.getByText('19:30')).toBeVisible()
})

test('the sign-in screen fits the viewport', async ({ page }, testInfo) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'CatTrack' })).toBeVisible(WAIT)

  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}-signin.png`,
    fullPage: true,
  })

  expect(await overflowingElements(page), 'sign-in has elements past the viewport').toEqual([])
  expect(await documentScrollsSideways(page), 'sign-in scrolls sideways').toBe(false)
})
