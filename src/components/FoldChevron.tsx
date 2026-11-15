/**
 * The › at the end of a folded card's summary line, turning down as the fold
 * opens (needs `group` on the `<details>`; ease-squishy like the fold itself).
 * `turns={false}` is the same glyph on a link row, which goes somewhere
 * rather than opening.
 */
export function FoldChevron({ turns = true }: { turns?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`shrink-0 text-xl leading-none font-normal text-ink-soft ${
        turns ? 'transition-transform duration-200 ease-squishy group-open:rotate-90' : ''
      }`}
    >
      ›
    </span>
  )
}
