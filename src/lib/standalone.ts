/** True when running as an installed Home-Screen PWA (standalone display). */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && navigator.standalone === true)
  )
}

/**
 * True on an iPhone or iPad. iPadOS Safari asks for desktop sites by default
 * and so reports itself as a Mac — the UA alone sent every iPad down the
 * desktop path, and its owner never saw the Add-to-Home-Screen steps. A Mac
 * has no touch screen, so touch points are what tell the two apart.
 */
export function isIos(
  userAgent: string = navigator.userAgent,
  maxTouchPoints: number = navigator.maxTouchPoints,
): boolean {
  return /iphone|ipad|ipod/i.test(userAgent) || (/macintosh/i.test(userAgent) && maxTouchPoints > 1)
}
