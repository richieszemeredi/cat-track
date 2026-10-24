// Renders public/*.png app icons: the 🐈 emoji on a full-bleed coral square.
// Run with `node scripts/make-icons.mjs` on a Mac (Chromium draws Apple Color
// Emoji); the PNGs are committed, so this only reruns when the icon changes.
import { chromium } from '@playwright/test'

const CORAL = '#ff7a59'
// [file, pixel size, share of the square the emoji spans]. Maskable icons keep
// the artwork inside the central safe zone so an OS crop never clips the cat.
const ICONS = [
  ['apple-touch-icon.png', 180, 0.7],
  ['pwa-192.png', 192, 0.7],
  ['pwa-512.png', 512, 0.7],
  ['pwa-maskable-512.png', 512, 0.5],
]

const browser = await chromium.launch()
for (const [file, size, share] of ICONS) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(
    `<body style="margin:0;background:${CORAL};width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center"><span style="font-size:${Math.round(size * share * 0.85)}px;line-height:1;font-family:'Apple Color Emoji'">🐈</span></body>`,
  )
  await page.screenshot({ path: `public/${file}` })
  await page.close()
}
await browser.close()
