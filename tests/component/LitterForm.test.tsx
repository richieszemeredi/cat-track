import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LitterForm } from '../../src/components/LitterForm'
import { addLitter, awaitOrQueued, updateLitter, type LitterKind } from '../../src/lib/db'

vi.mock('../../src/lib/db', () => ({
  addLitter: vi.fn(),
  updateLitter: vi.fn(),
  awaitOrQueued: vi.fn(),
}))

const addLitterMock = vi.mocked(addLitter)
const updateLitterMock = vi.mocked(updateLitter)
const awaitOrQueuedMock = vi.mocked(awaitOrQueued)

const EXISTING: LitterKind = {
  id: 'litter-1',
  name: 'Clumping',
  bagSize: 5,
  bagUnit: 'kg',
  archived: false,
  createdBy: 'user-1',
  createdAt: new Date(2026, 9, 1),
}

function renderForm(props: { existing?: LitterKind } = {}) {
  const onDone = vi.fn()
  const result = props.existing
    ? render(<LitterForm hid="hh-1" uid="user-1" existing={props.existing} onDone={onDone} />)
    : render(<LitterForm hid="hh-1" uid="user-1" onDone={onDone} />)
  return { ...result, onDone }
}

beforeEach(() => {
  addLitterMock.mockReset().mockResolvedValue(undefined)
  updateLitterMock.mockReset().mockResolvedValue(undefined)
  awaitOrQueuedMock.mockReset().mockResolvedValue('confirmed')
})

describe('LitterForm', () => {
  it('adds a kind with a comma bag size in litres and its opening count', async () => {
    const user = userEvent.setup()
    const { onDone } = renderForm()

    // Litres until told otherwise.
    expect(screen.getByTestId('litter-kind-unit-L')).toHaveAttribute('aria-pressed', 'true')
    await user.type(screen.getByTestId('litter-kind-name'), '  Clumping  ')
    await user.type(screen.getByLabelText('Bag size (optional)'), '7,5')
    await user.type(screen.getByLabelText('Bags in stock (optional)'), '4')
    await user.click(screen.getByTestId('litter-kind-save'))

    await waitFor(() => {
      expect(onDone).toHaveBeenCalledTimes(1)
    })
    expect(addLitterMock).toHaveBeenCalledWith(
      'hh-1',
      'user-1',
      { name: 'Clumping', bagSize: 7.5, bagUnit: 'L' },
      4,
    )
    expect(updateLitterMock).not.toHaveBeenCalled()
  })

  it('saves kilograms once picked', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByTestId('litter-kind-name'), 'Silica')
    await user.type(screen.getByTestId('litter-kind-bag-size'), '5')
    await user.click(screen.getByTestId('litter-kind-unit-kg'))
    expect(screen.getByTestId('litter-kind-unit-kg')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('litter-kind-unit-L')).toHaveAttribute('aria-pressed', 'false')
    await user.click(screen.getByTestId('litter-kind-save'))

    await waitFor(() => {
      expect(addLitterMock).toHaveBeenCalledTimes(1)
    })
    expect(addLitterMock.mock.calls[0]?.[2]).toEqual({ name: 'Silica', bagSize: 5, bagUnit: 'kg' })
  })

  it('stores no size and no unit, and no count, when both are left empty', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByTestId('litter-kind-name'), 'Pine pellets')
    await user.click(screen.getByTestId('litter-kind-save'))

    await waitFor(() => {
      expect(addLitterMock).toHaveBeenCalledTimes(1)
    })
    expect(addLitterMock).toHaveBeenCalledWith(
      'hh-1',
      'user-1',
      { name: 'Pine pellets', bagSize: null, bagUnit: null },
      null,
    )
  })

  it('requires a name', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByTestId('litter-kind-save'))

    expect(screen.getByRole('alert')).toHaveTextContent('Give the litter a name.')
    expect(addLitterMock).not.toHaveBeenCalled()
  })

  it('refuses a bag size of zero or past the cap', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByTestId('litter-kind-name'), 'Clumping')
    await user.type(screen.getByTestId('litter-kind-bag-size'), '0')
    await user.click(screen.getByTestId('litter-kind-save'))
    expect(screen.getByRole('alert')).toHaveTextContent('Bag size must be more than 0')

    await user.clear(screen.getByTestId('litter-kind-bag-size'))
    await user.type(screen.getByTestId('litter-kind-bag-size'), '1001')
    await user.click(screen.getByTestId('litter-kind-save'))
    expect(screen.getByRole('alert')).toHaveTextContent('at most 1000')
    expect(addLitterMock).not.toHaveBeenCalled()
  })

  it('refuses an opening count that is not a whole number', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByTestId('litter-kind-name'), 'Clumping')
    await user.type(screen.getByTestId('litter-kind-opening-bags'), '2,5')
    await user.click(screen.getByTestId('litter-kind-save'))

    expect(screen.getByRole('alert')).toHaveTextContent('Bags in stock must be a whole number.')
    expect(addLitterMock).not.toHaveBeenCalled()
  })

  it('prefills from the existing kind, asks for no stock, and updates it', async () => {
    const user = userEvent.setup()
    const { onDone } = renderForm({ existing: EXISTING })

    expect(screen.getByTestId('litter-kind-name')).toHaveValue('Clumping')
    expect(screen.getByTestId('litter-kind-bag-size')).toHaveValue('5')
    expect(screen.getByTestId('litter-kind-unit-kg')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByTestId('litter-kind-opening-bags')).not.toBeInTheDocument()
    expect(screen.getByTestId('litter-kind-save')).toHaveTextContent('Save changes')

    await user.clear(screen.getByTestId('litter-kind-name'))
    await user.type(screen.getByTestId('litter-kind-name'), 'Clumping, unscented')
    await user.click(screen.getByTestId('litter-kind-save'))

    await waitFor(() => {
      expect(onDone).toHaveBeenCalledTimes(1)
    })
    expect(updateLitterMock).toHaveBeenCalledWith('hh-1', 'litter-1', {
      name: 'Clumping, unscented',
      bagSize: 5,
      bagUnit: 'kg',
    })
    expect(addLitterMock).not.toHaveBeenCalled()
  })

  it('treats a queued (offline) write as success', async () => {
    awaitOrQueuedMock.mockResolvedValue('queued')
    const user = userEvent.setup()
    const { onDone } = renderForm({ existing: EXISTING })

    await user.click(screen.getByTestId('litter-kind-save'))

    await waitFor(() => {
      expect(onDone).toHaveBeenCalledTimes(1)
    })
  })

  it('shows an alert and stays open when the save rejects', async () => {
    awaitOrQueuedMock.mockRejectedValue(new Error('Missing or insufficient permissions.'))
    const user = userEvent.setup()
    const { onDone } = renderForm({ existing: EXISTING })

    await user.click(screen.getByTestId('litter-kind-save'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Missing or insufficient')
    expect(onDone).not.toHaveBeenCalled()
  })
})
