import { m } from 'motion/react'
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
 */
export function CatSwitcher() {
  const { cats, activeCat, selectCat } = useHousehold()
  if (cats.length < 2) return null

  return (
    <div role="group" aria-label="Cat" className="gutter flex flex-wrap gap-2">
      {cats.map((cat) => {
        const selected = cat.id === activeCat?.id
        return (
          <button
            key={cat.id}
            type="button"
            aria-pressed={selected}
            onClick={() => {
              selectCat(cat.id)
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
