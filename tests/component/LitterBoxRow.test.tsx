import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LitterBoxRow } from '../../src/components/LitterFold'
import { type LitterBox, type LitterKind } from '../../src/lib/db'

vi.mock('../../src/lib/db', () => ({
  replaceLitterBox: vi.fn(),
  addLitterBox: vi.fn(),
  updateLitterBox: vi.fn(),
  deleteLitterBox: vi.fn(),
  awaitOrQueued: vi.fn(),
}))
// LitterFold's own data hooks are not under test here, only the row.
vi.mock('../../src/lib/supplies', () => ({ useSupplies: vi.fn() }))
vi.mock('../../src/lib/household', () => ({ useHousehold: vi.fn() }))
vi.mock('../../src/lib/auth', () => ({ useAuth: vi.fn() }))

const TODAY = new Date(2026, 10, 15)

const BOX: LitterBox = {
  id: 'box-1',
  location: 'Bathroom',
  lastChangedAt: new Date(2026, 10, 1),
  changeEveryWeeks: 4,
  bagsPerSwap: 2,
  litterId: 'litter-c',
  createdBy: 'user-1',
  createdAt: new Date(2026, 10, 1),
}

const LITTERS: LitterKind[] = [
  {
    id: 'litter-c',
    name: 'Clumping',
    bagSize: 10,
    bagUnit: 'L',
    archived: false,
    createdBy: 'user-1',
    createdAt: new Date(2026, 9, 1),
  },
]

function renderRow(showKind: boolean, box: LitterBox = BOX) {
  render(
    <ul>
      <LitterBoxRow
        order={0}
        box={box}
        today={TODAY}
        hid="hh-1"
        uid="user-1"
        canEdit
        litters={LITTERS}
        showKind={showKind}
      />
    </ul>,
  )
}

describe('LitterBoxRow', () => {
  it('names the kind after the location when asked to', () => {
    renderRow(true)

    expect(screen.getByText('Bathroom')).toHaveTextContent('Bathroom · Clumping')
    expect(screen.getByTestId('litter-box-kind')).toHaveClass('text-ink-soft')
  })

  it('says nothing about the kind with only one in the house', () => {
    renderRow(false)

    expect(screen.queryByTestId('litter-box-kind')).not.toBeInTheDocument()
  })

  it('says nothing for a box with no kind', () => {
    renderRow(true, { ...BOX, litterId: null })

    expect(screen.queryByTestId('litter-box-kind')).not.toBeInTheDocument()
  })
})
