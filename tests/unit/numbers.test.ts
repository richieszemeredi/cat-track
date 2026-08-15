import { describe, expect, it } from 'vitest'
import { parseDecimal } from '../../src/lib/numbers'

describe('parseDecimal', () => {
  it('parses a plain decimal point', () => {
    expect(parseDecimal('4.25')).toBe(4.25)
  })

  // The reason this helper exists: the iOS decimal keypad offers a comma.
  it('parses the comma the iOS keypad offers', () => {
    expect(parseDecimal('4,25')).toBe(4.25)
    expect(parseDecimal('0,5')).toBe(0.5)
  })

  it('trims surrounding whitespace', () => {
    expect(parseDecimal('  2,4  ')).toBe(2.4)
  })

  it('parses integers and negative numbers', () => {
    expect(parseDecimal('40')).toBe(40)
    expect(parseDecimal('-5')).toBe(-5)
  })

  it('returns null for empty or whitespace-only input', () => {
    expect(parseDecimal('')).toBeNull()
    expect(parseDecimal('   ')).toBeNull()
  })

  it.each(['abc', '1,2,3', '4.5.6', 'NaN', '1 2'])('returns null for %s', (raw) => {
    expect(parseDecimal(raw)).toBeNull()
  })

  it('returns null for infinities rather than a bogus number', () => {
    expect(parseDecimal('Infinity')).toBeNull()
    expect(parseDecimal('-Infinity')).toBeNull()
  })
})
