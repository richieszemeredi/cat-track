import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type Cat } from '../../src/lib/schemas'
import { readSelectedCatId, resolveActiveCat, writeSelectedCatId } from '../../src/lib/selected-cat'

const cat = (id: string) => ({ id }) as Cat
const MOCHI = cat('mochi')
const BISCUIT = cat('biscuit')

describe('resolveActiveCat', () => {
  it('is null before any cat exists', () => {
    expect(resolveActiveCat([], null)).toBeNull()
    expect(resolveActiveCat([], 'mochi')).toBeNull()
  })

  it('defaults to the first-created cat when nothing is stored', () => {
    expect(resolveActiveCat([MOCHI, BISCUIT], null)).toBe(MOCHI)
  })

  it('uses the stored cat while it still exists', () => {
    expect(resolveActiveCat([MOCHI, BISCUIT], 'biscuit')).toBe(BISCUIT)
  })

  it('falls back to the first cat when the stored one is gone', () => {
    expect(resolveActiveCat([MOCHI, BISCUIT], 'deleted')).toBe(MOCHI)
  })
})

describe('selected cat storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('round-trips per household', () => {
    writeSelectedCatId('h1', 'biscuit')
    expect(readSelectedCatId('h1')).toBe('biscuit')
    expect(readSelectedCatId('h2')).toBeNull()
  })

  it('reads as nothing stored when storage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    try {
      expect(readSelectedCatId('h1')).toBeNull()
    } finally {
      spy.mockRestore()
    }
  })
})
