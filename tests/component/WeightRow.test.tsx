import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { startOfDay } from 'date-fns'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WeightRow } from '../../src/components/WeightRow'
import { useAuth } from '../../src/lib/auth'
import { addWeightEntry, awaitOrQueued, type WeightEntry } from '../../src/lib/db'
import { useHousehold } from '../../src/lib/household'
import { makeCat } from './fixtures'

vi.mock('../../src/lib/db', () => ({
  addWeightEntry: vi.fn(),
  awaitOrQueued: vi.fn(),
}))
vi.mock('../../src/lib/household', () => ({ useHousehold: vi.fn() }))
vi.mock('../../src/lib/auth', () => ({ useAuth: vi.fn() }))

const addWeightEntryMock = vi.mocked(addWeightEntry)
const awaitOrQueuedMock = vi.mocked(awaitOrQueued)

const TODAY = new Date(2026, 10, 15)
// Twelve weeks old on TODAY: a kitten, so a gain reads as good news.
const KITTEN = makeCat({
  id: 'cat-1',
  name: 'Mochi',
  birthDate: new Date(2026, 7, 23),
  lifeStage: null,
  neutered: false,
  neuterDate: null,
})

function entry(day: Date, weightKg: number, id = String(day.getTime())): WeightEntry {
  return { id, date: day, weightKg, note: null, createdBy: 'user-1', createdAt: day }
}

function setRole(canEdit: boolean) {
  vi.mocked(useHousehold).mockReturnValue({
    householdId: 'hh-1',
    canEdit,
  } as unknown as ReturnType<typeof useHousehold>)
}

beforeEach(() => {
  addWeightEntryMock.mockReset().mockResolvedValue(undefined)
  awaitOrQueuedMock.mockReset().mockResolvedValue('confirmed')
  vi.mocked(useAuth).mockReturnValue({ user: { uid: 'user-1' } } as unknown as ReturnType<
    typeof useAuth
  >)
  setRole(true)
})

describe('WeightRow', () => {
  it('leads with the latest weight, its day, and the weekly trend', () => {
    render(
      <WeightRow
        cat={KITTEN}
        weights={[entry(new Date(2026, 10, 7), 1.32), entry(new Date(2026, 10, 14), 1.5)]}
        today={TODAY}
        named={false}
      />,
    )
    expect(screen.getByTestId('home-weight-latest')).toHaveTextContent('1.50 kg')
    expect(screen.getByText('· yesterday')).toBeInTheDocument()
    const trend = screen.getByTestId('home-weight-trend')
    expect(trend).toHaveTextContent('+180 g a week')
    expect(trend).toHaveClass('text-positive')
  })

  it('falls back to the change since the last weigh-in under the trend span', () => {
    render(
      <WeightRow
        cat={KITTEN}
        weights={[entry(new Date(2026, 10, 11), 1.46), entry(new Date(2026, 10, 12), 1.5)]}
        today={TODAY}
        named={false}
      />,
    )
    expect(screen.getByText('· Nov 12')).toBeInTheDocument()
    expect(screen.getByTestId('home-weight-trend')).toHaveTextContent(
      '+40 g since the last weigh-in',
    )
  })

  it('puts the name first and the weight on one line when there are several cats', () => {
    render(
      <WeightRow
        cat={KITTEN}
        weights={[entry(new Date(2026, 10, 7), 1.32), entry(new Date(2026, 10, 14), 1.5)]}
        today={TODAY}
        named
      />,
    )
    expect(screen.getByText('Mochi')).toBeInTheDocument()
    expect(screen.getByTestId('home-weight-trend')).toHaveTextContent('+180 g/wk')
    expect(screen.getByLabelText('Mochi’s weight today in kg')).toBeInTheDocument()
  })

  it('saves a comma-decimal weigh-in dated today', async () => {
    const user = userEvent.setup()
    render(
      <WeightRow
        cat={KITTEN}
        weights={[entry(new Date(2026, 10, 14), 1.5)]}
        today={TODAY}
        named={false}
      />,
    )

    await user.type(screen.getByLabelText('Today’s weight in kg'), '1,52')
    await user.click(screen.getByTestId('home-weight-save'))

    await waitFor(() => {
      expect(screen.getByTestId('home-weight-kg')).toHaveValue('')
    })
    expect(addWeightEntryMock).toHaveBeenCalledTimes(1)
    const [hid, catId, uid, input] = addWeightEntryMock.mock.calls[0] ?? []
    expect([hid, catId, uid]).toEqual(['hh-1', 'cat-1', 'user-1'])
    expect(input).toEqual({ date: startOfDay(new Date()), weightKg: 1.52, note: null })
  })

  it('rejects an implausible weight without writing', async () => {
    const user = userEvent.setup()
    render(<WeightRow cat={KITTEN} weights={[]} today={TODAY} named={false} />)

    expect(screen.getByText('No weigh-ins yet')).toBeInTheDocument()
    await user.type(screen.getByTestId('home-weight-kg'), '45')
    await user.click(screen.getByTestId('home-weight-save'))

    expect(screen.getByRole('alert')).toHaveTextContent('between 0.05 and 30 kg')
    expect(addWeightEntryMock).not.toHaveBeenCalled()
  })

  it('drops the field once she has been weighed today', () => {
    render(
      <WeightRow
        cat={KITTEN}
        weights={[entry(new Date(2026, 10, 15, 8), 1.52)]}
        today={TODAY}
        named={false}
      />,
    )
    expect(screen.getByText('· today')).toBeInTheDocument()
    expect(screen.queryByTestId('home-weight-kg')).not.toBeInTheDocument()
  })

  it('shows a viewer no field at all', () => {
    setRole(false)
    render(<WeightRow cat={KITTEN} weights={[]} today={TODAY} named={false} />)
    expect(screen.queryByTestId('home-weight-kg')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
