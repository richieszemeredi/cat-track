import { Timestamp } from 'firebase/firestore'
import { describe, expect, it } from 'vitest'
import { litterBoxSchema, litterSchema, litterStockEventSchema } from '../../src/lib/schemas'
import { LEGACY_LITTER_ID } from '../../src/lib/stock'

const TS = Timestamp.fromDate(new Date(2026, 10, 1))

const BOX = {
  location: 'Bathroom',
  lastChangedAt: TS,
  changeEveryWeeks: 4,
  bagsPerSwap: 1,
  createdBy: 'u1',
  createdAt: TS,
}

const EVENT = { kind: 'bought', bags: 2, at: TS, createdBy: 'u1', createdAt: TS }

describe('litter box litterId', () => {
  it('reads an absent key as the legacy kind', () => {
    expect(litterBoxSchema.parse(BOX).litterId).toBe(LEGACY_LITTER_ID)
  })

  it('keeps an explicit null: no kind chosen', () => {
    expect(litterBoxSchema.parse({ ...BOX, litterId: null }).litterId).toBeNull()
  })

  it('keeps a kind id, and rejects an empty one', () => {
    expect(litterBoxSchema.parse({ ...BOX, litterId: 'l1' }).litterId).toBe('l1')
    expect(litterBoxSchema.safeParse({ ...BOX, litterId: '' }).success).toBe(false)
  })
})

describe('litter stock event litterId', () => {
  it('reads an absent key as the legacy kind', () => {
    expect(litterStockEventSchema.parse(EVENT).litterId).toBe(LEGACY_LITTER_ID)
  })

  it('keeps a kind id; null is not a kind', () => {
    expect(litterStockEventSchema.parse({ ...EVENT, litterId: 'l1' }).litterId).toBe('l1')
    expect(litterStockEventSchema.safeParse({ ...EVENT, litterId: null }).success).toBe(false)
  })
})

describe('litter kind', () => {
  it('defaults the bag size, unit and archived when absent', () => {
    expect(litterSchema.parse({ name: 'Litter', createdBy: 'u1', createdAt: TS })).toMatchObject({
      name: 'Litter',
      bagSize: null,
      bagUnit: null,
      archived: false,
    })
  })

  it('reads a sized bag, and rejects a bad unit or size', () => {
    const kind = { name: 'Clumping', bagSize: 10, bagUnit: 'L', createdBy: 'u1', createdAt: TS }
    expect(litterSchema.parse(kind)).toMatchObject({ bagSize: 10, bagUnit: 'L' })
    expect(litterSchema.safeParse({ ...kind, bagUnit: 'lb' }).success).toBe(false)
    expect(litterSchema.safeParse({ ...kind, bagSize: 0 }).success).toBe(false)
  })
})
