import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InstallPrompt } from '../../src/components/InstallPrompt'
import { isIos, isStandalone } from '../../src/lib/standalone'

vi.mock('../../src/lib/standalone', () => ({
  isIos: vi.fn(),
  isStandalone: vi.fn(),
}))

const isIosMock = vi.mocked(isIos)
const isStandaloneMock = vi.mocked(isStandalone)

const HEADING = { name: 'Put CatTrack on your Home Screen' }

beforeEach(() => {
  localStorage.clear()
  isIosMock.mockReset().mockReturnValue(true)
  isStandaloneMock.mockReset().mockReturnValue(false)
})

describe('InstallPrompt', () => {
  it('shows the steps in Safari on iOS', () => {
    render(<InstallPrompt />)

    expect(screen.getByRole('heading', HEADING)).toBeInTheDocument()
  })

  it('stays away once installed, and off iOS', () => {
    isStandaloneMock.mockReturnValue(true)
    const { unmount } = render(<InstallPrompt />)
    expect(screen.queryByRole('heading', HEADING)).not.toBeInTheDocument()
    unmount()

    isStandaloneMock.mockReturnValue(false)
    isIosMock.mockReturnValue(false)
    render(<InstallPrompt />)
    expect(screen.queryByRole('heading', HEADING)).not.toBeInTheDocument()
  })

  it('folds away when dismissed and stays dismissed', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<InstallPrompt />)

    await user.click(screen.getByRole('button', { name: 'Dismiss install tip' }))

    // The exit animation runs before AnimatePresence unmounts the card.
    await waitFor(() => {
      expect(screen.queryByRole('heading', HEADING)).not.toBeInTheDocument()
    })
    unmount()

    render(<InstallPrompt />)
    expect(screen.queryByRole('heading', HEADING)).not.toBeInTheDocument()
  })
})
