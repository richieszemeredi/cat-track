import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PlanForm } from '../../src/components/PlanForm'
import { awaitOrQueued, savePlan, type Food, type Plan, type PlanItem } from '../../src/lib/db'
import { expectLocalDate, makeFood, makePlan, makePlanItem } from './fixtures'

vi.mock('../../src/lib/db', () => ({
  savePlan: vi.fn(),
  awaitOrQueued: vi.fn(),
}))

const savePlanMock = vi.mocked(savePlan)
const awaitOrQueuedMock = vi.mocked(awaitOrQueued)

// kcalPerGram values chosen to be exact binary floats so kcal math is stable.
const kibble = makeFood({ id: 'food-1', name: 'Crunchy Kibble', kcalPerGram: 3.5 })
const wetTuna = makeFood({ id: 'food-2', name: 'Wet Tuna', type: 'wet', kcalPerGram: 0.75 })

const onDone = vi.fn()

function renderForm(
  options: {
    foods?: Food[]
    currentPlan?: Plan | null
    currentItems?: PlanItem[]
    targetKcal?: number | null
    latestWeightKg?: number | null
  } = {},
) {
  return render(
    <PlanForm
      hid="hh-1"
      catId="cat-9"
      uid="user-1"
      foods={options.foods ?? [kibble, wetTuna]}
      currentPlan={options.currentPlan ?? null}
      currentItems={options.currentItems ?? []}
      latestWeightKg={options.latestWeightKg ?? 1.94}
      targetKcal={options.targetKcal ?? 1000}
      onDone={onDone}
    />,
  )
}

/** The (input, items) pair the form handed to savePlan. */
function savedPlan() {
  const [call] = savePlanMock.mock.calls
  if (call === undefined) throw new Error('savePlan was not called')
  return { input: call[3], items: call[4] }
}

function setTime(testId: string, value: string): void {
  // userEvent cannot type into <input type="time"> or type="date".
  fireEvent.change(screen.getByTestId(testId), { target: { value } })
}

beforeEach(() => {
  savePlanMock.mockReset().mockResolvedValue(undefined)
  awaitOrQueuedMock.mockReset().mockResolvedValue('confirmed')
  onDone.mockReset()
})

