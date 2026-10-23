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
  createdBy: 'user-1',
  createdAt: new Date(2026, 8, 1),
}

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
    render(<LitterBoxForm hid="hh-1" uid="user-1" />)

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

    expect(await screen.findByDisplayValue('')).toBe(screen.getByTestId('litter-location'))
  })

  it('refuses a blank location', () => {
    const { container } = render(<LitterBoxForm hid="hh-1" uid="user-1" />)

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
    render(<LitterBoxForm hid="hh-1" uid="user-1" existing={EXISTING} onDone={onDone} />)

    await user.click(screen.getByTestId('litter-save'))

    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('edits an existing box: pre-filled, and updates rather than adds', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    render(<LitterBoxForm hid="hh-1" uid="user-1" existing={EXISTING} onDone={onDone} />)

    expect(screen.getByTestId('litter-location')).toHaveValue('Bathroom')
    expect(screen.getByTestId('litter-date')).toHaveValue('2026-09-01')

    setDate('2026-09-10')
    await user.click(screen.getByTestId('litter-save'))

    expect(addLitterBoxMock).not.toHaveBeenCalled()
    const [hid, boxId, patch] = updateLitterBoxMock.mock.calls[0] ?? []
    expect(hid).toBe('hh-1')
    expect(boxId).toBe('box-1')
    expectLocalDate(patch?.lastChangedAt, 2026, 8, 10)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('deletes only after confirmation', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    const confirm = vi.spyOn(window, 'confirm')
    render(<LitterBoxForm hid="hh-1" uid="user-1" existing={EXISTING} onDone={onDone} />)

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
    render(<LitterBoxForm hid="hh-1" uid="user-1" />)

    expect(screen.queryByRole('button', { name: 'Delete litter box' })).not.toBeInTheDocument()
  })
})
