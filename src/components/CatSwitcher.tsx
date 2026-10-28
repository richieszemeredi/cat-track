import { m } from 'motion/react'
import { useRef } from 'react'
import { flushSync } from 'react-dom'
import { useHousehold } from '../lib/household'
import { glide } from '../lib/motion'

/**
 * Which cat the screen below is about. Only exists once there is a choice to
 * make: with one cat the screens look exactly as they always did.
 *
 * The coral fill is one element that slides from chip to chip (a shared
 * layoutId, like the tab bar's pill), so picking a cat reads as moving the
 * selection rather than two chips swapping colours. It travels between rows
 * too when the chips wrap: Motion animates the box, not a line along the row.
 *
 * The screen below crossfades from one cat to the other the way a tab change
 * does (index.css): the screens key their body by cat id, so without it one
 * cat's figures would simply be replaced by the other's.
 */
export function CatSwitcher() {
  const { cats, activeCat, selectCat } = useHousehold()
  const groupRef = useRef<HTMLDivElement>(null)
  const latest = useRef<ViewTransition | null>(null)
  if (cats.length < 2) return null

  function pick(catId: string) {
    const group = groupRef.current
    if (!('startViewTransition' in document) || group === null) {
      selectCat(catId)
      return
    }
    // Named only for its own crossfade, so it is lifted out of it and its
    // fill is seen sliding live, not ghosting. Named for good, a tab change
    // to a screen without a switcher would drop it at once instead of
    // letting it fade with the page. Only the latest transition un-names it:
    // a quick second tap skips the first, whose end must not undo the second.
    group.style.viewTransitionName = 'cat-switcher'
    // flushSync so the new snapshot is taken of the new cat's screen, not of
    // a render React has yet to commit.
    const transition = document.startViewTransition(() => {
      flushSync(() => {
        selectCat(catId)
      })
    })
    latest.current = transition
    const unname = () => {
      if (latest.current === transition) group.style.viewTransitionName = ''
    }
    void transition.finished.then(unname, unname)
  }

  return (
    <div ref={groupRef} role="group" aria-label="Cat" className="gutter flex flex-wrap gap-2">
      {cats.map((cat) => {
        const selected = cat.id === activeCat?.id
        return (
          <button
            key={cat.id}
            type="button"
            aria-pressed={selected}
            onClick={() => {
              pick(cat.id)
            }}
            className={`btn-chip relative max-w-full ${selected ? 'text-on-coral' : ''}`}
          >
            {selected ? (
              // -inset-px: over the chip's border too, so the selected chip
              // is coral edge to edge as it was when the button was the fill.
              <m.span
                layoutId="cat-pill"
                transition={glide}
                className="absolute -inset-px rounded-full bg-coral"
              />
            ) : null}
            {/* Positioned so the name paints above the pill. The colour eases
            because it flips at once while the pill is still on its way. */}
            <span className="relative truncate transition-colors duration-200 ease-squishy">
              {cat.name}
            </span>
          </button>
        )
      })}
    </div>
  )
}
