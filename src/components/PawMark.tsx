/**
 * The app mark. A drawn paw rather than the 🐱 emoji: an emoji is someone
 * else's artwork rendered differently on every OS, and leaning on them for
 * personality is exactly what made the UI read as generic.
 */
export function PawMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="currentColor"
      aria-hidden="true"
      className={className}
      focusable="false"
    >
      <ellipse cx="12.5" cy="17" rx="5.4" ry="7" transform="rotate(-18 12.5 17)" />
      <ellipse cx="22" cy="11.5" rx="5" ry="7" transform="rotate(-6 22 11.5)" />
      <ellipse cx="32.5" cy="13.5" rx="4.8" ry="6.6" transform="rotate(12 32.5 13.5)" />
      <ellipse cx="40" cy="22.5" rx="4.4" ry="6" transform="rotate(28 40 22.5)" />
      <path d="M24.6 21.5c6.2 0 11.4 4.6 11.4 10.3 0 4.6-3.4 7.4-8 7.4-2.2 0-3.4-.8-5.6-.8s-3.4.8-5.6.8c-4.6 0-8-2.8-8-7.4 0-5.7 5.2-10.3 11.4-10.3Z" />
    </svg>
  )
}
