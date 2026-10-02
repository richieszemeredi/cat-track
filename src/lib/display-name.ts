/** The rules' `validString(displayName, 60)` cap on a member's name. */
export const MAX_DISPLAY_NAME_LENGTH = 60

/**
 * The name a member is stored under: their Auth name, else their email, cut
 * to what the rules accept. Uncut, an email past 60 characters failed the
 * owner's own member write — and with it the whole create-household batch,
 * so that account could never get into the app at all.
 */
export function displayNameFor(
  user: { displayName: string | null; email: string | null },
  fallback: string,
): string {
  const name = user.displayName ?? user.email ?? fallback
  // By code point, so a cut never splits an accented letter's surrogate pair.
  return Array.from(name).slice(0, MAX_DISPLAY_NAME_LENGTH).join('')
}
