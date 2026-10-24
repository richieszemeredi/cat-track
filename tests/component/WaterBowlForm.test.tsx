import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WaterBowlForm } from '../../src/components/WaterBowlForm'
import {
  addWaterBowl,
  awaitOrQueued,
  deleteWaterBowl,
  updateWaterBowl,
  type WaterBowl,
} from '../../src/lib/db'

vi.mock('../../src/lib/db', () => ({
  addWaterBowl: vi.fn(),
  updateWaterBowl: vi.fn(),
  deleteWaterBowl: vi.fn(),
  awaitOrQueued: vi.fn(),
}))

const addWaterBowlMock = vi.mocked(addWaterBowl)
const updateWaterBowlMock = vi.mocked(updateWaterBowl)
const deleteWaterBowlMock = vi.mocked(deleteWaterBowl)
const awaitOrQueuedMock = vi.mocked(awaitOrQueued)

const EXISTING: WaterBowl = {
  id: 'bowl-1',
  location: 'Kitchen',
  lastChangedAt: new Date(2026, 8, 1, 8, 30),
  createdBy: 'user-1',
  createdAt: new Date(2026, 8, 1),
}

function setWhen(date: string, time: string): void {
  // userEvent cannot type into date/time inputs; change events are how the
  // pickers report values anyway.
  fireEvent.change(screen.getByLabelText('Water last replaced'), { target: { value: date } })
  fireEvent.change(screen.getByLabelText('At'), { target: { value: time } })
}

beforeEach(() => {
  addWaterBowlMock.mockReset().mockResolvedValue(undefined)
  updateWaterBowlMock.mockReset().mockResolvedValue(undefined)
  deleteWaterBowlMock.mockReset().mockResolvedValue(undefined)
  awaitOrQueuedMock.mockReset().mockResolvedValue('confirmed')
})

describe('WaterBowlForm', () => {
  it('adds a bowl with a trimmed location, changed just now, then resets', async () => {
    const user = userEvent.setup()
    const before = Date.now()
    render(<WaterBowlForm hid="hh-1" uid="user-1" />)

    await user.type(screen.getByTestId('water-location'), '  Hallway  ')
    await user.click(screen.getByTestId('water-save'))

    const [hid, uid, input] = addWaterBowlMock.mock.calls[0] ?? []
    expect(hid).toBe('hh-1')
    expect(uid).toBe('user-1')
    expect(input?.location).toBe('Hallway')
    expect(input?.lastChangedAt.getTime()).toBeGreaterThanOrEqual(before)

    expect(await screen.findByDisplayValue('')).toBe(screen.getByTestId('water-location'))
  })

  it('refuses a blank location', () => {
    const { container } = render(<WaterBowlForm hid="hh-1" uid="user-1" />)

    const form = container.querySelector('form')
    if (form === null) throw new Error('form not rendered')
    fireEvent.submit(form)

    expect(screen.getByRole('alert')).toHaveTextContent('Say where this bowl lives.')
    expect(addWaterBowlMock).not.toHaveBeenCalled()
  })

  it('treats a queued (offline) write as success', async () => {
    awaitOrQueuedMock.mockResolvedValue('queued')
    const user = userEvent.setup()
    const onDone = vi.fn()
    render(<WaterBowlForm hid="hh-1" uid="user-1" existing={EXISTING} onDone={onDone} />)

    await user.click(screen.getByTestId('water-save'))

    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('renames an existing bowl without touching its water time', async () => {
    const user = userEvent.setup()
    render(<WaterBowlForm hid="hh-1" uid="user-1" existing={EXISTING} />)

    expect(screen.getByTestId('water-location')).toHaveValue('Kitchen')
    await user.clear(screen.getByTestId('water-location'))
    await user.type(screen.getByTestId('water-location'), 'Pantry')
    await user.click(screen.getByTestId('water-save'))

    expect(addWaterBowlMock).not.toHaveBeenCalled()
    expect(updateWaterBowlMock).toHaveBeenCalledWith('hh-1', 'bowl-1', { location: 'Pantry' })
  })

  it('deletes only after confirmation', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm')
    render(<WaterBowlForm hid="hh-1" uid="user-1" existing={EXISTING} />)

    confirm.mockReturnValueOnce(false)
    await user.click(screen.getByRole('button', { name: 'Delete water bowl' }))
    expect(deleteWaterBowlMock).not.toHaveBeenCalled()

    confirm.mockReturnValueOnce(true)
    await user.click(screen.getByRole('button', { name: 'Delete water bowl' }))
    expect(deleteWaterBowlMock).toHaveBeenCalledWith('hh-1', 'bowl-1')
    confirm.mockRestore()
  })

  it('offers no delete while adding', () => {
    render(<WaterBowlForm hid="hh-1" uid="user-1" />)

    expect(screen.queryByRole('button', { name: 'Delete water bowl' })).not.toBeInTheDocument()
  })

  it('saves a backdated time as LOCAL time when the fields were edited', async () => {
    const user = userEvent.setup()
    render(<WaterBowlForm hid="hh-1" uid="user-1" existing={EXISTING} />)

    expect(screen.getByLabelText('Water last replaced')).toHaveValue('2026-09-01')
    expect(screen.getByLabelText('At')).toHaveValue('08:30')

    setWhen('2026-09-02', '07:15')
    await user.click(screen.getByTestId('water-save'))

    const patch = updateWaterBowlMock.mock.calls[0]?.[2]
    const at = patch?.lastChangedAt
    expect(at?.getTime()).toBe(new Date(2026, 8, 2, 7, 15).getTime())
  })

  it('backdates a new bowl too, and refuses a time in the future', async () => {
    const user = userEvent.setup()
    render(<WaterBowlForm hid="hh-1" uid="user-1" />)
    await user.type(screen.getByTestId('water-location'), 'Kitchen')

    setWhen('2999-01-01', '07:00')
    await user.click(screen.getByTestId('water-save'))
    expect(screen.getByRole('alert')).toHaveTextContent("That time hasn't happened yet.")
    expect(addWaterBowlMock).not.toHaveBeenCalled()

    setWhen('2026-01-05', '06:45')
    await user.click(screen.getByTestId('water-save'))
    const input = addWaterBowlMock.mock.calls[0]?.[2]
    expect(input?.lastChangedAt.getTime()).toBe(new Date(2026, 0, 5, 6, 45).getTime())
  })
})
