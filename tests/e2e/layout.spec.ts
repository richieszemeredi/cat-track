import { expect, test, type Page } from '@playwright/test'
import { seedHousehold, seedPreviousPlan, tabBar, WAIT } from './seed'

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
  // A superseded plan, so the Food page renders its history section here.
  await seedPreviousPlan(request, tag)

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

// The label calculator lives inside a closed <details>, so the per-page sweep
// above never lays its five fields out. Open it and run the same checks.
test('the label calculator lays out inside the food form', async ({ page }, testInfo) => {
  test.setTimeout(180_000)

  await seedHousehold(page, { tag: `analysis-${testInfo.project.name}` })
  await tabBar(page).getByRole('link', { name: 'Food' }).click()
  await page.getByTestId('food-add-open').click()
  await expect(page.getByTestId('food-name')).toBeVisible(WAIT)
  await page.getByTestId('food-type').selectOption('wet')
  await page.getByTestId('food-analysis-toggle').click()

  const protein = page.getByTestId('food-analysis-protein')
  await expect(protein).toBeVisible(WAIT)
  await protein.fill('11')
  await page.getByTestId('food-analysis-fat').fill('5,5')
  await page.getByTestId('food-analysis-moisture').fill('78')
  // The result and the apply button are both on screen for the geometry checks.
  await expect(page.getByTestId('food-analysis-apply')).toBeVisible(WAIT)

  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}-food-calculator.png`,
    fullPage: true,
  })

  expect(await overflowingElements(page), 'calculator has elements past the viewport').toEqual([])
  expect(await documentScrollsSideways(page), 'calculator scrolls sideways').toBe(false)
  expect(await controlsOutsideTheirCard(page), 'calculator escapes its card').toEqual([])
  expect(await smallTouchTargets(page), 'calculator has under-sized tap targets').toEqual([])

  // Every percentage field spans the same full row — the five must not collapse
  // into a cramped grid on the 375pt phone.
  const boxes = await Promise.all(
    ['protein', 'fat', 'ash', 'fibre', 'moisture'].map(async (key) => {
      const box = await page.getByTestId(`food-analysis-${key}`).boundingBox()
      if (box === null) throw new Error(`${key} field not laid out`)
      return box
    }),
  )
  const [first] = boxes
  if (first === undefined) throw new Error('no calculator fields')
  for (const box of boxes) {
    expect(Math.abs(box.width - first.width)).toBeLessThanOrEqual(1)
    expect(box.width).toBeGreaterThan(200)
  }
  // Stacked in label order, each below the last.
  for (let i = 1; i < boxes.length; i++) {
    const prev = boxes[i - 1]
    const current = boxes[i]
    if (prev === undefined || current === undefined) throw new Error('missing field box')
    expect(current.y).toBeGreaterThan(prev.y + prev.height - 1)
  }
})

/**
 * A meal mid-flavour-switch is the widest row the app can produce: two food
 * names, two gram figures and a meal total, all inside one checklist row on a
 * 375pt screen. If any layout is going to break, it breaks here.
 */
test('a bowl mid-switch shows both foods and holds its layout', async ({ page }, testInfo) => {
  test.setTimeout(180_000)

  await seedHousehold(page, { tag: `switch-${testInfo.project.name}` })

  await tabBar(page).getByRole('link', { name: 'Food' }).click()
  await expect(page.getByTestId('food-add-open')).toBeVisible(WAIT)
  await page.getByTestId('food-add-open').click()
  await expect(page.getByTestId('food-name')).toBeVisible(WAIT)
  await page.getByTestId('food-name').fill('Wet Tuna in Jelly')
  await page.getByTestId('food-type').selectOption('wet')
  await page.getByTestId('food-kcal-per-gram').fill('0.75')
  await page.getByTestId('food-save').click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Wet Tuna in Jelly' })).toBeVisible(
    WAIT,
  )

  // Move her onto the tuna over four days, coming off the kibble.
  await expect(page.getByTestId('plan-edit')).toBeVisible(WAIT)
  await page.getByTestId('plan-edit').click()
  await expect(page.getByTestId('plan-item-food-0')).toBeVisible(WAIT)
  await page.getByTestId('plan-item-food-0').selectOption({ label: 'Wet Tuna in Jelly' })
  await page.getByTestId('plan-item-grams-0').fill('315')
  await page.getByTestId('plan-switch-toggle').check()
  await page
    .getByTestId('plan-switch-from')
    .selectOption({ label: 'Test Kibble with a fairly long name' })
  await expect(page.getByTestId('plan-switch-preview')).toContainText('25% · 50% · 75% · 100%')
  await page.getByTestId('plan-save').click()

  // Day one of four: a quarter of the bowl is the new food.
  const firstMeal = page.getByRole('listitem').filter({ hasText: '07:00' })
  await expect(firstMeal).toContainText('Test Kibble with a fairly long name', WAIT)
  await expect(firstMeal).toContainText('Wet Tuna in Jelly')
  await expect(firstMeal).toContainText('79 g')
  await expect(firstMeal).toContainText('26 g')
  await expect(page.getByText('Switching from Test Kibble')).toBeVisible(WAIT)

  // The revision leaves a superseded plan behind, so the history is here too —
  // opened, because a collapsed section cannot break a layout.
  await page.getByText('Plan history').click()
  // The superseded plan is the one still naming the kibble as the whole bowl.
  await expect(page.getByText('69 g Test Kibble with a fairly long name a day')).toBeVisible(WAIT)

  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}-food-switch.png`,
    fullPage: true,
  })
  await testInfo.attach(`${testInfo.project.name}-food-switch`, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  })

  expect(await overflowingElements(page), 'a switched bowl overflows the viewport').toEqual([])
  expect(await documentScrollsSideways(page), 'the switched Food page scrolls sideways').toBe(false)
  expect(await controlsOutsideTheirCard(page), 'a control escapes its card').toEqual([])
  expect(await smallTouchTargets(page), 'an under-sized tap target').toEqual([])
  expect(await textColumnMisalignments(page), 'a ragged text column').toEqual([])
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