describe('PlanForm', () => {
  it('defaults to three meals spread across the day', () => {
    renderForm()

    expect(screen.getByTestId('plan-meals-3')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('plan-first-time')).toHaveValue('07:00')
    expect(screen.getByTestId('plan-last-time')).toHaveValue('19:00')
  })

  // The clock times are derived, never typed — this is the whole point of
  // storing a count and a window instead of a list of meals.
  it('derives the meal times from the count and the window', async () => {
    const user = userEvent.setup()
    renderForm()

    expect(screen.getByTestId('plan-times')).toHaveTextContent('6 h apart — 07:00 · 13:00 · 19:00')

    await user.click(screen.getByTestId('plan-meals-4'))
    expect(screen.getByTestId('plan-times')).toHaveTextContent(
      '4 h apart — 07:00 · 11:00 · 15:00 · 19:00',
    )

    // A window that does not divide evenly still lands the last meal on it.
    setTime('plan-last-time', '21:00')
    expect(screen.getByTestId('plan-times')).toHaveTextContent(
      '4 h 40 apart — 07:00 · 11:40 · 16:20 · 21:00',
    )
  })

  it('shows a single meal at the start of the window', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByTestId('plan-meals-1'))
    expect(screen.getByTestId('plan-times')).toHaveTextContent('07:00')
  })

  it('totals the day and shows the derived serving', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByTestId('plan-item-grams-0'), '300')

    expect(screen.getByTestId('plan-daily-kcal')).toHaveTextContent('1050')
    expect(screen.getByTestId('plan-per-meal')).toHaveTextContent('Each meal: 100 g Crunchy Kibble')
    expect(screen.getByTestId('plan-target-ratio')).toHaveTextContent(
      '105% of her 1000 kcal target',
    )
  })

  // iOS offers a comma on the decimal keypad.
  it('accepts a comma decimal', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByTestId('plan-item-grams-0'), '22,5')
    await user.click(screen.getByTestId('plan-save'))

    expect(savedPlan().items[0]?.amountPerDayG).toBe(22.5)
  })

  it('saves the plan and its items', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByTestId('plan-item-grams-0'), '300')
    await user.click(screen.getByTestId('plan-save'))

    const { input, items } = savedPlan()
    expect(input.mealsPerDay).toBe(3)
    expect(input.firstMealAt).toBe('07:00')
    expect(input.lastMealAt).toBe('19:00')
    expect(input.setAtWeightKg).toBe(1.94)
    expect(input.transition).toBeNull()
    expect(items).toEqual([
      { foodId: 'food-1', foodNameSnapshot: 'Crunchy Kibble', amountPerDayG: 300 },
    ])
    expect(onDone).toHaveBeenCalled()
  })

  it('starts the plan at local midnight today', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByTestId('plan-item-grams-0'), '300')
    await user.click(screen.getByTestId('plan-save'))

    const today = new Date()
    expectLocalDate(
      savedPlan().input.effectiveFrom,
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    )
  })

  it('can be backdated', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByTestId('plan-item-grams-0'), '300')
    setTime('plan-starts', '2026-08-20')
    await user.click(screen.getByTestId('plan-save'))

    expectLocalDate(savedPlan().input.effectiveFrom, 2026, 7, 20)
  })

  it('carries several foods, which is what a mixed bowl is', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByTestId('plan-item-grams-0'), '180')
    await user.click(screen.getByTestId('plan-add-food'))
    await user.selectOptions(screen.getByTestId('plan-item-food-1'), 'food-2')
    await user.type(screen.getByTestId('plan-item-grams-1'), '120')

    expect(screen.getByTestId('plan-per-meal')).toHaveTextContent(
      'Each meal: 60 g Crunchy Kibble + 40 g Wet Tuna',
    )

    await user.click(screen.getByTestId('plan-save'))
    expect(savedPlan().items).toHaveLength(2)
  })

  it('removes a food row', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByTestId('plan-item-grams-0'), '180')
    await user.click(screen.getByTestId('plan-add-food'))
    await user.click(screen.getByTestId('plan-item-remove-1'))

    expect(screen.queryByTestId('plan-item-food-1')).not.toBeInTheDocument()
  })

  it('needs at least one food with an amount', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByTestId('plan-save'))

    expect(screen.getByRole('alert')).toHaveTextContent('Add at least one food with an amount.')
    expect(savePlanMock).not.toHaveBeenCalled()
  })

  it('refuses the same food twice — the amounts should be combined', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByTestId('plan-item-grams-0'), '180')
    await user.click(screen.getByTestId('plan-add-food'))
    await user.selectOptions(screen.getByTestId('plan-item-food-1'), 'food-1')
    await user.type(screen.getByTestId('plan-item-grams-1'), '120')
    await user.click(screen.getByTestId('plan-save'))

    expect(screen.getByRole('alert')).toHaveTextContent('Each food can only appear once')
    expect(savePlanMock).not.toHaveBeenCalled()
  })

  it('prefills from the plan in force, because the usual edit is "+5 g"', () => {
    renderForm({
      currentPlan: makePlan({ mealsPerDay: 4, firstMealAt: '06:30', lastMealAt: '20:30' }),
      currentItems: [makePlanItem({ amountPerDayG: 280 })],
    })

    expect(screen.getByTestId('plan-meals-4')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('plan-first-time')).toHaveValue('06:30')
    expect(screen.getByTestId('plan-item-grams-0')).toHaveValue('280')
  })

  it('surfaces a rejected save', async () => {
    const user = userEvent.setup()
    awaitOrQueuedMock.mockRejectedValue(new Error('Missing or insufficient permissions.'))
    renderForm()

    await user.type(screen.getByTestId('plan-item-grams-0'), '300')
    await user.click(screen.getByTestId('plan-save'))

    expect(screen.getByRole('alert')).toHaveTextContent('Missing or insufficient permissions.')
    expect(onDone).not.toHaveBeenCalled()
  })

  describe('switching food', () => {
    it('stays hidden until she is actually coming off something', () => {
      renderForm()
      expect(screen.queryByTestId('plan-switch-from')).not.toBeInTheDocument()
    })

    it('previews the whole ramp', async () => {
      const user = userEvent.setup()
      renderForm()

      await user.click(screen.getByTestId('plan-switch-toggle'))
      expect(screen.getByTestId('plan-switch-preview')).toHaveTextContent(
        '25% · 50% · 75% · 100% new food',
      )
    })

    it('describes a same-day switch in meals', async () => {
      const user = userEvent.setup()
      renderForm()

      await user.click(screen.getByTestId('plan-switch-toggle'))
      await user.clear(screen.getByTestId('plan-switch-steps'))
      await user.type(screen.getByTestId('plan-switch-steps'), '2')
      await user.selectOptions(screen.getByTestId('plan-switch-unit'), 'meal')

      expect(screen.getByTestId('plan-switch-preview')).toHaveTextContent('50% · 100% new food')
    })

    it('saves the switch as one declaration, not four plans', async () => {
      const user = userEvent.setup()
      renderForm()

      await user.type(screen.getByTestId('plan-item-grams-0'), '300')
      await user.click(screen.getByTestId('plan-switch-toggle'))
      await user.selectOptions(screen.getByTestId('plan-switch-from'), 'food-2')
      await user.click(screen.getByTestId('plan-save'))

      const { input } = savedPlan()
      expect(input.transition).toMatchObject({
        fromFoodId: 'food-2',
        fromFoodNameSnapshot: 'Wet Tuna',
        toFoodId: 'food-1',
        steps: 4,
        unit: 'day',
      })
      // The ramp starts when the plan does — no second date to keep in sync.
      expect(input.transition?.startedOn).toEqual(input.effectiveFrom)
    })

    it('will not save a switch with no food to switch from', async () => {
      const user = userEvent.setup()
      renderForm()

      await user.type(screen.getByTestId('plan-item-grams-0'), '300')
      await user.click(screen.getByTestId('plan-switch-toggle'))
      await user.click(screen.getByTestId('plan-save'))

      expect(screen.getByRole('alert')).toHaveTextContent('Pick the food she is switching from')
      expect(savePlanMock).not.toHaveBeenCalled()
    })

    it('rejects a step count outside the allowed range', async () => {
      const user = userEvent.setup()
      renderForm()

      await user.type(screen.getByTestId('plan-item-grams-0'), '300')
      await user.click(screen.getByTestId('plan-switch-toggle'))
      await user.selectOptions(screen.getByTestId('plan-switch-from'), 'food-2')
      await user.clear(screen.getByTestId('plan-switch-steps'))
      await user.type(screen.getByTestId('plan-switch-steps'), '20')
      await user.click(screen.getByTestId('plan-save'))

      expect(screen.getByRole('alert')).toHaveTextContent('A switch runs over 1 to 14 steps')
      expect(savePlanMock).not.toHaveBeenCalled()
    })
  })
})
