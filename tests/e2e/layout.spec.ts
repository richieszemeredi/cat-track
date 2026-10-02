import { expect, test, type Page } from '@playwright/test'
import { seedHousehold, seedLastWeeksWeighIn, seedPreviousPlan, tabBar, WAIT } from './seed'

/**
 * Layout pass on the two phones this household uses (iPhone 14 Pro, 393pt and
 * iPhone 12 mini, 375pt), two iPads (768pt portrait, 1194pt landscape) and a
 * desktop — see playwright.config.ts.
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
 * One text column per page column. `.gutter` elements sit exactly one
 * card-padding inside the cards, so page labels line up with the text inside
 * cards instead of leaving a ragged left edge down the screen. From 768pt the
 * pages split into two `.page-column`s, each its own text column; anything
 * outside a column (the page title, a full-width footer) belongs to the
 * leftmost one.
 */
async function textColumnMisalignments(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const CARD_PADDING = 16
    const g = globalThis as unknown as {
      document: { querySelectorAll: (selector: string) => Iterable<DomElement> }
      // getBoundingClientRect().left is the BORDER edge; the gutter's indent
      // is padding, which lives inside it. Measure where the text starts.
      getComputedStyle: (el: DomElement) => { paddingLeft: string }
    }
    const columnLefts = [...g.document.querySelectorAll('.page-column')]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 || r.height > 0)
      .map((r) => Math.round(r.left))
    const leftmost = columnLefts.length === 0 ? 0 : Math.min(...columnLefts)
    const columnOf = (el: DomElement) => {
      const column = el.closest('.page-column')
      return column === null ? leftmost : Math.round(column.getBoundingClientRect().left)
    }
    const lefts = (selector: string, withPadding: boolean) => {
      const byColumn = new Map<number, Set<number>>()
      for (const el of g.document.querySelectorAll(selector)) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 && r.height === 0) continue
        const pad = withPadding ? parseFloat(g.getComputedStyle(el).paddingLeft) : 0
        const key = columnOf(el)
        const values = byColumn.get(key) ?? new Set<number>()
        values.add(Math.round(r.left + pad))
        byColumn.set(key, values)
      }
      return byColumn
    }
    const gutters = lefts('.gutter', true)
    const cards = lefts('.surface', false)
    const out: string[] = []
    for (const column of new Set([...gutters.keys(), ...cards.keys()])) {
      const where = `column at x=${String(column)}`
      const columnGutters = [...(gutters.get(column) ?? [])]
      const columnCards = [...(cards.get(column) ?? [])]
      if (columnGutters.length > 1) {
        out.push(`${where}: .gutter text at several x: ${columnGutters.join(', ')}`)
      }
      if (columnCards.length > 1) {
        out.push(`${where}: .surface elements at several x: ${columnCards.join(', ')}`)
      }
      const gutter = columnGutters[0]
      const card = columnCards[0]
      if (gutter !== undefined && card !== undefined && gutter - card !== CARD_PADDING) {
        out.push(
          `${where}: gutter x=${String(gutter)} is not ${String(CARD_PADDING)}px inside card x=${String(card)}`,
        )
      }
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
  // A second weigh-in a week back, so Home and Weight lay out the per-week
  // change instead of the shorter first-weigh-in line.
  await seedLastWeeksWeighIn(request, tag)

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
 * A bowl with two foods on it is the widest row the app can produce: two food
 * names, two gram figures and a meal total, all inside one checklist row on a
 * 375pt screen. If any layout is going to break, it breaks here.
 */
test('a two-food bowl shows both foods and holds its layout', async ({ page }, testInfo) => {
  test.setTimeout(180_000)

  await seedHousehold(page, { tag: `combo-${testInfo.project.name}` })

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

  // She eats both the kibble and the tuna at every meal.
  await expect(page.getByTestId('plan-edit')).toBeVisible(WAIT)
  await page.getByTestId('plan-edit').click()
  await expect(page.getByTestId('plan-item-grams-0')).toBeVisible(WAIT)
  await page.getByTestId('plan-item-grams-0').fill('60')
  await page.getByTestId('plan-add-food').click()
  await page.getByTestId('plan-item-food-1').selectOption({ label: 'Wet Tuna in Jelly' })
  await page.getByTestId('plan-item-grams-1').fill('240')
  await page.getByTestId('plan-save').click()

  const firstMeal = page.getByRole('listitem').filter({ hasText: '07:00' })
  await expect(firstMeal).toContainText('Test Kibble with a fairly long name', WAIT)
  await expect(firstMeal).toContainText('Wet Tuna in Jelly')
  await expect(firstMeal).toContainText('20 g')
  await expect(firstMeal).toContainText('80 g')

  // The revision leaves a superseded plan behind, so the history is here too —
  // opened, because a collapsed section cannot break a layout.
  await page.getByText('Plan history').click()
  // The superseded plan is the one still naming the kibble as the whole bowl.
  await expect(page.getByText('69 g Test Kibble with a fairly long name a day')).toBeVisible(WAIT)

  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}-food-combo.png`,
    fullPage: true,
  })
  await testInfo.attach(`${testInfo.project.name}-food-combo`, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  })

  expect(await overflowingElements(page), 'a combo bowl overflows the viewport').toEqual([])
  expect(await documentScrollsSideways(page), 'the combo Food page scrolls sideways').toBe(false)
  expect(await controlsOutsideTheirCard(page), 'a control escapes its card').toEqual([])
  expect(await smallTouchTargets(page), 'an under-sized tap target').toEqual([])
  expect(await textColumnMisalignments(page), 'a ragged text column').toEqual([])
})

/**
 * Elements whose own background is still a light colour. In dark mode every
 * surface comes from a token, so a light box here is a hard-coded colour that
 * never learnt about the dark palette (a stray bg-white, a library default).
 */
async function lightBackgrounds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const g = globalThis as unknown as {
      document: { querySelectorAll: (selector: string) => Iterable<DomElement> }
      getComputedStyle: (el: DomElement) => { backgroundColor: string }
    }
    const out: string[] = []
    for (const el of g.document.querySelectorAll('body, body *')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) continue
      const match = /rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/.exec(
        g.getComputedStyle(el).backgroundColor,
      )
      if (match === null) continue
      const [, red = '0', green = '0', blue = '0', alpha = '1'] = match
      if (Number(alpha) < 0.5) continue
      // Relative luminance, roughly: anything past mid-grey is a light box.
      // Coral fills (buttons, ticked bowls) are the accent and stay coral.
      const lum = (0.2126 * Number(red) + 0.7152 * Number(green) + 0.0722 * Number(blue)) / 255
      const isCoral = Number(red) > 200 && Number(green) < 160
      if (lum > 0.5 && !isCoral) {
        const cls = typeof el.className === 'string' ? el.className.slice(0, 60) : ''
        out.push(`<${el.tagName.toLowerCase()} class="${cls}"> ${match[0]}`)
      }
    }
    return out.slice(0, 5)
  })
}

// Dark mode follows the phone's setting, so both iPhones will show it the
// moment either owner switches theirs. Same sweep, dark palette.
test.describe('in dark mode', () => {
  test.use({ colorScheme: 'dark' })

  test('every screen is dark, with nothing left on a light surface', async ({
    page,
    request,
  }, testInfo) => {
    test.setTimeout(180_000)

    const tag = `dark-${testInfo.project.name}`
    await seedHousehold(page, { tag })
    await seedPreviousPlan(request, tag)
    await seedLastWeeksWeighIn(request, tag)

    for (const name of PAGES) {
      await tabBar(page).getByRole('link', { name }).click()
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible(WAIT)
      await page.waitForTimeout(500)

      await page.screenshot({
        path: `test-results/screenshots/${testInfo.project.name}-${name.toLowerCase()}-dark.png`,
        fullPage: true,
      })

      expect(await lightBackgrounds(page), `${name} has a light surface in dark mode`).toEqual([])
      expect(await overflowingElements(page), `${name} has elements past the viewport`).toEqual([])
    }
  })

  test('the sign-in screen is dark', async ({ page }, testInfo) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'CatTrack' })).toBeVisible(WAIT)

    await page.screenshot({
      path: `test-results/screenshots/${testInfo.project.name}-signin-dark.png`,
      fullPage: true,
    })

    expect(await lightBackgrounds(page), 'sign-in has a light surface in dark mode').toEqual([])
  })
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

/**
 * iOS 27 blurs the top of an installed web app unless a fixed, full-width box
 * sits against the top edge (see .status-bar-backdrop in index.css). Neither
 * the blur nor a notch exists in Playwright, so this pins what WebKit looks
 * for: fixed at the very top, the full width, in the page's own colour — in
 * both themes, because the status bar takes that colour.
 */
for (const colorScheme of ['light', 'dark'] as const) {
  test(`the status bar sits on a solid ${colorScheme} backdrop`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'CatTrack' })).toBeVisible(WAIT)

    const backdrop = await page.evaluate(() => {
      const g = globalThis as unknown as {
        innerWidth: number
        document: { body: DomElement; querySelector: (selector: string) => DomElement | null }
        getComputedStyle: (el: DomElement) => {
          position: string
          top: string
          backgroundColor: string
        }
      }
      const el = g.document.querySelector('.status-bar-backdrop')
      if (el === null) return null
      const style = g.getComputedStyle(el)
      return {
        position: style.position,
        top: style.top,
        width: el.getBoundingClientRect().width,
        viewport: g.innerWidth,
        colour: style.backgroundColor,
        page: g.getComputedStyle(g.document.body).backgroundColor,
      }
    })

    expect(backdrop, 'no .status-bar-backdrop in the page').not.toBeNull()
    expect(backdrop?.position).toBe('fixed')
    expect(backdrop?.top).toBe('0px')
    expect(backdrop?.width).toBe(backdrop?.viewport)
    expect(backdrop?.colour, 'the status bar would not match the page').toBe(backdrop?.page)
  })
}
