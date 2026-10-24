import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
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
import { waterAge, waterAgeLabel } from '../lib/water'
import { ErrorCard } from './ErrorCard'
import { WaterBowlForm } from './WaterBowlForm'

/**
 * The bowls and the form that adds one: one column of the Chores page. On a
 * phone the sections simply stack; from 768pt each takes a column.
 */
export function WaterSection() {
  const { householdId, canEdit } = useHousehold()
  const { user } = useAuth()
  const bowlsQuery = useQuery(waterBowlsQueryOptions(householdId))
  useWaterBowlsLive(householdId)
  const now = useNow()

  const uid = user?.uid ?? null

  if (bowlsQuery.isLoading) {
    return <div className="page-solo h-24 animate-pulse rounded-squishy bg-sand" />
  }
  if (bowlsQuery.isError) {
    return (
      <ErrorCard
        title="Couldn't load water bowls"
        error={bowlsQuery.error}
        onRetry={() => {
          void bowlsQuery.refetch()
        }}
      />
    )
  }

  return (
    <div className="page-column">
      <section className="flex flex-col gap-3">
        <h2 className="section-label gutter">Water bowls</h2>
        {bowlsQuery.data === undefined || bowlsQuery.data.length === 0 ? (
          <p className="gutter text-sm text-ink-soft">No water bowls yet.</p>
        ) : (
          <ul className="surface divide-y divide-sand">
            {bowlsQuery.data.map((bowl) => (
              <WaterBowlRow
                key={bowl.id}
                bowl={bowl}
                now={now}
                hid={householdId}
                uid={uid}
                canEdit={canEdit}
              />
            ))}
          </ul>
        )}
      </section>

      {canEdit && uid !== null ? (
        <section className="flex flex-col gap-3">
          <h2 className="section-label gutter">Add water bowl</h2>
          <div className="surface p-4">
            <WaterBowlForm hid={householdId} uid={uid} />
          </div>
        </section>
      ) : null}
    </div>
  )
}

function WaterBowlRow({
  bowl,
  now,
  hid,
  uid,
  canEdit,
}: {
  bowl: WaterBowl
  now: Date
  hid: string
  uid: string | null
  canEdit: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const age = waterAge(bowl.lastChangedAt, now)

  const handleReplacedNow = () => {
    setError(null)
    awaitOrQueued(updateWaterBowl(hid, bowl.id, { lastChangedAt: new Date() })).catch(
      (err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not save.')
      },
    )
  }

  return (
    <li className="flex flex-col gap-3 px-4 py-4">
      <div className="min-w-0">
        <p className="font-medium break-words">{bowl.location}</p>
        <p className="text-2xl font-bold tracking-tight tabular-nums">
          {waterAgeLabel(age, bowl.lastChangedAt, now)}
        </p>
        <p className="text-sm text-ink-soft">{format(bowl.lastChangedAt, 'MMM d, HH:mm')}</p>
        {age.overdue ? (
          <p className="text-sm font-semibold text-danger">Time for fresh water</p>
        ) : null}
      </div>

      {canEdit && uid !== null ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={handleReplacedNow} className="btn-chip">
            Replaced now
          </button>
          <button
            type="button"
            aria-expanded={editing}
            onClick={() => {
              setEditing((open) => !open)
            }}
            className="btn-chip"
          >
            {editing ? 'Close' : 'Edit'}
          </button>
        </div>
      ) : null}

      {error === null ? null : (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      {editing && uid !== null ? (
        <WaterBowlForm
          hid={hid}
          uid={uid}
          existing={bowl}
          onDone={() => {
            setEditing(false)
          }}
        />
      ) : null}
    </li>
  )
}
