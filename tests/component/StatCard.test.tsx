import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatCard, type StatTone } from '../../src/components/StatCard'

describe('StatCard', () => {
  it('renders label, value, sub and emoji', () => {
    render(<StatCard label="Today" value="123 kcal" sub="of 250 kcal" emoji="🔥" tone="mint" />)

    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByText('123 kcal')).toBeInTheDocument()
    expect(screen.getByText('of 250 kcal')).toBeInTheDocument()
    expect(screen.getByText('🔥')).toBeInTheDocument()
  })

  it('omits sub and emoji when not provided and defaults to the plain tone', () => {
    const { container } = render(<StatCard label="Streak" value={7} />)

    expect(screen.getByText('Streak')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(container.firstChild).toHaveClass('bg-white')
  })

  const toneCases: { tone: StatTone; className: string }[] = [
    { tone: 'plain', className: 'bg-white' },
    { tone: 'coral', className: 'bg-coral-soft' },
    { tone: 'mint', className: 'bg-mint-soft' },
    { tone: 'butter', className: 'bg-butter/60' },
  ]

  it.each(toneCases)('applies the $tone tone class', ({ tone, className }) => {
    const { container } = render(<StatCard label="Label" value="Value" tone={tone} />)

    expect(container.firstChild).toHaveClass(className)
  })
})
