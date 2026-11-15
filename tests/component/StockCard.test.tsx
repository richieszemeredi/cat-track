import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StockCard } from '../../src/components/StockCard'
import { awaitOrQueued } from '../../src/lib/db'
import { type StockLevel } from '../../src/lib/stock'

vi.mock('../../src/lib/db', () => ({
  awaitOrQueued: vi.fn(),
}))

const awaitOrQueuedMock = vi.mocked(awaitOrQueued)

function level(overrides: Partial<StockLevel> = {}): StockLevel {
  return {
    level: 2.1,
    shown: 2,
    exact: false,
    countedAt: new Date(2026, 10, 8),
    since: new Date(2026, 10, 8),
    ...overrides,
  }
}

function renderCard(
  props: {
    stock?: StockLevel | null
    lastBought?: number | null
    viewer?: boolean
    low?: string | null
  } = {},
) {
  const record = vi.fn().mockResolvedValue(undefined)
  render(
    <StockCard
      testId="food-supply"
      title="Premiere Meat Menu Kitten"
      meta="Wet · Premiere · 400 g tins"
      unit="tin"
      stock={props.stock === undefined ? level() : props.stock}
      sub="runs out around Nov 18 · estimated since the Nov 8 count"
      low={props.low ?? null}
      lastBought={props.lastBought ?? null}
      max={10000}
      record={props.viewer === true ? null : record}
      edit={null}
    />,
  )
  return { record }
}

beforeEach(() => {
  awaitOrQueuedMock.mockReset().mockResolvedValue('queued')
})

describe('StockCard', () => {
  it('shows an estimate as "about" and an exact count without it', () => {
    renderCard()
    expect(screen.getByTestId('food-supply-figure')).toHaveTextContent('about 2')
    expect(screen.getByText('tins left')).toBeInTheDocument()
  })

  it('shows an exact count bare, with the singular unit for one', () => {
    renderCard({ stock: level({ level: 1, shown: 1, exact: true }) })
    expect(screen.getByTestId('food-supply-figure')).toHaveTextContent(/^1$/)
    expect(screen.getByText('tin left')).toBeInTheDocument()
  })

  it('says "Not counted yet" for an untracked supply', () => {
    renderCard({ stock: null })
    expect(screen.getByTestId('food-supply-figure')).toHaveTextContent('Not counted yet')
  })

  it('shows the low line when there is one', () => {
    renderCard({ low: 'About 3 days left — time to order' })
    expect(screen.getByText('About 3 days left — time to order')).toBeInTheDocument()
  })

  it('opens Bought on the last purchase, adds to it and closes on save', async () => {
    const user = userEvent.setup()
    const { record } = renderCard({ lastBought: 24 })

    await user.click(screen.getByRole('button', { name: 'Bought more' }))
    expect(screen.getByRole('button', { name: 'Bought more' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    const amount = screen.getByLabelText('How many did you buy?')
    expect(amount).toHaveValue('24')
    expect(screen.getByText('That makes about 26 tins.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'One more' }))
    expect(amount).toHaveValue('25')
    expect(screen.getByText('That makes about 27 tins.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add to stock' }))
    await waitFor(() => {
      expect(screen.queryByLabelText('How many did you buy?')).not.toBeInTheDocument()
    })
    expect(record).toHaveBeenCalledWith('bought', 25)
    expect(awaitOrQueuedMock).toHaveBeenCalledTimes(1)
  })

  it('opens Bought on 1 with no purchase yet, and never goes below 1', async () => {
    const user = userEvent.setup()
    renderCard()

    await user.click(screen.getByRole('button', { name: 'Bought more' }))
    expect(screen.getByLabelText('How many did you buy?')).toHaveValue('1')
    expect(screen.getByRole('button', { name: 'One fewer' })).toBeDisabled()
  })

  it('takes a typed amount for a big purchase', async () => {
    const user = userEvent.setup()
    const { record } = renderCard()

    await user.click(screen.getByRole('button', { name: 'Bought more' }))
    const amount = screen.getByLabelText('How many did you buy?')
    await user.clear(amount)
    await user.type(amount, '48')
    await user.click(screen.getByRole('button', { name: 'Add to stock' }))

    await waitFor(() => {
      expect(record).toHaveBeenCalledWith('bought', 48)
    })
  })

  it('opens Recount on the shown estimate and saves a count', async () => {
    const user = userEvent.setup()
    const { record } = renderCard()

    await user.click(screen.getByRole('button', { name: 'Recount' }))
    const amount = screen.getByLabelText('How many tins are there?')
    expect(amount).toHaveValue('2')

    await user.click(screen.getByRole('button', { name: 'One fewer' }))
    await user.click(screen.getByRole('button', { name: 'One fewer' }))
    expect(amount).toHaveValue('0')
    expect(screen.getByRole('button', { name: 'One fewer' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Save count' }))
    await waitFor(() => {
      expect(record).toHaveBeenCalledWith('count', 0)
    })
  })

  it('starts an untracked supply from Recount at 0', async () => {
    const user = userEvent.setup()
    renderCard({ stock: null })

    await user.click(screen.getByRole('button', { name: 'Recount' }))
    expect(screen.getByLabelText('How many tins are there?')).toHaveValue('0')
  })

  it('keeps one panel open at a time', async () => {
    const user = userEvent.setup()
    renderCard()

    await user.click(screen.getByRole('button', { name: 'Bought more' }))
    await user.click(screen.getByRole('button', { name: 'Recount' }))
    expect(screen.queryByLabelText('How many did you buy?')).not.toBeInTheDocument()
    expect(screen.getByLabelText('How many tins are there?')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Recount' }))
    expect(screen.queryByLabelText('How many tins are there?')).not.toBeInTheDocument()
  })

  it('keeps the panel open with an error line when the save fails', async () => {
    awaitOrQueuedMock.mockRejectedValueOnce(new Error('Missing or insufficient permissions.'))
    const user = userEvent.setup()
    renderCard()

    await user.click(screen.getByRole('button', { name: 'Recount' }))
    await user.click(screen.getByRole('button', { name: 'Save count' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Missing or insufficient permissions.',
    )
    expect(screen.getByLabelText('How many tins are there?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save count' })).toBeEnabled()
  })

  it('shows a viewer the figures but no controls', () => {
    renderCard({ viewer: true })
    expect(screen.getByTestId('food-supply-figure')).toHaveTextContent('about 2')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
