import { expect, test, type Page } from '@playwright/test'

/**
 * PWA plumbing checks — independent of auth/emulator data. The app is built
 * with vite-plugin-pwa (generateSW), so the preview server must expose a
 * manifest and a precaching service worker that can serve the app shell
 * offline.
 */

interface ManifestIcon {
  src: string
  sizes: string
  type: string
  purpose?: string
}

interface WebManifest {
  name: string
  display: string
  icons: ManifestIcon[]
}

/**
 * Resolves once the page's service worker registration has an active worker
 * (precache complete), or reports why it could not. Bounded by an in-page
 * 20s race so a broken registration fails the assertion instead of hanging
 * until the test timeout.
 */
function serviceWorkerOutcome(page: Page): Promise<string> {
  return page.evaluate(async () => {
    // tests/e2e compiles under the node tsconfig (no DOM lib), so the browser
    // globals are typed structurally here.
    const nav = (
      globalThis as unknown as {
        navigator?: {
          serviceWorker?: { ready: Promise<{ active: { state: string } | null }> }
        }
      }
    ).navigator
    const sw = nav?.serviceWorker
    if (sw === undefined) return 'service-worker-unsupported'
    return await Promise.race([
      sw.ready.then((registration) =>
        registration.active === null ? 'ready-without-active-worker' : 'active',
      ),
      new Promise<'timeout-waiting-for-ready'>((resolve) => {
        setTimeout(() => {
          resolve('timeout-waiting-for-ready')
        }, 20_000)
      }),
    ])
  })
}

test('serves a valid web app manifest', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest')
  expect(response.status()).toBe(200)

  const manifest = (await response.json()) as WebManifest
  expect(manifest.name).toBe('CatTrack')
  expect(manifest.display).toBe('standalone')

  const sizes = manifest.icons.map((icon) => icon.sizes)
  expect(sizes).toContain('192x192')
  expect(sizes).toContain('512x512')
  expect(manifest.icons.some((icon) => icon.purpose?.includes('maskable') ?? false)).toBe(true)
})

test('registers a service worker that becomes active', async ({ page }) => {
  await page.goto('/')
  expect(await serviceWorkerOutcome(page)).toBe('active')
})

test('precaches the app shell so navigations work offline', async ({ page }) => {
  await page.goto('/')
  // Wait for install + activation so the precache is fully populated.
  expect(await serviceWorkerOutcome(page)).toBe('active')

  // registerType is 'prompt' (no clientsClaim), so the first-load page is not
  // yet controlled — reload once so navigations go through the service worker.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'CatTrack' })).toBeVisible({ timeout: 15_000 })

  // Playwright's WebKit cannot emulate offline for service-worker-served
  // pages: context.setOffline() (and route aborts) sever requests before the
  // fetch handler runs, so an offline page.reload() dies with "WebKit
  // encountered an internal error" even though a real device serves the shell
  // from the precache. Assert the offline contract directly instead: the page
  // is controlled by the service worker, and the app shell plus the hashed
  // bundles it references sit in the workbox precache that navigateFallback
  // serves without network.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const g = globalThis as unknown as {
            navigator: { serviceWorker: { controller: object | null } }
          }
          return g.navigator.serviceWorker.controller !== null
        }),
      { timeout: 15_000 },
    )
    .toBe(true)

  const precache = await page.evaluate(async () => {
    const g = globalThis as unknown as {
      caches: {
        keys(): Promise<string[]>
        match(url: string, opts: { ignoreSearch: boolean }): Promise<object | undefined>
        open(name: string): Promise<{ keys(): Promise<{ url: string }[]> }>
      }
    }
    const appShell = await g.caches.match('/index.html', { ignoreSearch: true })
    const names = await g.caches.keys()
    const precacheName = names.find((name) => name.includes('precache'))
    const urls =
      precacheName === undefined
        ? []
        : (await (await g.caches.open(precacheName)).keys()).map((request) => request.url)
    return { appShellCached: appShell !== undefined, urls }
  })

  expect(precache.appShellCached).toBe(true)
  // The shell alone is not enough — an offline boot white-screens unless the
  // hashed JS/CSS bundles index.html references are precached too.
  expect(precache.urls.some((url) => url.includes('/assets/') && url.endsWith('.js'))).toBe(true)
  expect(precache.urls.some((url) => url.includes('/assets/') && url.endsWith('.css'))).toBe(true)
})
