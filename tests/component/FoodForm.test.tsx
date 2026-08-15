import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FoodForm } from '../../src/components/FoodForm'
import { addFood, awaitOrQueued, updateFood, type Food } from '../../src/lib/db'
import { makeFood } from './fixtures'

vi.mock('../../src/lib/db', () => ({
  addFood: vi.fn(),
  updateFood: vi.fn(),
  awaitOrQueued: vi.fn(),
}))

const addFoodMock = vi.mocked(addFood)
const updateFoodMock = vi.mocked(updateFood)
const awaitOrQueuedMock = vi.mocked(awaitOrQueued)

function renderForm(props: { existing?: Food; onDone?: () => void } = {}) {
  const onDone = props.onDone ?? vi.fn()
  const result = props.existing
    ? render(
        <FoodForm
          hid="hh-1"
          catId="cat-9"
          uid="user-1"
          existing={props.existing}
          onDone={onDone}
        />,
      )
    : render(<FoodForm hid="hh-1" catId="cat-9" uid="user-1" onDone={onDone} />)
  return { ...result, onDone }
}

function firstAddFoodCall() {
  const [call] = addFoodMock.mock.calls
  if (call === undefined) throw new Error('addFood was not called')
  return call
}

function firstUpdateFoodCall() {
  const [call] = updateFoodMock.mock.calls
  if (call === undefined) throw new Error('updateFood was not called')
  return call
}

beforeEach(() => {
  addFoodMock.mockReset().mockResolvedValue(undefined)
  updateFoodMock.mockReset().mockResolvedValue(undefined)
  awaitOrQueuedMock.mockReset().mockResolvedValue('confirmed')
})

