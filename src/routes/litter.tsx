import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { format, startOfDay } from 'date-fns'
import { useState } from 'react'
import { ErrorCard } from '../components/ErrorCard'
import { LitterBoxForm } from '../components/LitterBoxForm'
import { useAuth } from '../lib/auth'
import {
  awaitOrQueued,
  litterBoxesQueryOptions,
  updateLitterBox,
  useLitterBoxesLive,
  type LitterBox,
} from '../lib/db'
import { useHousehold } from '../lib/household'
import { LITTER_CHANGE_EVERY_WEEKS, litterAge, litterAgeLabel } from '../lib/litter'
import { useToday } from '../lib/use-today'

export const Route = createFileRoute('/litter')({
  component: LitterPage,
  errorComponent: ({ error, reset }) => <ErrorCard error={error} onRetry={reset} />,
})

function LitterPage() {
  const { householdId, canEdit } = useHousehold()
  const { user } = useAuth()
  const boxesQuery = useQuery(litterBoxesQueryOptions(householdId))
  useLitterBoxesLive(householdId)
  // Ages are calendar days, so the clock only needs to be right to the day —
  // and useToday moves on at midnight for a PWA left open overnight.
  const today = useToday().start

  const uid = user?.uid ?? null

  return (
    <main className="flex flex-col gap-7 p-4">
      <h1 className="page-title gutter">Litter</h1>

      {boxesQuery.isLoading ? (
        <div className="page-solo h-24 animate-pulse rounded-squishy bg-sand" />
      ) : boxesQuery.isError ? (
        <ErrorCard
          title="Couldn't load litter boxes"
          error={boxesQuery.error}
          onRetry={() => {
            void boxesQuery.refetch()
          }}
        />
      ) : (
        <div className="page-columns">
          {/* Where each box stands. */}
          <div className="page-column">
            <section className="flex flex-col gap-3">
              <h2 className="section-label gutter">Boxes</h2>
              {boxesQuery.data === undefined || boxesQuery.data.length === 0 ? (
                <p className="gutter text-sm text-ink-soft">No litter boxes yet.</p>
              ) : (
                <ul className="surface divide-y divide-sand">
                  {boxesQuery.data.map((box) => (
                    <LitterBoxRow
                      key={box.id}
                      box={box}
                      today={today}
                      hid={householdId}
                      uid={uid}
                      canEdit={canEdit}
                    />
                  ))}
                </ul>
              )}
              <p className="gutter text-xs text-ink-soft">
                A full clean is due every {LITTER_CHANGE_EVERY_WEEKS} weeks.
              </p>
            </section>
          </div>

          {canEdit && uid !== null ? (
            <div className="page-column">
              <section className="flex flex-col gap-3">
                <h2 className="section-label gutter">Add litter box</h2>
                <div className="surface p-4">
                  <LitterBoxForm hid={householdId} uid={uid} />
                </div>
              </section>
            </div>
          ) : null}
        </div>
      )}
    </main>
  )
}

function LitterBoxRow({
  box,
  today,
  hid,
  uid,
  canEdit,
}: {
  box: LitterBox
  today: Date
  hid: string
  uid: string | null
  canEdit: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const age = litterAge(box.lastChangedAt, today)

  const handleReplacedToday = () => {
    setError(null)
    awaitOrQueued(updateLitterBox(hid, box.id, { lastChangedAt: startOfDay(new Date()) })).catch(
      (err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not save.')
      },
    )
  }

  return (
    <li className="flex flex-col gap-3 px-4 py-4">
      <div className="min-w-0">
        <p className="font-medium break-words">{box.location}</p>
        <p className="text-2xl font-bold tracking-tight tabular-nums">{litterAgeLabel(age)}</p>
        <p className="text-sm text-ink-soft">
          {format(box.lastChangedAt, 'MMM d')}
          {age.days > 0 ? ` · ${String(age.days)} ${age.days === 1 ? 'day' : 'days'}` : null}
        </p>
        {age.overdue ? (
          <p className="text-sm font-semibold text-danger">Due for a full clean</p>
        ) : null}
      </div>

      {canEdit && uid !== null ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={age.days === 0}
            onClick={handleReplacedToday}
            className="btn-chip"
          >
            Replaced today
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
        <LitterBoxForm
          hid={hid}
          uid={uid}
          existing={box}
          onDone={() => {
            setEditing(false)
          }}
        />
      ) : null}
    </li>
  )
}
