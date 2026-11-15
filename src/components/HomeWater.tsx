import { useQuery } from '@tanstack/react-query'
import { AnimatePresence } from 'motion/react'
import { useState } from 'react'
import { useAuth } from '../lib/auth'
import {
  awaitOrQueued,
  updateWaterBowl,
  useWaterBowlsLive,
  waterBowlsQueryOptions,
  type WaterBowl,
} from '../lib/db'
import { useHousehold } from '../lib/household'
import { useNow } from '../lib/use-now'
import { waterAge, waterChangedLabel, waterJustChanged } from '../lib/water'
import { ListRow } from './ListRow'
import { SectionError, Skeleton } from './SectionStatus'
import { WaterBowlForm } from './WaterBowlForm'

/**
 * Home's water: one row per bowl, right under the meals, since it is filled
 * in the same trip. It tracks when the water was last REPLACED, never what a
 * cat drank. Household-level, so it renders once, after the last cat's bowls.
 */
export function HomeWater() {
  const { householdId, canEdit } = useHousehold()
  const { user } = useAuth()
  const uid = user?.uid ?? null
  const bowlsQuery = useQuery(waterBowlsQueryOptions(householdId))
  useWaterBowlsLive(householdId)
  // Elapsed hours, so a minute tick — useToday only moves at midnight.
  const now = useNow()
  const [adding, setAdding] = useState(false)

  if (bowlsQuery.isLoading) return <Skeleton />
  if (bowlsQuery.isError) {
    return <SectionError label={`Couldn't load water bowls. ${bowlsQuery.error.message}`} />
  }

  const bowls = bowlsQuery.data ?? []
  const editable = canEdit && uid !== null

  const addForm =
    adding && editable ? (
      <div data-testid="home-water-add" className="surface flex flex-col gap-3 p-4">
        <WaterBowlForm
          hid={householdId}
          uid={uid}
          onDone={() => {
            setAdding(false)
          }}
        />
        <button
          type="button"
          onClick={() => {
            setAdding(false)
          }}
          className="btn-chip self-start"
        >
          Cancel
        </button>
      </div>
    ) : null

  if (bowls.length === 0) {
    // A viewer can't start tracking, so nothing at all beats an empty line.
    if (!editable) return null
    return (
      addForm ?? (
        <div className="gutter">
          <button
            type="button"
            data-testid="water-track"
            onClick={() => {
              setAdding(true)
            }}
            className="btn-chip"
          >
            Track water
          </button>
        </div>
      )
    )
  }

  return (
    <>
      <ul data-testid="home-water" className="surface divide-y divide-sand">
        <AnimatePresence initial={false}>
          {bowls.map((bowl, index) => (
            <ListRow key={bowl.id} order={index}>
              <WaterRow
                bowl={bowl}
                // One bowl is just "Water"; several need telling apart.
                title={bowls.length === 1 ? 'Water' : bowl.location}
                now={now}
                hid={householdId}
                uid={editable ? uid : null}
                onAddAnother={() => {
                  setAdding(true)
                }}
              />
            </ListRow>
          ))}
        </AnimatePresence>
      </ul>
      {addForm}
    </>
  )
}

function WaterRow({
  bowl,
  title,
  now,
  hid,
  uid,
  onAddAnother,
}: {
  bowl: WaterBowl
  title: string
  now: Date
  hid: string
  /** null for a viewer: no controls at all. */
  uid: string | null
  onAddAnother: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const age = waterAge(bowl.lastChangedAt, now)

  const handleRefreshed = () => {
    setError(null)
    // 'confirmed' and 'queued' both count as success (offline-first).
    awaitOrQueued(updateWaterBowl(hid, bowl.id, { lastChangedAt: new Date() })).catch(
      (err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not save.')
      },
    )
  }

  return (
    <div data-testid="home-water-row" className="flex flex-col gap-3 px-4 py-3">
      <div className="flex min-h-10 items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{title}</p>
          {/* Red only once it is actually stale — under a day is just a fact. */}
          <p
            data-testid="home-water-age"
            className={
              age.overdue
                ? 'nudge text-sm font-semibold text-danger tabular-nums'
                : 'text-sm text-ink-soft tabular-nums'
            }
          >
            {waterChangedLabel(age, bowl.lastChangedAt, now)}
          </p>
        </div>
        {uid === null ? null : (
          <>
            <button
              type="button"
              data-testid="water-refreshed"
              disabled={waterJustChanged(bowl.lastChangedAt, now)}
              onClick={handleRefreshed}
              className="btn-chip shrink-0"
            >
              Refreshed
            </button>
            <button
              type="button"
              data-testid="water-edit"
              aria-expanded={editing}
              aria-label={editing ? `Close ${title}` : `Edit ${title}`}
              onClick={() => {
                setEditing((open) => !open)
              }}
              className="btn-chip shrink-0"
            >
              {editing ? 'Close' : 'Edit'}
            </button>
          </>
        )}
      </div>

      {error === null ? null : (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      {editing && uid !== null ? (
        <>
          <WaterBowlForm
            hid={hid}
            uid={uid}
            existing={bowl}
            onDone={() => {
              setEditing(false)
            }}
          />
          {/* The one way to a second bowl: rare enough not to need a button of
          its own on the row. */}
          <button
            type="button"
            data-testid="water-add-another"
            onClick={() => {
              setEditing(false)
              onAddAnother()
            }}
            className="btn-chip self-start"
          >
            Add another bowl
          </button>
        </>
      ) : null}
    </div>
  )
}