describe('FoodForm', () => {
  it('creates a food with the typed values and calls onDone', async () => {
    const user = userEvent.setup()
    const { onDone } = renderForm()

    await user.type(screen.getByTestId('food-name'), 'Tuna Feast')
    await user.type(screen.getByLabelText('Brand (optional)'), '  Purina  ')
    await user.selectOptions(screen.getByTestId('food-type'), 'wet')
    await user.type(screen.getByTestId('food-kcal-per-gram'), '1.25')
    await user.click(screen.getByTestId('food-save'))

    await waitFor(() => {
      expect(onDone).toHaveBeenCalledTimes(1)
    })

    expect(addFoodMock).toHaveBeenCalledTimes(1)
    expect(updateFoodMock).not.toHaveBeenCalled()
    const [hid, catId, uid, input] = firstAddFoodCall()
    expect(hid).toBe('hh-1')
    expect(catId).toBe('cat-9')
    expect(uid).toBe('user-1')
    // FoodInput shape only — archived defaulting lives inside db.addFood.
    expect(input).toEqual({
      name: 'Tuna Feast',
      brand: 'Purina',
      type: 'wet',
      kcalPerGram: 1.25,
    })
  })

  it('reads a comma decimal from the iOS keypad', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByTestId('food-name'), 'Comma Chow')
    await user.type(screen.getByTestId('food-kcal-per-gram'), '3,87')
    expect(screen.getByText('≈ 387 kcal per 100 g')).toBeInTheDocument()
    await user.click(screen.getByTestId('food-save'))

    await waitFor(() => {
      expect(addFoodMock).toHaveBeenCalledTimes(1)
    })
    const [, , , input] = firstAddFoodCall()
    expect(input.kcalPerGram).toBe(3.87)
  })

  it('no longer asks for a package size', () => {
    renderForm()

    expect(screen.queryByLabelText(/package size/i)).not.toBeInTheDocument()
  })

  it('sends a null brand when left empty', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByTestId('food-name'), 'Plain Kibble')
    await user.type(screen.getByTestId('food-kcal-per-gram'), '3.5')
    await user.click(screen.getByTestId('food-save'))

    await waitFor(() => {
      expect(addFoodMock).toHaveBeenCalledTimes(1)
    })
    const [, , , input] = firstAddFoodCall()
    expect(input.brand).toBeNull()
    expect(input.type).toBe('dry')
  })

  it('echoes kcal per 100 g as kcalPerGram is typed, hiding it when invalid', async () => {
    const user = userEvent.setup()
    renderForm()

    const kcalInput = screen.getByTestId('food-kcal-per-gram')
    expect(screen.queryByText(/kcal per 100 g$/)).not.toBeInTheDocument()

    await user.type(kcalInput, '3.87')
    expect(screen.getByText('≈ 387 kcal per 100 g')).toBeInTheDocument()

    await user.clear(kcalInput)
    expect(screen.queryByText(/kcal per 100 g$/)).not.toBeInTheDocument()

    await user.type(kcalInput, '12')
    expect(screen.queryByText(/kcal per 100 g$/)).not.toBeInTheDocument()
  })

  it('requires a name', async () => {
    const user = userEvent.setup()
    const { onDone } = renderForm()

    await user.type(screen.getByTestId('food-kcal-per-gram'), '3.5')
    await user.click(screen.getByTestId('food-save'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Give the food a name.')
    expect(addFoodMock).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('rejects an out-of-range kcal per gram', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByTestId('food-name'), 'Rocket Fuel')
    await user.type(screen.getByTestId('food-kcal-per-gram'), '12')
    await user.click(screen.getByTestId('food-save'))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'kcal per gram must be between 0.01 and 10.',
    )
    expect(addFoodMock).not.toHaveBeenCalled()
  })

  it('prefills from the existing food and updates it in edit mode', async () => {
    const user = userEvent.setup()
    const existing = makeFood({
      id: 'food-7',
      name: 'Old Kibble',
      brand: 'Acme',
      type: 'dry',
      kcalPerGram: 3.5,
    })
    const { onDone } = renderForm({ existing })

    expect(screen.getByTestId('food-name')).toHaveValue('Old Kibble')
    expect(screen.getByLabelText('Brand (optional)')).toHaveValue('Acme')
    expect(screen.getByTestId('food-type')).toHaveValue('dry')
    expect(screen.getByTestId('food-kcal-per-gram')).toHaveValue('3.5')

    const kcalInput = screen.getByTestId('food-kcal-per-gram')
    await user.clear(kcalInput)
    await user.type(kcalInput, '4.1')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => {
      expect(onDone).toHaveBeenCalledTimes(1)
    })

    expect(addFoodMock).not.toHaveBeenCalled()
    const [hid, catId, foodId, patch] = firstUpdateFoodCall()
    expect(hid).toBe('hh-1')
    expect(catId).toBe('cat-9')
    expect(foodId).toBe('food-7')
    expect(patch).toEqual({
      name: 'Old Kibble',
      brand: 'Acme',
      type: 'dry',
      kcalPerGram: 4.1,
    })
  })

  it('shows an alert and does not call onDone when the save rejects', async () => {
    awaitOrQueuedMock.mockRejectedValueOnce(new Error('bowl unreachable'))
    const user = userEvent.setup()
    const { onDone } = renderForm()

    await user.type(screen.getByTestId('food-name'), 'Tuna Feast')
    await user.type(screen.getByTestId('food-kcal-per-gram'), '1.25')
    await user.click(screen.getByTestId('food-save'))

    expect(await screen.findByRole('alert')).toHaveTextContent('bowl unreachable')
    expect(onDone).not.toHaveBeenCalled()
    expect(screen.getByTestId('food-save')).toBeEnabled()
  })

  it('calls onDone without saving when Cancel is clicked', async () => {
    const user = userEvent.setup()
    const { onDone } = renderForm()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onDone).toHaveBeenCalledTimes(1)
    expect(addFoodMock).not.toHaveBeenCalled()
    expect(updateFoodMock).not.toHaveBeenCalled()
  })
})
