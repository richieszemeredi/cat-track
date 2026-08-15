import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatCard } from '../../src/components/StatCard'

describe('StatCard', () => {
  it('renders label, value and sub', () => {
    render(<StatCard label="Today" value="123 kcal" sub="of 250 kcal" />)

    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByText('123 kcal')).toBeInTheDocument()
    expect(screen.getByText('of 250 kcal')).toBeInTheDocument()
  })

  it('omits sub when not provided', () => {
    render(<StatCard label="Streak" value={7} />)

    expect(screen.getByText('Streak')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
  })

  // Tone is a TEXT signal, not a background — the palette reserves colour for
  // meaning, so a positive stat tints its number and nothing else.
  it('tints the value for the positive tone and leaves the plain tone in ink', () => {
    const { rerender } = render(<StatCard label="Change" value="+0.10 kg" tone="positive" />)
    expect(screen.getByText('+0.10 kg')).toHaveClass('text-positive')

    rerender(<StatCard label="Change" value="+0.10 kg" />)
    expect(screen.getByText('+0.10 kg')).toHaveClass('text-ink')
  })
})
