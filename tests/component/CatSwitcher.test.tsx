import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CatSwitcher } from '../../src/components/CatSwitcher'
import { useHousehold, type HouseholdState } from '../../src/lib/household'
import { makeCat } from './fixtures'

vi.mock('../../src/lib/household', () => ({ useHousehold: vi.fn() }))

const useHouseholdMock = vi.mocked(useHousehold)
const selectCat = vi.fn()

const MOCHI = makeCat({ id: 'mochi', name: 'Mochi' })
const BISCUIT = makeCat({ id: 'biscuit', name: 'Biscuit' })

function renderSwitcher(cats: HouseholdState['cats'], activeCat: HouseholdState['activeCat']) {
  useHouseholdMock.mockReturnValue({
    householdId: 'hh-1',
    role: 'owner',
    canEdit: true,
    cats,
    activeCat,
    selectCat,
    catsLoading: false,
  })
  return render(<CatSwitcher />)
}

describe('CatSwitcher', () => {
  beforeEach(() => {
    selectCat.mockClear()
  })

  it('renders nothing while there is only one cat', () => {
    const { container } = renderSwitcher([MOCHI], MOCHI)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing before any cat exists', () => {
    const { container } = renderSwitcher([], null)
    expect(container).toBeEmptyDOMElement()
  })

  it('marks the active cat as pressed', () => {
    renderSwitcher([MOCHI, BISCUIT], BISCUIT)
    expect(screen.getByRole('button', { name: 'Biscuit' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Mochi' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('selects the cat that was tapped', async () => {
    renderSwitcher([MOCHI, BISCUIT], MOCHI)
    await userEvent.click(screen.getByRole('button', { name: 'Biscuit' }))
    expect(selectCat).toHaveBeenCalledExactlyOnceWith('biscuit')
  })

  // jsdom has no View Transitions API, so the test above is the fallback path.
  it('crossfades to the tapped cat where the browser can', async () => {
    let finish: (() => void) | undefined
    const startViewTransition = vi.fn((update: () => void) => {
      update()
      return {
        finished: new Promise<void>((resolve) => {
          finish = resolve
        }),
      }
    })
    Object.defineProperty(document, 'startViewTransition', {
      value: startViewTransition,
      configurable: true,
    })
    try {
      renderSwitcher([MOCHI, BISCUIT], MOCHI)
      await userEvent.click(screen.getByRole('button', { name: 'Biscuit' }))
      expect(startViewTransition).toHaveBeenCalledOnce()
      expect(selectCat).toHaveBeenCalledExactlyOnceWith('biscuit')

      // Lifted out of the crossfade while it runs, and only while it runs.
      const group = screen.getByRole('group', { name: 'Cat' })
      expect(group.style.viewTransitionName).toBe('cat-switcher')
      finish?.()
      await waitFor(() => {
        expect(group.style.viewTransitionName).toBe('')
      })
    } finally {
      Reflect.deleteProperty(document, 'startViewTransition')
    }
  })
})
