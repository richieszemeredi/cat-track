import { useQuery } from '@tanstack/react-query'
import { format, startOfDay } from 'date-fns'
import { AnimatePresence } from 'motion/react'
import { useState } from 'react'
import { useAuth } from '../lib/auth'
import {
  awaitOrQueued,
  litterBoxesQueryOptions,
  updateLitterBox,
  useLitterBoxesLive,
  type LitterBox,
} from '../lib/db'
import { useHousehold } from '../lib/household'
import { litterAge, litterAgeLabel, weeksLabel } from '../lib/litter'
import { useToday } from '../lib/use-today'
import { AddDisclosure } from './AddDisclosure'
import { ErrorCard } from './ErrorCard'
import { ListRow } from './ListRow'
import { LitterBoxForm } from './LitterBoxForm'

/**
 * The boxs and the form that adds one: one column of the Chores page. On a
 * phone the sections simply stack; from 768pt each takes a column.
 */
export function LitterSection() {
  const { householdId, canEdit } = useHousehold()
  const { user } = useAuth()
  const boxesQuery = useQuery(litterBoxesQueryOptions(householdId))
  useLitterBoxesLive(householdId)
  // Ages are calendar days, so the clock only needs to be right to the day —
  // and useToday moves on at midnight for a PWA left open overnight.
  const today = useToday().start

  const uid = user?.uid ?? null

  if (boxesQuery.isLoading) {
    return <div className="page-solo h-24 animate-pulse rounded-squishy bg-sand" />
  }
  if (boxesQuery.isError) {
    return (
      <ErrorCard
        title="Couldn't load litter boxes"
        error={boxesQuery.error}
        onRetry={() => {
          void boxesQuery.refetch()
        }}
      />
    )
  }

  return (
    <div className="page-column">
      <section className="flex flex-col gap-3">
        <h2 className="section-label gutter">Litter boxes</h2>
        {boxesQuery.data === undefined || boxesQuery.data.length === 0 ? (
          <p className="gutter text-sm text-ink-soft">No litter boxes yet.</p>
        ) : (
          <ul className="surface divide-y divide-sand">
            <AnimatePresence initial={false}>
              {boxesQuery.data.map((box, index) => (
                <LitterBoxRow
                  key={box.id}
                  order={index}
                  box={box}
                  today={today}
                  hid={householdId}
                  uid={uid}
                  canEdit={canEdit}
                />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </section>

      {canEdit && uid !== null ? (
        <AddDisclosure
          label="Add litter box"
          testId="litter-add-toggle"
          defaultOpen={boxesQuery.data === undefined || boxesQuery.data.length === 0}
        >
          {(close) => <LitterBoxForm hid={householdId} uid={uid} onDone={close} />}
        </AddDisclosure>
      ) : null}
    </div>
  )
}

function LitterBoxRow({
  order,
  box,
  today,
  hid,
  uid,
  canEdit,
}: {
  order: number
  box: LitterBox
  today: Date
  hid: string
  uid: string | null
  canEdit: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const age = litterAge(box.lastChangedAt, today, box.changeEveryWeeks)

  const handleReplacedToday = () => {
    setError(null)
    awaitOrQueued(updateLitterBox(hid, box.id, { lastChangedAt: startOfDay(new Date()) })).catch(
      (err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not save.')
      },
    )
  }

  return (
    <ListRow order={order}>
      <div className="flex flex-col gap-3 px-4 py-4">
        <div className="min-w-0">
          <p className="font-medium break-words">{box.location}</p>
          <p className="text-2xl font-bold tracking-tight tabular-nums">{litterAgeLabel(age)}</p>
          <p className="text-sm text-ink-soft">
            {format(box.lastChangedAt, 'MMM d')}
            {age.days > 0 ? ` · ${String(age.days)} ${age.days === 1 ? 'day' : 'days'}` : null}
            {` · every ${weeksLabel(box.changeEveryWeeks)}`}
          </p>
          {age.overdue ? (
            <p className="nudge text-sm font-semibold text-danger">Due for a full clean</p>
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
      </div>
    </ListRow>
  )
}
