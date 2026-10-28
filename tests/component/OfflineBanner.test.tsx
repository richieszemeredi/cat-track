import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OfflineBanner } from '../../src/components/OfflineBanner'

function setOnline(online: boolean): void {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online)
}

function flipConnection(online: boolean): void {
  setOnline(online)
  act(() => {
    window.dispatchEvent(new Event(online ? 'online' : 'offline'))
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('OfflineBanner', () => {
  it('shows nothing while online', () => {
    setOnline(true)
    render(<OfflineBanner />)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('is already there when the app opens offline', () => {
    setOnline(false)
    render(<OfflineBanner />)

    expect(screen.getByRole('status')).toHaveTextContent(
      'Offline — entries are saved and will sync',
    )
  })

  it('appears when the connection drops and leaves once it is back', async () => {
    setOnline(true)
    render(<OfflineBanner />)

    flipConnection(false)
    expect(screen.getByRole('status')).toHaveTextContent(/offline/i)

    flipConnection(true)
    // The exit animation runs before AnimatePresence unmounts the banner.
    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })
  })
})
