import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LogMealForm } from '../../src/components/LogMealForm'
import { addFeeding, awaitOrQueued, type Food } from '../../src/lib/db'
import { makeFood } from './fixtures'

vi.mock('../../src/lib/db', () => ({
  addFeeding: vi.fn(),
  awaitOrQueued: vi.fn(),
}))

const addFeedingMock = vi.mocked(addFeeding)
const awaitOrQueuedMock = vi.mocked(awaitOrQueued)

// kcalPerGram values chosen to be exact binary floats so kcal math is stable.
const kibble = makeFood({ id: 'food-1', name: 'Crunchy Kibble', kcalPerGram: 3.5 })
const wetTuna = makeFood({ id: 'food-2', name: 'Wet Tuna', type: 'wet', kcalPerGram: 0.75 })

function renderForm(foods: Food[] = [kibble, wetTuna]) {
  return render(<LogMealForm hid="hh-1" catId="cat-9" uid="user-1" foods={foods} />)
}

function firstFeedingCall() {
  const [call] = addFeedingMock.mock.calls
  if (call === undefined) throw new Error('addFeeding was not called')
  return call
}

function setTime(value: string): void {
  // userEvent cannot type into <input type="time">.
  fireEvent.change(screen.getByTestId('meal-time'), { target: { value } })
}

beforeEach(() => {
  addFeedingMock.mockReset().mockResolvedValue(undefined)
  awaitOrQueuedMock.mockReset().mockResolvedValue('confirmed')
})

describe('LogMealForm', () => {
  it('renders an option per food and selects the first food by default', () => {
    renderForm()

    const select = screen.getByTestId('meal-food-select')
    const options = within(select).getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual(['Crunchy Kibble', 'Wet Tuna'])
    expect(select).toHaveValue('food-1')
  })

  it('defaults the time field to the current time', () => {
    renderForm()

    const now = new Date()
    const expected = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    expect(screen.getByTestId('meal-time')).toHaveValue(expected)
  })

  it('no longer offers meal-type chips', () => {
    renderForm()

    expect(screen.queryByRole('button', { name: 'Breakfast' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Snack' })).not.toBeInTheDocument()
  })

  it('updates the live kcal preview as grams are typed and food changes', async () => {
    const user = userEvent.setup()
    renderForm()

    const preview = screen.getByTestId('meal-kcal-preview')
    expect(preview).toHaveTextContent('— kcal')

    await user.type(screen.getByTestId('meal-grams'), '50')
    // 50 g × 3.5 kcal/g = 175
    expect(preview).toHaveTextContent('≈ 175 kcal')

    await user.selectOptions(screen.getByTestId('meal-food-select'), 'food-2')
    // 50 g × 0.75 kcal/g = 37.5, rounded to 38
    expect(preview).toHaveTextContent('≈ 38 kcal')

    await user.clear(screen.getByTestId('meal-grams'))
    expect(preview).toHaveTextContent('— kcal')
  })

  it('reads a comma decimal from the iOS keypad', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByTestId('meal-grams'), '12,5')
    expect(screen.getByTestId('meal-kcal-preview')).toHaveTextContent('≈ 44 kcal')

    await user.click(screen.getByTestId('meal-save'))
    await screen.findByRole('status')

    const [, , , input] = firstFeedingCall()
    expect(input.amountG).toBe(12.5)
  })

  it('submits a minimal meal with a null note and the chosen time, then resets grams', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByTestId('meal-grams'), '50')
    setTime('07:30')
    await user.click(screen.getByTestId('meal-save'))

    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('Logged!')

    expect(addFeedingMock).toHaveBeenCalledTimes(1)
    expect(awaitOrQueuedMock).toHaveBeenCalledTimes(1)
    const [hid, catId, uid, input] = firstFeedingCall()
    expect(hid).toBe('hh-1')
    expect(catId).toBe('cat-9')
    expect(uid).toBe('user-1')
    expect(input.foodId).toBe('food-1')
    expect(input.foodNameSnapshot).toBe('Crunchy Kibble')
    expect(input.amountG).toBe(50)
    expect(input.kcal).toBe(175)
    expect(input.note).toBeNull()
    // The typed time lands on today's date.
    expect(input.datetime.getHours()).toBe(7)
    expect(input.datetime.getMinutes()).toBe(30)
    expect(input.datetime.toDateString()).toBe(new Date().toDateString())

    expect(screen.getByTestId('meal-grams')).toHaveValue('')
  })

  it('submits a trimmed note and resets it', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.selectOptions(screen.getByTestId('meal-food-select'), 'food-2')
    await user.type(screen.getByTestId('meal-grams'), '10')
    await user.type(screen.getByLabelText('Note (optional)'), '  yum  ')

    await user.click(screen.getByTestId('meal-save'))
    await screen.findByRole('status')

    const [, , , input] = firstFeedingCall()
    expect(input.foodId).toBe('food-2')
    expect(input.foodNameSnapshot).toBe('Wet Tuna')
    expect(input.amountG).toBe(10)
    expect(input.kcal).toBe(7.5)
    expect(input.note).toBe('yum')

    expect(screen.getByLabelText('Note (optional)')).toHaveValue('')
  })

  it('blocks submit with a message when grams is empty', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByTestId('meal-save'))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Amount must be between 1 and 500 grams.')
    expect(addFeedingMock).not.toHaveBeenCalled()
    expect(awaitOrQueuedMock).not.toHaveBeenCalled()
  })

  it.each(['0', '501', 'lots'])('blocks submit with a message when grams is %s', async (grams) => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByTestId('meal-grams'), grams)
    expect(screen.getByTestId('meal-kcal-preview')).toHaveTextContent('— kcal')
    await user.click(screen.getByTestId('meal-save'))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Amount must be between 1 and 500 grams.')
    expect(addFeedingMock).not.toHaveBeenCalled()
    expect(awaitOrQueuedMock).not.toHaveBeenCalled()
  })

  it('blocks submit when the time was cleared', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByTestId('meal-grams'), '50')
    setTime('')
    await user.click(screen.getByTestId('meal-save'))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Pick a valid time.')
    expect(addFeedingMock).not.toHaveBeenCalled()
  })

  it('blocks a meal over 2000 kcal', async () => {
    const user = userEvent.setup()
    renderForm([makeFood({ id: 'food-3', name: 'Dense Paste', kcalPerGram: 4.5 })])

    await user.type(screen.getByTestId('meal-grams'), '500')
    await user.click(screen.getByTestId('meal-save'))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/over 2000 kcal/i)
    expect(addFeedingMock).not.toHaveBeenCalled()
  })

  it('asks to pick a food when there are no foods', async () => {
    const user = userEvent.setup()
    renderForm([])

    await user.click(screen.getByTestId('meal-save'))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Pick a food first.')
    expect(addFeedingMock).not.toHaveBeenCalled()
  })

  it('shows an alert and re-enables the button when the save rejects', async () => {
    awaitOrQueuedMock.mockRejectedValueOnce(new Error('The litter gods say no'))
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByTestId('meal-grams'), '50')
    await user.click(screen.getByTestId('meal-save'))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('The litter gods say no')
    expect(screen.getByTestId('meal-save')).toBeEnabled()
    // The form keeps the typed grams so the user can retry.
    expect(screen.getByTestId('meal-grams')).toHaveValue('50')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
