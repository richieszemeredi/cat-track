import { describe, expect, it } from 'vitest'
import { isIos } from '../../src/lib/standalone'

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
// What iPadOS Safari actually sends: the desktop-class Mac string.
const MAC_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
const WINDOWS_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

describe('isIos', () => {
  it('knows an iPhone by its user agent', () => {
    expect(isIos(IPHONE, 5)).toBe(true)
  })

  it('knows an iPad even though it claims to be a Mac', () => {
    expect(isIos(MAC_SAFARI, 5)).toBe(true)
  })

  it('leaves a real Mac and a PC alone', () => {
    expect(isIos(MAC_SAFARI, 0)).toBe(false)
    expect(isIos(WINDOWS_CHROME, 0)).toBe(false)
    // A Windows touch laptop has touch points but no Mac UA.
    expect(isIos(WINDOWS_CHROME, 10)).toBe(false)
  })
})
