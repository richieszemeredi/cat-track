import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import {
  addFoodOnSupplies,
  addLitterOnSupplies,
  openLitterAddForm,
  seedHousehold,
  seedLastWeeksWeighIn,
  seedLitterBoxes,
  seedWaterBowls,
  seedPreviousPlan,
  seedSecondCat,
  tabBar,
  WAIT,
} from './seed'

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

const PAGES = ['Home', 'Weight', 'Plan', 'Supplies', 'Profile'] as const
type PageName = (typeof PAGES)[number]
const PATHS: Record<PageName, RegExp> = {
  Home: /\/$/,
  Weight: /\/weight$/,
  Plan: /\/plan$/,
  Supplies: /\/supplies$/,
  Profile: /\/profile$/,
}

/**
 * Go to a tab and make sure it got there, tapping again if a tap was lost:
 * every screen has an h1, so waiting for one alone let a tap WebKit dropped
 * audit the previous screen under the next one's name.
 */
async function openTab(page: Page, name: PageName): Promise<void> {
  await expect(async () => {
    await tabBar(page).getByRole('link', { name }).click()
    await expect(page).toHaveURL(PATHS[name], { timeout: 2_000 })
  }).toPass(WAIT)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible(WAIT)
}

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
  getClientRects: () => Iterable<{ top: number; width: number }>
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

/**
 * Buttons that hug the edge of the card they sit in. A chip or a button
 * inside a card belongs in the card's text column; one flush with its border
 * has lost its padding. The off-plan fold's "Log something" chip once
 * stretched edge to edge across its card because a class name ran into the
 * next one ("self-startmx-4"), which no viewport or escape check could see.
 */
async function buttonsHuggingTheirCard(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const INSET = 8
    const g = globalThis as unknown as {
      document: { querySelectorAll: (selector: string) => Iterable<DomElement> }
    }
    const out: string[] = []
    for (const el of g.document.querySelectorAll(
      '.surface .btn-chip, .surface .btn-primary, .surface .btn-secondary',
    )) {
      const card = el.closest('.surface')
      if (card === null) continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) continue
      const c = card.getBoundingClientRect()
      if (r.left < c.left + INSET || r.right > c.right - INSET) {
        out.push(
          `"${(el.textContent ?? '').trim().slice(0, 24)}" ` +
            `${String(Math.round(r.left))}..${String(Math.round(r.right))} ` +
            `in card ${String(Math.round(c.left))}..${String(Math.round(c.right))}`,
        )
      }
    }
    return out.slice(0, 5)
  })
}

/**
 * Phrases that must move to the next line whole: a "Needs attention" line
 * once wrapped as "· about 1 / day left", a cat's age as "1 year 1 / month
 * old", and a long name beside the kg field broke into three lines.
 */
async function splitPhrases(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const g = globalThis as unknown as {
      document: { querySelectorAll: (selector: string) => Iterable<DomElement> }
    }
    const out: string[] = []
    for (const el of g.document.querySelectorAll(
      '[data-testid="home-attention-detail"], [data-testid="cat-age"], ' +
        '[data-testid="home-weight-name"]',
    )) {
      // Chromium gives an inline element one rect per text node, so count the
      // distinct lines they sit on rather than the rects.
      const lines = new Set<number>()
      for (const r of el.getClientRects()) if (r.width > 0) lines.add(Math.round(r.top))
      if (lines.size > 1) out.push((el.textContent ?? '').trim())
    }
    return out
  })
}

/**
 * Lines that end on one stray word. A wrapped "— time to order" left "order"
 * alone under a full line, and Plan's note ended on "history." by itself:
 * the line reads as finished before its point. Checked on every danger line,
 * every page-level note (`.gutter`) and anything marked `text-balance`.
 */
