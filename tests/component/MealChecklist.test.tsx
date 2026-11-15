import { type UseQueryResult } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MealChecklist } from '../../src/components/MealChecklist'
import { useAuth } from '../../src/lib/auth'
import { addFeedings, awaitOrQueued, deleteFeedings, type Feeding } from '../../src/lib/db'
import { useHousehold } from '../../src/lib/household'
import { adjustedMealTimes, planMealTimes } from '../../src/lib/plan'
import { type CatDay } from '../../src/lib/use-cat-day'
import { makeCat, makeFood, makePlan, makePlanItem } from './fixtures'

vi.mock('../../src/lib/db', () => ({
  addFeedings: vi.fn(),
  awaitOrQueued: vi.fn(),
  deleteFeedings: vi.fn(),
  retimeFeedings: vi.fn(),
  setMealTimeOverride: vi.fn(),
}))
vi.mock('../../src/lib/household', () => ({ useHousehold: vi.fn() }))
vi.mock('../../src/lib/auth', () => ({ useAuth: vi.fn() }))

const addFeedingsMock = vi.mocked(addFeedings)
const deleteFeedingsMock = vi.mocked(deleteFeedings)
const awaitOrQueuedMock = vi.mocked(awaitOrQueued)

const CAT = makeCat()
const FOOD = makeFood({ id: 'food-1', name: 'Crunchy Kibble', kcalPerGram: 3.5 })
// 3 meals, 07:00 / 13:00 / 19:00, 300 g a day → 100 g (350 kcal) a bowl.
const PLAN = makePlan()
const ITEM = makePlanItem({ foodId: 'food-1', amountPerDayG: 300 })
const DAY_START = new Date(2026, 10, 15)

function feeding(overrides: Partial<Feeding>): Feeding {
  return {
    id: 'feeding-1',
    datetime: new Date(2026, 10, 15, 7, 0),
    foodId: 'food-1',
    foodNameSnapshot: 'Crunchy Kibble',
    amountG: 100,
    kcal: 350,
    note: null,
    planId: PLAN.id,
    mealIndex: 0,
    createdBy: 'user-1',
    createdAt: new Date(2026, 10, 15, 7, 0),
    ...overrides,
  }
}

function query<T>(data: T): UseQueryResult<T> {
  return { data, isLoading: false, isError: false } as UseQueryResult<T>
}

function makeDay(given: Feeding[] = []): CatDay {
  const times = planMealTimes(PLAN)
  const givenByMeal = new Map<number, Feeding[]>()
  for (const entry of given) {
    if (entry.mealIndex !== null) givenByMeal.set(entry.mealIndex, [entry])
  }
  const givenAt = new Map(
    [...givenByMeal].map(([index, [first]]) => [index, first?.datetime ?? DAY_START]),
  )
  return {
    day: { start: DAY_START, end: new Date(2026, 10, 16) },
    now: new Date(2026, 10, 15, 12, 0),
    weightsQuery: query([]),
    foodsQuery: query([FOOD]),
    feedingsQuery: query(given),
    plansQuery: query([PLAN]),
    planItemsQuery: query([ITEM]),
    latestWeightKg: null,
    target: null,
    foods: [FOOD],
    activeFoods: [FOOD],
    kcalPerGram: new Map([['food-1', 3.5]]),
    plans: [PLAN],
    plan: PLAN,
    planItems: [ITEM],
    times,
    planDailyKcal: 1050,
    ratio: null,
    feedings: given,
    givenByMeal,
    offPlan: [],
    givenCount: givenByMeal.size,
    eatenKcal: 0,
    overridesForDay: [],
    adjustedTimes: adjustedMealTimes(times, DAY_START, givenAt),
  }
}

function mockHousehold(canEdit: boolean) {
  vi.mocked(useHousehold).mockReturnValue({
    householdId: 'hh-1',
    role: canEdit ? 'owner' : 'viewer',
    canEdit,
    cats: [CAT],
    activeCat: CAT,
    selectCat: vi.fn(),
    catsLoading: false,
  })
}

beforeEach(() => {
  addFeedingsMock.mockReset().mockResolvedValue(undefined)
  deleteFeedingsMock.mockReset().mockResolvedValue(undefined)
  awaitOrQueuedMock.mockReset().mockResolvedValue('confirmed')
  vi.mocked(useAuth).mockReturnValue({ user: { uid: 'user-1' }, loading: false } as ReturnType<
    typeof useAuth
  >)
  mockHousehold(true)
})

describe('MealChecklist', () => {
  it('renders one tick row per planned bowl, with grams and kcal', () => {
    render(<MealChecklist cat={CAT} day={makeDay()} />)

    expect(screen.getByTestId('meal-tick-0')).toHaveAccessibleName('Mark the 07:00 meal given')
    expect(screen.getByTestId('meal-tick-1')).toHaveAccessibleName('Mark the 13:00 meal given')
    expect(screen.getByTestId('meal-tick-2')).toHaveAccessibleName('Mark the 19:00 meal given')
    expect(screen.getAllByText('100 g · 350 kcal')).toHaveLength(3)
  })

  it('shows grams only when kcal is hidden', () => {
    render(<MealChecklist cat={CAT} day={makeDay()} showKcal={false} />)

    expect(screen.getAllByText('100 g')).toHaveLength(3)
    expect(screen.queryByText(/kcal/)).not.toBeInTheDocument()
  })

  it('ticks a bowl off as a feeding of this plan at its due time', async () => {
    render(<MealChecklist cat={CAT} day={makeDay()} />)

    await userEvent.click(screen.getByTestId('meal-tick-1'))

    expect(addFeedingsMock).toHaveBeenCalledOnce()
    const [hid, catId, uid, inputs] = addFeedingsMock.mock.calls[0] ?? []
    expect([hid, catId, uid]).toEqual(['hh-1', CAT.id, 'user-1'])
    expect(inputs).toEqual([
      expect.objectContaining({
        foodId: 'food-1',
        amountG: 100,
        kcal: 350,
        planId: PLAN.id,
        mealIndex: 1,
        datetime: new Date(2026, 10, 15, 13, 0),
      }),
    ])
  })

  it('undoes a bowl that was already given', async () => {
    render(<MealChecklist cat={CAT} day={makeDay([feeding({ id: 'f-0', mealIndex: 0 })])} />)

    const tick = screen.getByTestId('meal-tick-0')
    expect(tick).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(tick)

    expect(deleteFeedingsMock).toHaveBeenCalledWith('hh-1', CAT.id, ['f-0'])
    expect(addFeedingsMock).not.toHaveBeenCalled()
  })

  it('shows the write error under the list', async () => {
    awaitOrQueuedMock.mockRejectedValueOnce(new Error('Permission denied'))
    render(<MealChecklist cat={CAT} day={makeDay()} />)

    await userEvent.click(screen.getByTestId('meal-tick-0'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Permission denied')
  })

  it('gives a viewer no tick or time controls', () => {
    mockHousehold(false)
    render(<MealChecklist cat={CAT} day={makeDay()} />)

    expect(screen.queryByTestId('meal-tick-0')).not.toBeInTheDocument()
    expect(screen.queryByTestId('meal-time-0')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders nothing without a plan', () => {
    const { container } = render(
      <MealChecklist cat={CAT} day={{ ...makeDay(), plan: null, planItems: [], times: [] }} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
