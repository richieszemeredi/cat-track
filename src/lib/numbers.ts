/**
 * Parse a number the way a phone keyboard actually produces one.
 *
 * The iOS decimal keypad offers the locale separator — a comma in hu-HU — and
 * `<input type="number">` silently drops a value it considers invalid, so a
 * typed "4,25" arrives as an empty string. Decimal fields are therefore plain
 * `type="text"` + `inputMode="decimal"` and normalise here instead.
 *
 * Returns null for anything that is not a finite number (including empty).
 */
export function parseDecimal(raw: string): number | null {
  const normalised = raw.trim().replace(',', '.')
  if (normalised === '') return null
  const value = Number(normalised)
  return Number.isFinite(value) ? value : null
}

/** Shared props for a comma-tolerant decimal field. */
export const DECIMAL_INPUT_PROPS = {
  type: 'text',
  inputMode: 'decimal',
  autoComplete: 'off',
  autoCorrect: 'off',
  spellCheck: false,
} as const
