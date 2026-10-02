import { describe, expect, it } from 'vitest'
import { displayNameFor, MAX_DISPLAY_NAME_LENGTH } from '../../src/lib/display-name'

describe('displayNameFor', () => {
  it('prefers the Auth name, then the email, then the fallback', () => {
    expect(displayNameFor({ displayName: 'Anna', email: 'a@example.com' }, 'You')).toBe('Anna')
    expect(displayNameFor({ displayName: null, email: 'a@example.com' }, 'You')).toBe(
      'a@example.com',
    )
    expect(displayNameFor({ displayName: null, email: null }, 'You')).toBe('You')
  })

  it('cuts a long email to what the rules accept', () => {
    const email = `${'x'.repeat(70)}@example.com`
    const name = displayNameFor({ displayName: null, email }, 'You')
    expect(name).toHaveLength(MAX_DISPLAY_NAME_LENGTH)
    expect(email.startsWith(name)).toBe(true)
  })

  it('never splits a character in two', () => {
    const name = displayNameFor({ displayName: '🐾'.repeat(61), email: null }, 'You')
    expect(Array.from(name)).toHaveLength(MAX_DISPLAY_NAME_LENGTH)
    expect(name).toBe('🐾'.repeat(MAX_DISPLAY_NAME_LENGTH))
  })
})
