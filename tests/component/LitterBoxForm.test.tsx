import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LitterBoxForm } from '../../src/components/LitterBoxForm'
import {
  addLitterBox,
  awaitOrQueued,
  deleteLitterBox,
  updateLitterBox,
  type LitterBox,
  type LitterKind,
} from '../../src/lib/db'
import { expectLocalDate } from './fixtures'

vi.mock('../../src/lib/db', () => ({
  addLitterBox: vi.fn(),
  updateLitterBox: vi.fn(),
  deleteLitterBox: vi.fn(),
  awaitOrQueued: vi.fn(),
}))

const addLitterBoxMock = vi.mocked(addLitterBox)
const updateLitterBoxMock = vi.mocked(updateLitterBox)
const deleteLitterBoxMock = vi.mocked(deleteLitterBox)
const awaitOrQueuedMock = vi.mocked(awaitOrQueued)

const EXISTING: LitterBox = {
  id: 'box-1',
  location: 'Bathroom',
  lastChangedAt: new Date(2026, 8, 1),
  changeEveryWeeks: 6,
  bagsPerSwap: 2,
  litterId: 'default',
  createdBy: 'user-1',
  createdAt: new Date(2026, 8, 1),
}

function makeLitter(overrides: Partial<LitterKind> = {}): LitterKind {
  return {
    id: 'default',
    name: 'Litter',
    bagSize: null,
    bagUnit: null,
    archived: false,
    createdBy: 'user-1',
    createdAt: new Date(2026, 8, 1),
    ...overrides,
  }
}

const LITTERS: LitterKind[] = [makeLitter()]

function setDate(value: string): void {
  // userEvent cannot type into <input type="date">; change events are how
  // date pickers report values anyway.
  fireEvent.change(screen.getByLabelText('Last fully cleaned'), { target: { value } })
}

beforeEach(() => {
  addLitterBoxMock.mockReset().mockResolvedValue(undefined)
  updateLitterBoxMock.mockReset().mockResolvedValue(undefined)
  deleteLitterBoxMock.mockReset().mockResolvedValue(undefined)
  awaitOrQueuedMock.mockReset().mockResolvedValue('confirmed')
})

