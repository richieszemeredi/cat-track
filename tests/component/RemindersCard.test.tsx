import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RemindersCard } from '../../src/components/RemindersCard'
import type { RemindersState } from '../../src/lib/use-reminders'

function renderCard(overrides: Partial<RemindersState> = {}) {
  const enable = vi.fn(async () => {
    /* resolved by the caller's assertions */
  })
  const disable = vi.fn()
  const props: RemindersState = {
    enabled: false,
    permission: 'default',
    installed: true,
    enable,
    disable,
    ...overrides,
  }

  render(<RemindersCard {...props} />)
  return { enable, disable }
}

describe('RemindersCard', () => {
  it('always says what the reminders are and when they cannot arrive', () => {
    renderCard()

    expect(screen.getByText(/15 minutes before each planned meal/)).toBeInTheDocument()
    // The honest caveat is not a state — it is on the card in every one of them.
    expect(screen.getByText(/Only while CatTrack is open on this phone/)).toBeInTheDocument()
  })

  it('offers to turn reminders on before permission has been asked for', async () => {
    const { enable } = renderCard({ permission: 'default' })

    await userEvent.click(screen.getByRole('button', { name: 'Turn on reminders' }))
    expect(enable).toHaveBeenCalledOnce()
  })

  it('offers to turn them off once they are running', async () => {
    const { disable } = renderCard({ enabled: true, permission: 'granted' })

    await userEvent.click(screen.getByRole('button', { name: 'Turn off reminders' }))
    expect(disable).toHaveBeenCalledOnce()
  })

  // Permission survives the preference: granted-but-off must still be an offer
  // to turn on, not a claim that reminders are running.
  it('offers to turn them on again when permission is held but the switch is off', () => {
    renderCard({ enabled: false, permission: 'granted' })

    expect(screen.getByRole('button', { name: 'Turn on reminders' })).toBeInTheDocument()
  })

  it('sends a blocked user to their device settings, not to a dead button', () => {
    renderCard({ permission: 'denied' })

    expect(screen.getByText(/blocked for CatTrack/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  // Notifications reach an iPhone only from the Home Screen, so a Safari tab
  // needs the install step spelled out rather than a button that cannot work.
  it('asks an uninstalled phone to add the app to the Home Screen first', () => {
    renderCard({ permission: 'unsupported', installed: false })

    expect(screen.getByText(/Add CatTrack to your Home Screen first/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('says so plainly when an installed browser simply cannot notify', () => {
    renderCard({ permission: 'unsupported', installed: true })

    expect(screen.getByText('This browser can’t show notifications.')).toBeInTheDocument()
  })
})