async function orphanedWords(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    interface LineRect {
      top: number
      width: number
    }
    const g = globalThis as unknown as {
      document: {
        querySelectorAll: (selector: string) => Iterable<DomElement>
        createRange: () => {
          selectNodeContents: (el: DomElement) => void
          getClientRects: () => Iterable<LineRect>
        }
      }
    }
    const out: string[] = []
    for (const el of g.document.querySelectorAll(
      'main p.text-danger, main p.gutter, main .text-balance',
    )) {
      const range = g.document.createRange()
      range.selectNodeContents(el)
      // One rect per line per text run; merge runs that share a line.
      const lines = new Map<number, number>()
      for (const r of range.getClientRects()) {
        if (r.width === 0) continue
        const top = Math.round(r.top)
        lines.set(top, (lines.get(top) ?? 0) + r.width)
      }
      if (lines.size < 2) continue
      const widths = [...lines.entries()].sort((a, b) => a[0] - b[0]).map(([, w]) => w)
      const last = widths.at(-1) ?? 0
      const widest = Math.max(...widths)
      const text = (el.textContent ?? '').trim()
      const lastWord = text.split(/\s+/).at(-1) ?? ''
      // A last line about one short word wide, under a much wider one.
      if (last < widest * 0.25 && last < lastWord.length * 12) out.push(text)
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

/** Narrower than this and a column is tighter than a card on the 12 mini. */
const MIN_COLUMN_WIDTH = 343
/** The width pages split into two columns at (Tailwind `md`). */
const TWO_COLUMNS_FROM = 768

/**
 * From 768pt every screen splits into two columns side by side, each at least
 * as wide as a card on the narrowest phone; below that they stack, left edges
 * together, which is the phone layout unchanged. Checked both ways so a
 * screen that silently falls back to one long column on an iPad fails too.
 */
async function columnProblems(page: Page): Promise<string[]> {
  const viewport = page.viewportSize()
  if (viewport === null) return ['no viewport']
  const columns = await page.evaluate(() => {
    const g = globalThis as unknown as {
      document: { querySelectorAll: (selector: string) => Iterable<DomElement> }
    }
    return [...g.document.querySelectorAll('.page-column')].map((el) => {
      const r = el.getBoundingClientRect()
      return { left: Math.round(r.left), width: Math.round(r.width) }
    })
  })
  const out: string[] = []
  if (columns.length !== 2) return [`expected 2 .page-column, found ${String(columns.length)}`]
  const [first, second] = columns
  if (first === undefined || second === undefined) return out
  if (viewport.width >= TWO_COLUMNS_FROM) {
    if (second.left <= first.left) out.push('the columns are stacked, not side by side')
    for (const column of columns) {
      if (column.width < MIN_COLUMN_WIDTH) {
        out.push(`a column is ${String(column.width)}pt, under ${String(MIN_COLUMN_WIDTH)}`)
      }
    }
  } else if (second.left !== first.left) {
    out.push(`the columns sit side by side on a ${String(viewport.width)}pt phone`)
  }
  return out
}

/** The width the tab bar stands up as a left rail at (Tailwind `lg`). */
const RAIL_FROM = 1024

/**
 * Below 1024pt the main nav is a full-width bar along the bottom; from 1024pt
 * it is a full-height rail down the left, and the page content starts to the
 * right of it — a rail drawn over the first column would hide its text
 * without overflowing anything, so the viewport checks alone cannot see it.
 */
async function navProblems(page: Page): Promise<string[]> {
  const geometry = await page.evaluate(() => {
    const g = globalThis as unknown as {
      innerWidth: number
      innerHeight: number
      document: { querySelector: (selector: string) => DomElement | null }
    }
    const nav = g.document.querySelector('nav[aria-label="Main"]')
    const main = g.document.querySelector('main')
    if (nav === null || main === null) return null
    const n = nav.getBoundingClientRect() as DomRect & { top: number; bottom: number }
    return {
      viewport: { width: g.innerWidth, height: g.innerHeight },
      nav: { left: n.left, right: n.right, top: n.top, bottom: n.bottom, width: n.width },
      mainLeft: main.getBoundingClientRect().left,
    }
  })
  if (geometry === null) return ['no main nav or <main> on the page']
  const { viewport, nav, mainLeft } = geometry
  const out: string[] = []
  const near = (a: number, b: number) => Math.abs(a - b) <= 1
  if (viewport.width >= RAIL_FROM) {
    if (!near(nav.left, 0) || !near(nav.top, 0) || !near(nav.bottom, viewport.height)) {
      out.push(`the rail is not a full-height strip on the left: ${JSON.stringify(nav)}`)
    }
    if (nav.width > 140) out.push(`the rail is ${String(Math.round(nav.width))}pt wide`)
    if (mainLeft < nav.right - 1) {
      out.push(`content starts at x=${String(Math.round(mainLeft))}, under the rail`)
    }
  } else if (!near(nav.bottom, viewport.height) || !near(nav.width, viewport.width)) {
    out.push(`the tab bar is not a full-width bar along the bottom: ${JSON.stringify(nav)}`)
  }
  return out
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

/** The second litter kind: a long name, for every line that carries one. */
const LONG_LITTER = 'Silica crystals, unscented, large grain'

/**
 * Everything a screen can show at once, short of a second cat: a superseded
 * plan, a week-old weigh-in (so the weekly trend line), two litter kinds, a
 * fresh and an overdue litter box (one of each kind, so Home names them), a
 * fresh and a stale water bowl, and a food and a litter both running low —
 * so Home leads with a full "Needs attention" and the Supplies dot is on the
 * tab bar.
 */
async function seedEverything(page: Page, request: APIRequestContext, tag: string): Promise<void> {
  await seedHousehold(page, { tag })
  await seedPreviousPlan(request, tag)
  await seedLastWeeksWeighIn(request, tag)
  await addLitterOnSupplies(page, { name: 'Clumping', bagSize: '10', openingBags: '6' })
  await addLitterOnSupplies(page, { name: LONG_LITTER, bagSize: '3,8', bagUnit: 'kg' })
  await seedLitterBoxes(page, LONG_LITTER)
  await seedWaterBowls(page, request, tag)

  await tabBar(page).getByRole('link', { name: 'Supplies' }).click()
  // The kibble gets a bag size, and a count of one bag: a day and a bit at
  // 69 g a day, so the longest "Order …" line Home can produce.
  const kibble = page.getByTestId('food-supply').first()
  await expect(kibble).toBeVisible(WAIT)
  await kibble.getByTestId('food-supply-edit').click()
  await kibble.getByTestId('food-unit-size').fill('100')
  await kibble.getByTestId('food-save').click()
  await expect(kibble).toContainText('100 g bags', WAIT)
  // The edit panel closes on the server's ack, which can land after the meta
  // line has already updated from the local write: a Recount opened before
  // then would be closed by it.
  await expect(kibble.getByTestId('food-name')).toBeHidden(WAIT)
  await kibble.getByTestId('food-supply-recount').click()
  await kibble.getByTestId('food-supply-count-amount').fill('1')
  await kibble.getByTestId('food-supply-count-save').click()
  await expect(kibble).toContainText('time to order', WAIT)

  // The kind the overdue box takes, down to one bag: its swap is due, so
  // nothing would be left after it.
  const litter = page.getByTestId('litter-supply').filter({ hasText: LONG_LITTER })
  // A tap WebKit drops leaves the panel shut; tap again until it opens.
  await expect(async () => {
    if (!(await litter.getByTestId('litter-supply-count-amount').isVisible())) {
      await litter.getByTestId('litter-supply-recount').click()
    }
    await expect(litter.getByTestId('litter-supply-count-amount')).toBeVisible({ timeout: 2_000 })
  }).toPass(WAIT)
  await litter.getByTestId('litter-supply-count-amount').fill('1')
  await litter.getByTestId('litter-supply-count-save').click()
  await expect(litter).toContainText('time to order', WAIT)
  await expect(page.getByTestId('supplies-dot')).toBeVisible(WAIT)
}

test('every screen fits the viewport without sideways scroll', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(240_000)

  // Unique per attempt and per run: the emulator REST seeding finds the
  // household BY NAME, and a retry — or a re-run against an emulator still
  // warm from the last one — would otherwise find an older household.
  const tag = `layout-${testInfo.project.name}-${String(testInfo.repeatEachIndex)}-${String(testInfo.retry)}-${String(Date.now())}`
  await seedEverything(page, request, tag)

  const audit = async (name: PageName, shot: string, navigate = true) => {
    if (navigate) await openTab(page, name)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible(WAIT)
    // Recharts measures its container on a frame; give the chart one.
    await page.waitForTimeout(500)

    await testInfo.attach(`${testInfo.project.name}-${shot}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
    await page.screenshot({
      path: `test-results/screenshots/${testInfo.project.name}-${shot}.png`,
      fullPage: true,
    })

    expect(await overflowingElements(page), `${shot} has elements past the viewport`).toEqual([])
    expect(await documentScrollsSideways(page), `${shot} scrolls sideways`).toBe(false)
    expect(await controlsOutsideTheirCard(page), `${shot} has controls escaping a card`).toEqual([])
    expect(await smallTouchTargets(page), `${shot} has under-sized tap targets`).toEqual([])
    expect(await buttonsHuggingTheirCard(page), `${shot} has a button on a card's edge`).toEqual([])
    expect(await splitPhrases(page), `${shot} splits a phrase across lines`).toEqual([])
    expect(await orphanedWords(page), `${shot} ends a line on a stray word`).toEqual([])
    expect(await textColumnMisalignments(page), `${shot} has a ragged text column`).toEqual([])
    expect(await columnProblems(page), `${shot} columns`).toEqual([])
    expect(await navProblems(page), `${shot} main nav`).toEqual([])
  }

  // ---- one cat ----
  // Home leads with "Needs attention": the low food, the low litter and the
  // overdue box.
  await audit('Home', 'home-single')
  await expect(page.getByTestId('home-attention-row')).toHaveCount(3)

  // The two folds, open: off-plan with its form, the litter boxes with theirs.
  await page.getByTestId('home-off-plan-summary').click()
  await page.getByTestId('off-plan-open').click()
  await expect(page.getByTestId('meal-food-select')).toBeVisible(WAIT)
  await openLitterAddForm(page)
  await audit('Home', 'home-single-folds', false)

  // A water bowl's edit form, and the add-another form it leads to.
  await page.getByTestId('water-edit').first().click()
  await expect(
    page.getByTestId('home-water-row').first().getByTestId('water-location'),
  ).toBeVisible(WAIT)
  await audit('Home', 'home-water-forms', false)
  await page.getByTestId('water-add-another').click()
  await expect(page.getByTestId('home-water-add')).toBeVisible(WAIT)
  await audit('Home', 'home-water-add', false)

  // Plan for one cat: the plan beside its reference folds, both open.
  await tabBar(page).getByRole('link', { name: 'Plan' }).click()
  await page.getByText('How the target works').click()
  await page.getByText(/^Plan history/).click()
  await audit('Plan', 'plan-single', false)

  // Supplies: each stock panel open, then the food form with its stock fields.
  await tabBar(page).getByRole('link', { name: 'Supplies' }).click()
  const kibble = page.getByTestId('food-supply').first()
  await kibble.getByTestId('food-supply-bought').click()
  await expect(kibble.getByTestId('food-supply-bought-amount')).toBeVisible(WAIT)
  await page
    .getByTestId('litter-supply')
    .filter({ hasText: LONG_LITTER })
    .getByTestId('litter-supply-recount')
    .click()
  await audit('Supplies', 'supplies-panels', false)
  await kibble.getByTestId('food-supply-edit').click()
  await expect(kibble.getByTestId('food-name')).toBeVisible(WAIT)
  await audit('Supplies', 'supplies-edit-food', false)
  await page.getByTestId('supplies-add-food').click()
  await expect(page.getByTestId('food-opening-units')).toBeVisible(WAIT)
  await audit('Supplies', 'supplies-add-food', false)
  // The litter form, editing the long-named kind and adding one.
  const longLitter = page.getByTestId('litter-supply').filter({ hasText: LONG_LITTER })
  await longLitter.getByTestId('litter-supply-edit').click()
  await expect(longLitter.getByTestId('litter-kind-name')).toBeVisible(WAIT)
  await audit('Supplies', 'supplies-edit-litter', false)
  await page.getByTestId('supplies-add-litter').click()
  await expect(page.getByTestId('litter-kind-opening-bags')).toBeVisible(WAIT)
  await audit('Supplies', 'supplies-add-litter', false)

  // ---- two cats ----
  // A second cat with a long name, so the switcher chips, the per-cat blocks
  // on Home and Plan, and the named weight rows are laid out — and measured
  // by every check — with the longest label.
  await seedSecondCat(page, 'Princess Fluffington the Third')

  for (const name of PAGES) {
    await audit(name, name.toLowerCase())
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
  await tabBar(page).getByRole('link', { name: 'Supplies' }).click()
  await page.getByTestId('supplies-add-food').click()
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
 * names, two gram figures and a meal total, all inside one checklist row on
 * Home on a 375pt screen. If any layout is going to break, it breaks here.
 */
test('a two-food bowl shows both foods and holds its layout', async ({ page }, testInfo) => {
  test.setTimeout(180_000)

  await seedHousehold(page, { tag: `combo-${testInfo.project.name}` })
  await addFoodOnSupplies(page, { name: 'Wet Tuna in Jelly', type: 'wet', kcalPerGram: '0.75' })

  // She eats both the kibble and the tuna at every meal.
  await tabBar(page).getByRole('link', { name: 'Plan' }).click()
  await expect(page.getByTestId('plan-edit')).toBeVisible(WAIT)
  await page.getByTestId('plan-edit').click()
  await expect(page.getByTestId('plan-item-grams-0')).toBeVisible(WAIT)
  await page.getByTestId('plan-item-grams-0').fill('60')
  await page.getByTestId('plan-add-food').click()
  await page.getByTestId('plan-item-food-1').selectOption({ label: 'Wet Tuna in Jelly' })
  await page.getByTestId('plan-item-grams-1').fill('240')
  await page.getByTestId('plan-save').click()
  await expect(page.getByText('240 g a day')).toBeVisible(WAIT)

  const checks = async (where: string) => {
    expect(await overflowingElements(page), `${where} overflows the viewport`).toEqual([])
    expect(await documentScrollsSideways(page), `${where} scrolls sideways`).toBe(false)
    expect(await controlsOutsideTheirCard(page), `${where}: a control escapes its card`).toEqual([])
    expect(await smallTouchTargets(page), `${where}: an under-sized tap target`).toEqual([])
    expect(await buttonsHuggingTheirCard(page), `${where}: a button on a card's edge`).toEqual([])
    expect(await orphanedWords(page), `${where}: a line ends on a stray word`).toEqual([])
    expect(await textColumnMisalignments(page), `${where}: a ragged text column`).toEqual([])
  }
  const shoot = async (shot: string) => {
    await page.screenshot({
      path: `test-results/screenshots/${testInfo.project.name}-${shot}.png`,
      fullPage: true,
    })
    await testInfo.attach(`${testInfo.project.name}-${shot}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
  }

  // The revision leaves a superseded plan behind, so the history is here too —
  // opened, because a collapsed section cannot break a layout.
  await page.getByText(/^Plan history/).click()
  // The superseded plan is the one still naming the kibble as the whole bowl.
  await expect(page.getByText('69 g Test Kibble with a fairly long name a day')).toBeVisible(WAIT)
  await shoot('plan-combo')
  await checks('the combo Plan')

  await tabBar(page).getByRole('link', { name: 'Home' }).click()
  const firstMeal = page.getByRole('listitem').filter({ has: page.getByTestId('meal-tick-0') })
  await expect(firstMeal).toContainText('Test Kibble with a fairly long name', WAIT)
  await expect(firstMeal).toContainText('Wet Tuna in Jelly')
  await expect(firstMeal).toContainText('20 g')
  await expect(firstMeal).toContainText('80 g')
  // The bowl's own total, once there is more than one food to add up.
  await expect(firstMeal).toContainText('100 g')

  // Each food line keeps its grams on the row's right edge, beside the name,
  // however long the name: a name that pushed its figure onto a line of its
  // own would read as a third food.
  const foodLines = firstMeal.locator('div.text-sm')
  await expect(foodLines).toHaveCount(2)
  for (const line of await foodLines.all()) {
    const name = await line.locator('span').first().boundingBox()
    const grams = await line.locator('span').last().boundingBox()
    if (name === null || grams === null) throw new Error('a food line is not laid out')
    expect(Math.abs(name.y - grams.y), 'a food line wrapped its grams').toBeLessThanOrEqual(4)
    expect(grams.x).toBeGreaterThan(name.x)
  }

  await shoot('home-combo')
  await checks('the combo Home')
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

    const tag = `dark-${testInfo.project.name}-${String(testInfo.repeatEachIndex)}-${String(testInfo.retry)}-${String(Date.now())}`
    await seedEverything(page, request, tag)

    const sweep = async (shot: string) => {
      await page.screenshot({
        path: `test-results/screenshots/${testInfo.project.name}-${shot}-dark.png`,
        fullPage: true,
      })
      expect(await lightBackgrounds(page), `${shot} has a light surface in dark mode`).toEqual([])
      expect(await overflowingElements(page), `${shot} has elements past the viewport`).toEqual([])
    }

    for (const name of PAGES) {
      await openTab(page, name)
      await page.waitForTimeout(500)
      await sweep(name.toLowerCase())
    }

    // What only shows once opened: Home's folds (the box form with its
    // litter picker) and the stock panels and forms.
    await openLitterAddForm(page)
    await expect(page.getByTestId('litter-kind')).toBeVisible(WAIT)
    await page.getByTestId('home-off-plan-summary').click()
    await sweep('home-folds')

    await tabBar(page).getByRole('link', { name: 'Supplies' }).click()
    await page.getByTestId('food-supply').first().getByTestId('food-supply-bought').click()
    await page.getByTestId('supplies-add-food').click()
    await expect(page.getByTestId('food-opening-units')).toBeVisible(WAIT)
    const longLitter = page.getByTestId('litter-supply').filter({ hasText: LONG_LITTER })
    await longLitter.getByTestId('litter-supply-edit').click()
    await page.getByTestId('supplies-add-litter').click()
    await expect(page.getByTestId('litter-kind-opening-bags')).toBeVisible(WAIT)
    await sweep('supplies-panels')
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

/**
 * On a desktop (or an iPad with a keyboard) Tab has to show where it landed.
 * Only one ring style exists — :focus-visible in index.css — so checking the
 * first stop on the sign-in screen pins it for every button and link.
 */
test('a keyboard focus is visible', async ({ page, browserName }) => {
  // WebKit, like Safari, skips buttons and links on Tab unless the user has
  // turned on full keyboard access, so this is Chromium's to check.
  test.skip(browserName === 'webkit', 'WebKit does not Tab to buttons by default')
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'CatTrack' })).toBeVisible(WAIT)

  await page.keyboard.press('Tab')
  const outline = await page.evaluate(() => {
    const g = globalThis as unknown as {
      document: { activeElement: DomElement | null }
      getComputedStyle: (el: DomElement) => { outlineStyle: string; outlineWidth: string }
    }
    const el = g.document.activeElement
    if (el === null) return null
    const style = g.getComputedStyle(el)
    return { tag: el.tagName.toLowerCase(), style: style.outlineStyle, width: style.outlineWidth }
  })

  expect(outline, 'Tab focused nothing').not.toBeNull()
  expect(outline?.style, `no focus ring on the focused <${outline?.tag ?? ''}>`).not.toBe('none')
  expect(outline?.width).not.toBe('0px')
})