describe('LitterBoxForm', () => {
  it('adds a box with a trimmed location and the LOCAL date, then resets', async () => {
    const user = userEvent.setup()
    render(<LitterBoxForm hid="hh-1" uid="user-1" litters={LITTERS} />)

    await user.type(screen.getByTestId('litter-location'), '  Hallway  ')
    setDate('2026-02-14')
    await user.click(screen.getByTestId('litter-save'))

    expect(addLitterBoxMock).toHaveBeenCalledTimes(1)
    const [hid, uid, input] = addLitterBoxMock.mock.calls[0] ?? []
    expect(hid).toBe('hh-1')
    expect(uid).toBe('user-1')
    expect(input?.location).toBe('Hallway')
    // Local Feb 14 at midnight, not UTC midnight drifting a day.
    expectLocalDate(input?.lastChangedAt, 2026, 1, 14)
    expect(input?.changeEveryWeeks).toBe(4) // the default, untouched
    expect(input?.bagsPerSwap).toBe(1) // likewise

    expect(await screen.findByDisplayValue('')).toBe(screen.getByTestId('litter-location'))
  })

  it('refuses a blank location', () => {
    const { container } = render(<LitterBoxForm hid="hh-1" uid="user-1" litters={LITTERS} />)

    const form = container.querySelector('form')
    if (form === null) throw new Error('form not rendered')
    fireEvent.submit(form)

    expect(screen.getByRole('alert')).toHaveTextContent('Say where this box lives.')
    expect(addLitterBoxMock).not.toHaveBeenCalled()
  })

  it('treats a queued (offline) write as success', async () => {
    awaitOrQueuedMock.mockResolvedValue('queued')
    const user = userEvent.setup()
    const onDone = vi.fn()
    render(
      <LitterBoxForm
        hid="hh-1"
        uid="user-1"
        litters={LITTERS}
        existing={EXISTING}
        onDone={onDone}
      />,
    )

    await user.click(screen.getByTestId('litter-save'))

    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('edits an existing box: pre-filled, and updates rather than adds', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    render(
      <LitterBoxForm
        hid="hh-1"
        uid="user-1"
        litters={LITTERS}
        existing={EXISTING}
        onDone={onDone}
      />,
    )

    expect(screen.getByTestId('litter-location')).toHaveValue('Bathroom')
    expect(screen.getByTestId('litter-date')).toHaveValue('2026-09-01')

    expect(screen.getByTestId('litter-interval')).toHaveValue('6')
    expect(screen.getByTestId('litter-bags-per-swap')).toHaveValue('2')

    setDate('2026-09-10')
    await user.selectOptions(screen.getByTestId('litter-interval'), '8')
    await user.selectOptions(screen.getByLabelText('Bags per full swap'), '3')
    await user.click(screen.getByTestId('litter-save'))

    expect(addLitterBoxMock).not.toHaveBeenCalled()
    const [hid, boxId, patch] = updateLitterBoxMock.mock.calls[0] ?? []
    expect(hid).toBe('hh-1')
    expect(boxId).toBe('box-1')
    expectLocalDate(patch?.lastChangedAt, 2026, 8, 10)
    expect(patch?.changeEveryWeeks).toBe(8)
    expect(patch?.bagsPerSwap).toBe(3)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('deletes only after confirmation', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    const confirm = vi.spyOn(window, 'confirm')
    render(
      <LitterBoxForm
        hid="hh-1"
        uid="user-1"
        litters={LITTERS}
        existing={EXISTING}
        onDone={onDone}
      />,
    )

    confirm.mockReturnValueOnce(false)
    await user.click(screen.getByRole('button', { name: 'Delete litter box' }))
    expect(deleteLitterBoxMock).not.toHaveBeenCalled()

    confirm.mockReturnValueOnce(true)
    await user.click(screen.getByRole('button', { name: 'Delete litter box' }))
    expect(deleteLitterBoxMock).toHaveBeenCalledWith('hh-1', 'box-1')
    expect(onDone).toHaveBeenCalledTimes(1)
    confirm.mockRestore()
  })

  it('offers no delete while adding', () => {
    render(<LitterBoxForm hid="hh-1" uid="user-1" litters={LITTERS} />)

    expect(screen.queryByRole('button', { name: 'Delete litter box' })).not.toBeInTheDocument()
  })
})

describe('LitterBoxForm — which litter', () => {
  const clumping = makeLitter({ id: 'litter-c', name: 'Clumping' })
  const silica = makeLitter({ id: 'litter-s', name: 'Silica' })
  const archived = makeLitter({ id: 'litter-old', name: 'Old pellets', archived: true })

  async function addBox(litters: LitterKind[], pick?: string) {
    const user = userEvent.setup()
    render(<LitterBoxForm hid="hh-1" uid="user-1" litters={litters} />)
    await user.type(screen.getByTestId('litter-location'), 'Hall')
    if (pick !== undefined) await user.selectOptions(screen.getByLabelText('Litter'), pick)
    await user.click(screen.getByTestId('litter-save'))
    return addLitterBoxMock.mock.calls[0]?.[2]
  }

  it('gives a new box the only kind there is', async () => {
    const input = await addBox([clumping])
    expect(input?.litterId).toBe('litter-c')
  })

  it('offers the active kinds, starts on the first, and saves the one picked', async () => {
    const user = userEvent.setup()
    render(<LitterBoxForm hid="hh-1" uid="user-1" litters={[clumping, archived, silica]} />)

    const select = screen.getByLabelText('Litter')
    expect(select).toHaveValue('litter-c')
    expect(Array.from(select.querySelectorAll('option')).map((o) => o.textContent)).toEqual([
      'Clumping',
      'Silica',
    ])

    await user.type(screen.getByTestId('litter-location'), 'Hall')
    await user.selectOptions(select, 'litter-s')
    await user.click(screen.getByTestId('litter-save'))
    expect(addLitterBoxMock.mock.calls[0]?.[2]?.litterId).toBe('litter-s')
  })

  it('with no kinds, says where to add one and saves the box with none', async () => {
    render(<LitterBoxForm hid="hh-1" uid="user-1" litters={[archived]} />)

    expect(screen.queryByLabelText('Litter')).not.toBeInTheDocument()
    expect(screen.getByText('Add a litter on Supplies to count its bags.')).toBeInTheDocument()

    const user = userEvent.setup()
    await user.type(screen.getByTestId('litter-location'), 'Hall')
    await user.click(screen.getByTestId('litter-save'))
    expect(addLitterBoxMock.mock.calls[0]?.[2]?.litterId).toBeNull()
  })

  it('keeps an edited box on its own kind, even an archived one', async () => {
    const user = userEvent.setup()
    render(
      <LitterBoxForm
        hid="hh-1"
        uid="user-1"
        litters={[clumping, archived, silica]}
        existing={{ ...EXISTING, litterId: 'litter-old' }}
      />,
    )

    const select = screen.getByLabelText('Litter')
    expect(select).toHaveValue('litter-old')
    expect(Array.from(select.querySelectorAll('option')).map((o) => o.textContent)).toEqual([
      'Clumping',
      'Old pellets',
      'Silica',
    ])

    await user.click(screen.getByTestId('litter-save'))
    expect(updateLitterBoxMock.mock.calls[0]?.[2]?.litterId).toBe('litter-old')
  })

  it('moves an edited box to another kind', async () => {
    const user = userEvent.setup()
    render(
      <LitterBoxForm
        hid="hh-1"
        uid="user-1"
        litters={[clumping, silica]}
        existing={{ ...EXISTING, litterId: 'litter-c' }}
      />,
    )

    await user.selectOptions(screen.getByLabelText('Litter'), 'litter-s')
    await user.click(screen.getByTestId('litter-save'))
    expect(updateLitterBoxMock.mock.calls[0]?.[2]?.litterId).toBe('litter-s')
  })

  it('leaves an edited box on its kind when there are none to pick from', async () => {
    const user = userEvent.setup()
    render(<LitterBoxForm hid="hh-1" uid="user-1" litters={[]} existing={EXISTING} />)

    await user.click(screen.getByTestId('litter-save'))
    expect(updateLitterBoxMock.mock.calls[0]?.[2]?.litterId).toBe('default')
  })
})
