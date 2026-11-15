import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../../src/lib/auth'
import {
  addLitter,
  addLitterStockEvent,
  awaitOrQueued,
  updateLitter,
  type LitterBox,
  type LitterKind,
  type LitterStockEvent,
} from '../../src/lib/db'
import { useHousehold, type HouseholdState } from '../../src/lib/household'
import { litterStockState } from '../../src/lib/stock'
import { useSupplies, type LitterKindSupply, type SuppliesState } from '../../src/lib/supplies'
import { Route } from '../../src/routes/supplies'

vi.mock('../../src/lib/db', () => ({
  addFood: vi.fn(),
  updateFood: vi.fn(),
  addFoodStockEvent: vi.fn(),
  addLitter: vi.fn(),
  updateLitter: vi.fn(),
  addLitterStockEvent: vi.fn(),
  awaitOrQueued: vi.fn(),
}))
vi.mock('../../src/lib/supplies', () => ({ useSupplies: vi.fn() }))
vi.mock('../../src/lib/household', () => ({ useHousehold: vi.fn() }))
vi.mock('../../src/lib/auth', () => ({ useAuth: vi.fn() }))

const addLitterMock = vi.mocked(addLitter)
const updateLitterMock = vi.mocked(updateLitter)
const addLitterStockEventMock = vi.mocked(addLitterStockEvent)
const awaitOrQueuedMock = vi.mocked(awaitOrQueued)
const useSuppliesMock = vi.mocked(useSupplies)
const useHouseholdMock = vi.mocked(useHousehold)
const useAuthMock = vi.mocked(useAuth)

const TODAY = new Date()

function makeLitter(overrides: Partial<LitterKind> = {}): LitterKind {
  return {
    id: 'litter-1',
    name: 'Clumping',
    bagSize: 10,
    bagUnit: 'L',
    archived: false,
    createdBy: 'user-1',
    createdAt: new Date(2026, 9, 1),
    ...overrides,
  }
}

function makeBox(overrides: Partial<LitterBox> = {}): LitterBox {
  return {
    id: 'box-1',
    location: 'Bathroom',
    lastChangedAt: TODAY,
    changeEveryWeeks: 4,
    bagsPerSwap: 1,
    litterId: 'litter-1',
    createdBy: 'user-1',
    createdAt: TODAY,
    ...overrides,
  }
}

function supplyOf(
  litter: LitterKind,
  events: LitterStockEvent[] = [],
  boxes: LitterBox[] = [],
): LitterKindSupply {
  return { litter, events, boxes, state: litterStockState({ events, boxes, today: TODAY }) }
}

function mockSupplies(kinds: LitterKind[], litters: LitterKindSupply[]): void {
  const supplies: SuppliesState = {
    foods: [],
    activeFoods: [],
    foodSupplies: new Map(),
    litterKinds: kinds,
    activeLitterKinds: kinds.filter((k) => !k.archived),
    litters,
    boxes: litters.flatMap((l) => l.boxes),
    alerts: [],
    anyLow: false,
    loading: false,
    isError: false,
  }
  useSuppliesMock.mockReturnValue(supplies)
}

function mockRole(canEdit: boolean): void {
  useHouseholdMock.mockReturnValue({
    householdId: 'hh-1',
    role: canEdit ? 'owner' : 'viewer',
    canEdit,
  } as unknown as HouseholdState)
}

function renderSupplies() {
  const Page = Route.options.component
  if (Page === undefined) throw new Error('the Supplies route has no component')
  return render(<Page />)
}

beforeEach(() => {
  addLitterMock.mockReset().mockResolvedValue(undefined)
  updateLitterMock.mockReset().mockResolvedValue(undefined)
  addLitterStockEventMock.mockReset().mockResolvedValue(undefined)
  awaitOrQueuedMock.mockReset().mockResolvedValue('confirmed')
  useAuthMock.mockReturnValue({ user: { uid: 'user-1' }, loading: false } as ReturnType<
    typeof useAuth
  >)
  mockRole(true)
})

