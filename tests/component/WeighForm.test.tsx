import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WeighForm } from '../../src/components/WeighForm'
import { addWeightEntry, awaitOrQueued } from '../../src/lib/db'
import { expectLocalDate } from './fixtures'

vi.mock('../../src/lib/db', () => ({
  addWeightEntry: vi.fn(),
  awaitOrQueued: vi.fn(),
}))

const addWeightEntryMock = vi.mocked(addWeightEntry)
const awaitOrQueuedMock = vi.mocked(awaitOrQueued)

function renderForm() {
  return render(<WeighForm hid="hh-1" catId="cat-9" uid="user-1" />)
}

function firstWeightCall() {
  const [call] = addWeightEntryMock.mock.calls
  if (call === undefined) throw new Error('addWeightEntry was not called')
  return call
}

function getForm(container: HTMLElement): HTMLFormElement {
  const form = container.querySelector('form')
  if (form === null) throw new Error('form not rendered')
  return form
}

function setDate(value: string): void {
  // userEvent cannot type into <input type="date">; change events are how
  // date pickers report values anyway.
  fireEvent.change(screen.getByLabelText('Date'), { target: { value } })
}

beforeEach(() => {
  addWeightEntryMock.mockReset().mockResolvedValue(undefined)
  awaitOrQueuedMock.mockReset().mockResolvedValue('confirmed')
})

describe('WeighForm', () => {
  it('saves a weigh-in with parsed kg, local date and note, then resets', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByTestId('weight-kg'), '4.25')
    setDate('2026-02-14')
    await user.type(screen.getByLabelText('Note (optional)'), 'after breakfast')
    await user.click(screen.getByTestId('weight-save'))

    await screen.findByText(/saved!/i)

    expect(addWeightEntryMock).toHaveBeenCalledTimes(1)
    expect(awaitOrQueuedMock).toHaveBeenCalledTimes(1)
    const [hid, catId, uid, input] = firstWeightCall()
    expect(hid).toBe('hh-1')
    expect(catId).toBe('cat-9')
    expect(uid).toBe('user-1')
    expect(input.weightKg).toBe(4.25)
    expect(input.note).toBe('after breakfast')
    // Must be the LOCAL Feb 14, not UTC midnight drifting a day.
    expectLocalDate(input.date, 2026, 1, 14)

    expect(screen.getByTestId('weight-kg')).toHaveValue('')
    expect(screen.getByLabelText('Note (optional)')).toHaveValue('')
  })

  // The whole reason the field is type="text": an <input type="number"> hands
  // back an empty string for "4,25", so the iOS keypad's comma silently ate
  // every decimal weight.
  it.each([
    ['4,25', 4.25],
    ['4.25', 4.25],
    [' 2,4 ', 2.4],
  ])('accepts %s as %s kg', async (typed, expected) => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByTestId('weight-kg'), typed)
    await user.click(screen.getByTestId('weight-save'))

    await screen.findByText(/saved!/i)
    const [, , , input] = firstWeightCall()
    expect(input.weightKg).toBe(expected)
  })

  it('sends a null note when left empty', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByTestId('weight-kg'), '3.75')
    setDate('2026-06-30')
    await user.click(screen.getByTestId('weight-save'))

    await screen.findByText(/saved!/i)

    const [, , , input] = firstWeightCall()
    expect(input.weightKg).toBe(3.75)
    expect(input.note).toBeNull()
    expectLocalDate(input.date, 2026, 5, 30)
  })

  it('no longer offers a body condition score', () => {
    renderForm()

    expect(screen.queryByLabelText(/body condition/i)).not.toBeInTheDocument()
  })

  it.each(['45', '0.01', 'heavy', '1,2,3'])('blocks an invalid weight of %s', (weight) => {
    const { container } = renderForm()

    fireEvent.change(screen.getByTestId('weight-kg'), { target: { value: weight } })
    // fireEvent.submit exercises the component's own guard: jsdom's native
    // constraint validation would otherwise swallow the click entirely.
    fireEvent.submit(getForm(container))

    expect(screen.getByRole('alert')).toHaveTextContent('Weight must be between 0.05 and 30 kg.')
    expect(addWeightEntryMock).not.toHaveBeenCalled()
    expect(awaitOrQueuedMock).not.toHaveBeenCalled()
  })

  it('blocks submit when the weight is empty', () => {
    const { container } = renderForm()

    fireEvent.submit(getForm(container))

    expect(screen.getByRole('alert')).toHaveTextContent('Weight must be between 0.05 and 30 kg.')
    expect(addWeightEntryMock).not.toHaveBeenCalled()
  })

  it('shows an alert and keeps the value when the save rejects', async () => {
    awaitOrQueuedMock.mockRejectedValueOnce(new Error('paws offline'))
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByTestId('weight-kg'), '4.2')
    await user.click(screen.getByTestId('weight-save'))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('paws offline')
    expect(screen.queryByText(/saved!/i)).not.toBeInTheDocument()
    expect(screen.getByTestId('weight-save')).toBeEnabled()
    expect(screen.getByTestId('weight-kg')).toHaveValue('4.2')
  })
})
