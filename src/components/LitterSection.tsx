import { useQuery } from '@tanstack/react-query'
import { AnimatePresence } from 'motion/react'
import { useAuth } from '../lib/auth'
import { litterBoxesQueryOptions, useLitterBoxesLive } from '../lib/db'
import { useHousehold } from '../lib/household'
import { useToday } from '../lib/use-today'
import { AddDisclosure } from './AddDisclosure'
import { ErrorCard } from './ErrorCard'
import { LitterBoxForm } from './LitterBoxForm'
import { LitterBoxRow } from './LitterFold'

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
