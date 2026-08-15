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
      analysis: null,
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
      analysis: null,
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

  // Hungarian tins state constituents and a gram-per-day table, never kcal.
  describe('label calculator', () => {
    // Premiere Meat Menu Kitten: 11 / 5,5 / 2,2 / 0,2 / 78 -> 96 kcal per 100 g.
    async function fillPremiereLabel(user: ReturnType<typeof userEvent.setup>) {
      await user.type(screen.getByTestId('food-analysis-protein'), '11')
      await user.type(screen.getByTestId('food-analysis-fat'), '5,5')
      await user.type(screen.getByTestId('food-analysis-ash'), '2,2')
      await user.type(screen.getByTestId('food-analysis-fibre'), '0,2')
      await user.type(screen.getByTestId('food-analysis-moisture'), '78')
    }

    it('derives kcal per gram from the constituents and saves them alongside it', async () => {
      const user = userEvent.setup()
      renderForm()

      await user.type(screen.getByTestId('food-name'), 'Premiere Kitten')
      await user.selectOptions(screen.getByTestId('food-type'), 'wet')
      await fillPremiereLabel(user)

      expect(screen.getByTestId('food-analysis-result')).toHaveTextContent(
        'Carbohydrate 3.1% · 96 kcal per 100 g',
      )
      await user.click(screen.getByTestId('food-analysis-apply'))
      expect(screen.getByTestId('food-kcal-per-gram')).toHaveValue('0.96')

      await user.click(screen.getByTestId('food-save'))
      await waitFor(() => {
        expect(addFoodMock).toHaveBeenCalledTimes(1)
      })
      const [, , , input] = firstAddFoodCall()
      expect(input.kcalPerGram).toBe(0.96)
      expect(input.analysis).toEqual({
        proteinPct: 11,
        fatPct: 5.5,
        ashPct: 2.2,
        fibrePct: 0.2,
        moisturePct: 78,
      })
    })

    it('substitutes a typical ash and fibre when the label omits them, and says so', async () => {
      const user = userEvent.setup()
      renderForm()

      await user.selectOptions(screen.getByTestId('food-type'), 'wet')
      await user.type(screen.getByTestId('food-analysis-protein'), '11')
      await user.type(screen.getByTestId('food-analysis-fat'), '5,5')
      await user.type(screen.getByTestId('food-analysis-moisture'), '78')

      expect(screen.getByText(/Assuming 2.5% ash and 0.5% fibre/)).toBeInTheDocument()
      // 100 - 11 - 5.5 - 2.5 - 0.5 - 78 = 2.5 NFE -> 38.5 + 46.75 + 8.75 = 94.
      expect(screen.getByTestId('food-analysis-result')).toHaveTextContent('94 kcal per 100 g')
    })

    it('waits for protein, fat and moisture before showing a figure', async () => {
      const user = userEvent.setup()
      renderForm()

      await user.type(screen.getByTestId('food-analysis-protein'), '11')
      expect(screen.queryByTestId('food-analysis-result')).not.toBeInTheDocument()
      expect(screen.queryByTestId('food-analysis-apply')).not.toBeInTheDocument()
    })

    // A wet label typed while Type still says Dry: the 7% ash / 2.5% fibre a dry
    // food assumes push the total past 100, but the user typed neither of them,
    // so blaming their figures would be wrong.
    it('blames the assumptions, not the typed figures, when the type is wrong', async () => {
      const user = userEvent.setup()
      renderForm()

      await user.type(screen.getByTestId('food-analysis-protein'), '11')
      await user.type(screen.getByTestId('food-analysis-fat'), '5,5')
      await user.type(screen.getByTestId('food-analysis-moisture'), '78')

      expect(screen.getByTestId('food-analysis-crowded')).toHaveTextContent('check the Type above')
      expect(screen.queryByText(/add up to more than 100%/)).not.toBeInTheDocument()
      // Still usable: carbohydrate clamps to zero rather than the form giving up.
      expect(screen.getByTestId('food-analysis-result')).toHaveTextContent('Carbohydrate 0.0%')
      expect(screen.getByTestId('food-analysis-apply')).toBeInTheDocument()

      // Switching to Wet uses the wet assumptions and the warning goes away.
      await user.selectOptions(screen.getByTestId('food-type'), 'wet')
      expect(screen.queryByTestId('food-analysis-crowded')).not.toBeInTheDocument()
      expect(screen.getByTestId('food-analysis-result')).toHaveTextContent('94 kcal per 100 g')
    })

    it('refuses constituents that add up past 100%', async () => {
      const user = userEvent.setup()
      renderForm()

      await user.type(screen.getByTestId('food-analysis-protein'), '40')
      await user.type(screen.getByTestId('food-analysis-fat'), '30')
      await user.type(screen.getByTestId('food-analysis-moisture'), '78')

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Those add up to more than 100% — check the figures.',
      )
      expect(screen.queryByTestId('food-analysis-apply')).not.toBeInTheDocument()
    })

    it('drops the stored constituents once kcal per gram is hand-edited', async () => {
      const user = userEvent.setup()
      renderForm()

      await user.type(screen.getByTestId('food-name'), 'Premiere Kitten')
      await user.selectOptions(screen.getByTestId('food-type'), 'wet')
      await fillPremiereLabel(user)
      await user.click(screen.getByTestId('food-analysis-apply'))

      // Overriding by hand means the constituents no longer explain the figure.
      const kcalInput = screen.getByTestId('food-kcal-per-gram')
      await user.clear(kcalInput)
      await user.type(kcalInput, '1,05')
      await user.click(screen.getByTestId('food-save'))

      await waitFor(() => {
        expect(addFoodMock).toHaveBeenCalledTimes(1)
      })
      const [, , , input] = firstAddFoodCall()
      expect(input.kcalPerGram).toBe(1.05)
      expect(input.analysis).toBeNull()
    })

    it('reopens prefilled from a food that was calculated from a label', async () => {
      const user = userEvent.setup()
      const existing = makeFood({
        id: 'food-8',
        name: 'Premiere Kitten',
        type: 'wet',
        kcalPerGram: 0.96,
        analysis: {
          proteinPct: 11,
          fatPct: 5.5,
          ashPct: 2.2,
          fibrePct: 0.2,
          moisturePct: 78,
        },
      })
      renderForm({ existing })

      expect(screen.getByTestId('food-analysis-protein')).toHaveValue('11')
      expect(screen.getByTestId('food-analysis-moisture')).toHaveValue('78')
      expect(screen.getByTestId('food-analysis-result')).toHaveTextContent('96 kcal per 100 g')

      // Tweak one constituent instead of retyping all five.
      const fat = screen.getByTestId('food-analysis-fat')
      await user.clear(fat)
      await user.type(fat, '6,5')
      await user.click(screen.getByTestId('food-analysis-apply'))
      await user.click(screen.getByRole('button', { name: /save changes/i }))

      await waitFor(() => {
        expect(updateFoodMock).toHaveBeenCalledTimes(1)
      })
      const [, , , patch] = firstUpdateFoodCall()
      // 2.1 NFE -> 38.5 + 55.25 + 7.35 = 101.1 -> 1.01 kcal/g.
      expect(patch.kcalPerGram).toBe(1.01)
      expect(patch.analysis).toEqual({
        proteinPct: 11,
        fatPct: 6.5,
        ashPct: 2.2,
        fibrePct: 0.2,
        moisturePct: 78,
      })
    })
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
