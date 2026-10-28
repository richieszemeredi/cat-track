import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { AnimatePresence } from 'motion/react'
import { useWaterBowlsLive, waterBowlsQueryOptions } from '../lib/db'
import { useHousehold } from '../lib/household'
import { useNow } from '../lib/use-now'
import { waterAge, waterAgeLabel } from '../lib/water'
import { ListRow } from './ListRow'

/** How many bowls the home screen lists before it says "N more". */
const MAX_ROWS = 3

/**
 * The water bowls at a glance. Household-level like the litter boxes, so it
 * sits outside every cat's block. Read-only: marking one replaced happens on
 * Chores, one tap away from any row.
 */
export function WaterGlance() {
  const { householdId, canEdit } = useHousehold()
  const bowlsQuery = useQuery(waterBowlsQueryOptions(householdId))
  useWaterBowlsLive(householdId)
  const now = useNow()

  if (bowlsQuery.isLoading) {
    return <div className="h-16 animate-pulse rounded-squishy bg-sand" />
  }
  if (bowlsQuery.isError) {
    return (
      <p role="alert" className="gutter text-sm font-semibold text-danger">
        Couldn&apos;t load water bowls. {bowlsQuery.error.message}
      </p>
    )
  }

  const bowls = (bowlsQuery.data ?? [])
    .map((bowl) => ({ bowl, age: waterAge(bowl.lastChangedAt, now) }))
    // What needs doing first, then the oldest of the rest.
    .sort((a, b) => Number(b.age.overdue) - Number(a.age.overdue) || b.age.hours - a.age.hours)

  // A viewer can't add one, so an empty section would only be noise.
  if (bowls.length === 0 && !canEdit) return null

  const shown = bowls.slice(0, MAX_ROWS)
  const hidden = bowls.length - shown.length

  return (
    <section className="flex flex-col gap-3">
      <h2 className="section-label gutter">Water</h2>
      {bowls.length === 0 ? (
        <div className="gutter flex flex-col items-start gap-3">
          <p className="text-sm text-ink-soft">No water bowls yet.</p>
          <Link to="/chores" className="btn-secondary">
            Add a water bowl
          </Link>
        </div>
      ) : (
        // Hover fill follows the card's inner corners — see LitterGlance.
        <ul className="surface divide-y divide-sand [&>li:first-child>a]:rounded-t-[calc(var(--radius-squishy)-1px)] [&>li:last-child>a]:rounded-b-[calc(var(--radius-squishy)-1px)]">
          <AnimatePresence initial={false}>
            {shown.map(({ bowl, age }, index) => (
              <ListRow key={bowl.id} order={index}>
                <Link
                  to="/chores"
                  className="flex min-h-12 items-baseline gap-3 px-4 py-3 hover:bg-sand"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{bowl.location}</span>
                    {age.overdue ? (
                      <span className="block text-sm text-danger">Time for fresh water</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-sm text-ink-soft tabular-nums">
                    {waterAgeLabel(age, bowl.lastChangedAt, now)}
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
                {hidden} more {hidden === 1 ? 'bowl' : 'bowls'}
              </Link>
            </li>
          ) : null}
        </ul>
      )}
    </section>
  )
}