describe('Supplies — litter', () => {
  it('says so when there is no litter yet, and offers to add one', async () => {
    mockSupplies([], [])
    const user = userEvent.setup()
    renderSupplies()

    expect(screen.getByText('No litter added yet.')).toBeInTheDocument()
    expect(screen.queryByTestId('litter-supply')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('supplies-add-litter'))
    await user.type(screen.getByTestId('litter-kind-name'), 'Clumping')
    await user.type(screen.getByTestId('litter-kind-opening-bags'), '3')
    await user.click(screen.getByTestId('litter-kind-save'))

    expect(addLitterMock).toHaveBeenCalledWith(
      'hh-1',
      'user-1',
      { name: 'Clumping', bagSize: null, bagUnit: null },
      3,
    )
    expect(screen.queryByTestId('litter-kind-name')).not.toBeInTheDocument()
  })

  it('shows one card per kind: its bag size, its boxes and its own stock', async () => {
    const clumping = makeLitter()
    const silica = makeLitter({ id: 'litter-2', name: 'Silica', bagSize: 5, bagUnit: 'kg' })
    const counted: LitterStockEvent = {
      id: 'ev-1',
      kind: 'count',
      bags: 4,
      litterId: 'litter-2',
      at: TODAY,
      createdBy: 'user-1',
      createdAt: TODAY,
    }
    mockSupplies(
      [clumping, silica],
      [
        supplyOf(clumping, [], [makeBox(), makeBox({ id: 'box-2', location: 'Hall' })]),
        supplyOf(silica, [counted]),
      ],
    )
    const user = userEvent.setup()
    renderSupplies()

    const [first, second] = screen.getAllByTestId('litter-supply')
    if (first === undefined || second === undefined) throw new Error('two cards expected')
    expect(within(first).getByRole('heading', { name: 'Clumping' })).toBeInTheDocument()
    expect(first).toHaveTextContent('10 L bags · Bathroom, Hall')
    expect(within(first).getByTestId('litter-supply-figure')).toHaveTextContent('Not counted yet')
    expect(second).toHaveTextContent('5 kg bags')
    expect(within(second).getByTestId('litter-supply-figure')).toHaveTextContent('4')

    // A recount names the kind it counts.
    await user.click(within(second).getByTestId('litter-supply-recount'))
    await user.click(within(second).getByTestId('litter-supply-count-save'))
    expect(addLitterStockEventMock).toHaveBeenCalledWith(
      'hh-1',
      'user-1',
      expect.objectContaining({ litterId: 'litter-2', kind: 'count', bags: 4 }),
    )
    expect(screen.getByText(/A full swap takes its box’s bags off/)).toBeInTheDocument()
  })

  it('edits a kind in place, and archives it after confirming', async () => {
    const clumping = makeLitter()
    mockSupplies([clumping], [supplyOf(clumping)])
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm')
    renderSupplies()

    const card = screen.getByTestId('litter-supply')
    await user.click(within(card).getByTestId('litter-supply-edit'))
    expect(within(card).getByTestId('litter-kind-name')).toHaveValue('Clumping')
    expect(within(card).queryByTestId('litter-kind-opening-bags')).not.toBeInTheDocument()
    await user.clear(within(card).getByTestId('litter-kind-name'))
    await user.type(within(card).getByTestId('litter-kind-name'), 'Clumping, unscented')
    await user.click(within(card).getByTestId('litter-kind-save'))
    expect(updateLitterMock).toHaveBeenCalledWith('hh-1', 'litter-1', {
      name: 'Clumping, unscented',
      bagSize: 10,
      bagUnit: 'L',
    })

    await user.click(within(card).getByTestId('litter-supply-edit'))
    confirm.mockReturnValueOnce(false)
    await user.click(within(card).getByRole('button', { name: 'Archive' }))
    expect(updateLitterMock).toHaveBeenCalledTimes(1)
    confirm.mockReturnValueOnce(true)
    await user.click(within(card).getByRole('button', { name: 'Archive' }))
    expect(updateLitterMock).toHaveBeenLastCalledWith('hh-1', 'litter-1', { archived: true })
    confirm.mockRestore()
  })

  it('keeps archived kinds behind "Show archived", where they can come back', async () => {
    const clumping = makeLitter()
    const old = makeLitter({ id: 'litter-old', name: 'Old pellets', archived: true })
    mockSupplies([clumping, old], [supplyOf(clumping)])
    const user = userEvent.setup()
    renderSupplies()

    expect(screen.queryByText('Old pellets')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show archived (1)' }))
    const row = screen.getByText('Old pellets').closest('li')
    if (row === null) throw new Error('archived row not rendered')
    await user.click(within(row).getByRole('button', { name: 'Unarchive' }))
    expect(updateLitterMock).toHaveBeenCalledWith('hh-1', 'litter-old', { archived: false })
  })

  it('shows a viewer the stock and nothing to change it with', async () => {
    mockRole(false)
    const clumping = makeLitter()
    const old = makeLitter({ id: 'litter-old', name: 'Old pellets', archived: true })
    mockSupplies([clumping, old], [supplyOf(clumping)])
    const user = userEvent.setup()
    renderSupplies()

    expect(screen.getByTestId('litter-supply')).toHaveTextContent('Clumping')
    expect(screen.queryByTestId('supplies-add-litter')).not.toBeInTheDocument()
    expect(screen.queryByTestId('litter-supply-recount')).not.toBeInTheDocument()
    expect(screen.queryByTestId('litter-supply-edit')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show archived (1)' }))
    expect(screen.getByText('Old pellets')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Unarchive' })).not.toBeInTheDocument()
  })
})
