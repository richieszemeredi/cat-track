import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { AnimatePresence } from 'motion/react'
import { litterBoxesQueryOptions, useLitterBoxesLive } from '../lib/db'
import { useHousehold } from '../lib/household'
import { litterAge, litterAgeLabel } from '../lib/litter'
import { useToday } from '../lib/use-today'
import { ListRow } from './ListRow'

/** How many boxes the home screen lists before it says "N more". */
const MAX_ROWS = 3

/**
 * The litter boxes at a glance. They belong to the household, not to a cat, so
 * this sits outside every cat's block. Read-only: marking one replaced happens
 * on Chores, one tap away from any row.
 */
export function LitterGlance() {
  const { householdId, canEdit } = useHousehold()
  const boxesQuery = useQuery(litterBoxesQueryOptions(householdId))
  useLitterBoxesLive(householdId)
  const today = useToday().start

  if (boxesQuery.isLoading) {
    return <div className="h-16 animate-pulse rounded-squishy bg-sand" />
  }
  if (boxesQuery.isError) {
    return (
      <p role="alert" className="gutter text-sm font-semibold text-danger">
        Couldn&apos;t load litter boxes. {boxesQuery.error.message}
      </p>
    )
  }

  const boxes = (boxesQuery.data ?? [])
    .map((box) => ({ box, age: litterAge(box.lastChangedAt, today, box.changeEveryWeeks) }))
    // What needs doing first, then the oldest of the rest.
    .sort((a, b) => Number(b.age.overdue) - Number(a.age.overdue) || b.age.days - a.age.days)

  // A viewer can't add one, so an empty section would only be noise.
  if (boxes.length === 0 && !canEdit) return null

  const shown = boxes.slice(0, MAX_ROWS)
  const hidden = boxes.length - shown.length

  return (
    <section className="flex flex-col gap-3">
      <h2 className="section-label gutter">Litter</h2>
      {boxes.length === 0 ? (
        <div className="gutter flex flex-col items-start gap-3">
          <p className="text-sm text-ink-soft">No litter boxes yet.</p>
          <Link to="/chores" className="btn-secondary">
            Add a litter box
          </Link>
        </div>
      ) : (
        // The rows' hover fill must follow the card's corners (inner radius: the
        // outer one minus the 1px border); clipping the card
        // with overflow-hidden would also cut off the keyboard focus ring.
        <ul className="surface divide-y divide-sand [&>li:first-child>a]:rounded-t-[calc(var(--radius-squishy)-1px)] [&>li:last-child>a]:rounded-b-[calc(var(--radius-squishy)-1px)]">
          <AnimatePresence initial={false}>
            {shown.map(({ box, age }, index) => (
              <ListRow key={box.id} order={index}>
                <Link
                  to="/chores"
                  className="flex min-h-12 items-baseline gap-3 px-4 py-3 hover:bg-sand"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{box.location}</span>
                    {age.overdue ? (
                      <span className="nudge block text-sm text-danger">Due for a full clean</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-sm text-ink-soft tabular-nums">
                    {litterAgeLabel(age)}
                  </span>
                </Link>
              </ListRow>
            ))}
          </AnimatePresence>
          {hidden > 0 ? (
            <li>
              <Link
                to="/chores"
                className="flex min-h-12 items-center px-4 py-3 text-sm text-ink-soft hover:bg-sand"
              >
                {hidden} more {hidden === 1 ? 'box' : 'boxes'}
              </Link>
            </li>
          ) : null}
        </ul>
      )}
    </section>
  )
}
