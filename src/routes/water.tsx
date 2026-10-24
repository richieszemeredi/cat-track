import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { format } from 'date-fns'
import { useState } from 'react'
import { ErrorCard } from '../components/ErrorCard'
import { WaterBowlForm } from '../components/WaterBowlForm'
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

export const Route = createFileRoute('/water')({
  component: WaterPage,
  errorComponent: ({ error, reset }) => <ErrorCard error={error} onRetry={reset} />,
})

function WaterPage() {
  const { householdId, canEdit } = useHousehold()
  const { user } = useAuth()
  const bowlsQuery = useQuery(waterBowlsQueryOptions(householdId))
  useWaterBowlsLive(householdId)
  const now = useNow()

  const uid = user?.uid ?? null

  return (
    <main className="flex flex-col gap-7 p-4">
      <h1 className="page-title gutter">Water</h1>

      {bowlsQuery.isLoading ? (
        <div className="page-solo h-24 animate-pulse rounded-squishy bg-sand" />
      ) : bowlsQuery.isError ? (
        <ErrorCard
          title="Couldn't load water bowls"
          error={bowlsQuery.error}
          onRetry={() => {
            void bowlsQuery.refetch()
          }}
        />
      ) : (
        <div className="page-columns">
          {/* Where each bowl stands. */}
          <div className="page-column">
            <section className="flex flex-col gap-3">
              <h2 className="section-label gutter">Bowls</h2>
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
          </div>

          {canEdit && uid !== null ? (
            <div className="page-column">
              <section className="flex flex-col gap-3">
                <h2 className="section-label gutter">Add water bowl</h2>
                <div className="surface p-4">
                  <WaterBowlForm hid={householdId} uid={uid} />
                </div>
              </section>
            </div>
          ) : null}
        </div>
      )}
    </main>
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
