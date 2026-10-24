import { useHousehold } from '../lib/household'

/**
 * Which cat the screen below is about. Only exists once there is a choice to
 * make: with one cat the screens look exactly as they always did.
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
            className={`btn-chip max-w-full ${selected ? 'border-coral bg-coral text-on-coral hover:bg-coral' : ''}`}
          >
            <span className="truncate">{cat.name}</span>
          </button>
        )
      })}
    </div>
  )
}
