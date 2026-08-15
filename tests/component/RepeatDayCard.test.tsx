import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RepeatDayCard } from '../../src/components/RepeatDayCard'
import { addFeeding, addFeedings, awaitOrQueued } from '../../src/lib/db'
import { type Feeding } from '../../src/lib/schemas'

const feedings: Feeding[] = []

vi.mock('../../src/lib/db', () => ({
  addFeeding: vi.fn(),
  addFeedings: vi.fn(),
  awaitOrQueued: vi.fn(),
  recentFeedingsQueryOptions: (hid: string, catId: string) => ({
    queryKey: ['feedings-recent', hid, catId],
    queryFn: () => Promise.resolve(feedings),
  }),
  useRecentFeedingsLive: () => undefined,
}))

const addFeedingMock = vi.mocked(addFeeding)
const addFeedingsMock = vi.mocked(addFeedings)
const awaitOrQueuedMock = vi.mocked(awaitOrQueued)

const TODAY_START = new Date(2026, 2, 10)

function makeFeeding(datetime: Date, overrides: Partial<Feeding> = {}): Feeding {
  return {
    id: `f-${String(datetime.getTime())}`,
    datetime,
    foodId: 'food-1',
    foodNameSnapshot: 'Crunchy Kibble',
    amountG: 40,
    kcal: 140,
    note: null,
    createdBy: 'user-1',
    createdAt: datetime,
    ...overrides,
  }
}

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <RepeatDayCard hid="hh-1" catId="cat-9" uid="user-1" todayStart={TODAY_START} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  feedings.length = 0
  addFeedingMock.mockReset().mockResolvedValue(undefined)
  addFeedingsMock.mockReset().mockResolvedValue(undefined)
  awaitOrQueuedMock.mockReset().mockResolvedValue('confirmed')
})

describe('RepeatDayCard', () => {
  it('renders nothing when there is no earlier day to repeat', async () => {
    feedings.push(makeFeeding(new Date(2026, 2, 10, 8, 0)))
    renderCard()

    // Give the query a tick to settle; the card must still be absent.
    await waitFor(() => {
      expect(screen.queryByTestId('repeat-day')).not.toBeInTheDocument()
    })
  })

  it('summarises the last logged day and lists its meals oldest first', async () => {
    feedings.push(
      makeFeeding(new Date(2026, 2, 9, 19, 30), { foodNameSnapshot: 'Wet Tuna', kcal: 90 }),
      makeFeeding(new Date(2026, 2, 9, 7, 15)),
    )
    renderCard()

    const card = await screen.findByTestId('repeat-day')
    expect(within(card).getByRole('heading')).toHaveTextContent('Same as yesterday')
    expect(card).toHaveTextContent('2 meals · 230 kcal')

    const rows = within(card).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('07:15')
    expect(rows[1]).toHaveTextContent('19:30')
  })

  it('copies the whole day onto today, keeping each time of day', async () => {
    feedings.push(
      makeFeeding(new Date(2026, 2, 9, 7, 15)),
      makeFeeding(new Date(2026, 2, 9, 19, 30), { amountG: 25, kcal: 87.5 }),
    )
    const user = userEvent.setup()
    renderCard()

    await user.click(await screen.findByTestId('repeat-day-all'))

    await waitFor(() => {
      expect(addFeedingsMock).toHaveBeenCalledTimes(1)
    })
    const [hid, catId, uid, inputs] = addFeedingsMock.mock.calls[0] ?? []
    expect(hid).toBe('hh-1')
    expect(catId).toBe('cat-9')
    expect(uid).toBe('user-1')
    expect(inputs).toHaveLength(2)
    expect(inputs?.[0]?.datetime).toEqual(new Date(2026, 2, 10, 7, 15))
    expect(inputs?.[1]?.datetime).toEqual(new Date(2026, 2, 10, 19, 30))
    expect(inputs?.[1]?.amountG).toBe(25)
  })

  it('copies a single meal when its Add button is tapped', async () => {
    feedings.push(makeFeeding(new Date(2026, 2, 9, 7, 15)))
    const user = userEvent.setup()
    renderCard()

    await user.click(await screen.findByRole('button', { name: /log crunchy kibble again/i }))

    await waitFor(() => {
      expect(addFeedingMock).toHaveBeenCalledTimes(1)
    })
    expect(addFeedingsMock).not.toHaveBeenCalled()
    const [, , , input] = addFeedingMock.mock.calls[0] ?? []
    expect(input?.datetime).toEqual(new Date(2026, 2, 10, 7, 15))
    expect(input?.foodNameSnapshot).toBe('Crunchy Kibble')
  })

  it('surfaces a failed copy instead of silently dropping it', async () => {
    feedings.push(makeFeeding(new Date(2026, 2, 9, 7, 15)))
    awaitOrQueuedMock.mockRejectedValueOnce(new Error('bowl unreachable'))
    const user = userEvent.setup()
    renderCard()

    await user.click(await screen.findByTestId('repeat-day-all'))

    expect(await screen.findByRole('alert')).toHaveTextContent('bowl unreachable')
    expect(screen.getByTestId('repeat-day-all')).toBeEnabled()
  })
})
