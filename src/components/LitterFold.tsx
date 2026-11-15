import { useQuery } from '@tanstack/react-query'
import { AnimatePresence } from 'motion/react'
import { useState } from 'react'
import { useAuth } from '../lib/auth'
import {
  awaitOrQueued,
  litterBoxesQueryOptions,
  replaceLitterBox,
  useLitterBoxesLive,
  type LitterBox,
  type LitterKind,
} from '../lib/db'
import { useHousehold } from '../lib/household'
import { lastSwapLine, litterAge, litterFoldSummary, nextSwapLine, weeksLabel } from '../lib/litter'
import { bagsLabel } from '../lib/stock'
import { useSupplies } from '../lib/supplies'
import { useToday } from '../lib/use-today'
import { AddDisclosure } from './AddDisclosure'
import { FoldChevron } from './FoldChevron'
import { ListRow } from './ListRow'
import { LitterBoxForm } from './LitterBoxForm'
import { SectionError, Skeleton } from './SectionStatus'

/**
 * Home's folded "Litter boxes": one line while closed, the boxes with their
 * "Replaced today" / "Edit" and the add form once open. Household-level, so
 * it sits after every cat's block. `open` is the parent's so a "Needs
 * attention" line about an overdue box can open it.
 */
export function LitterFold({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { householdId, canEdit } = useHousehold()
  const { user } = useAuth()
  const uid = user?.uid ?? null
  const { litterKinds } = useSupplies()
  const boxesQuery = useQuery(litterBoxesQueryOptions(householdId))
  useLitterBoxesLive(householdId)
  // Ages are calendar days, so the clock only needs to be right to the day —
  // and useToday moves on at midnight for a PWA left open overnight.
  const today = useToday().start

  if (boxesQuery.isLoading) return <Skeleton />
  if (boxesQuery.isError) {
    return <SectionError label={`Couldn't load litter boxes. ${boxesQuery.error.message}`} />
  }

  const boxes = boxesQuery.data ?? []
  const editable = canEdit && uid !== null
  // A viewer can't add one, so an empty fold would only be noise.
  if (boxes.length === 0 && !editable) return null

  return (
    <details
      id="litter-boxes"
      data-testid="home-litter"
      className="surface group scroll-mt-4"
      open={open}
      onToggle={(e) => {
        onOpenChange(e.currentTarget.open)
      }}
    >
      <summary
        data-testid="home-litter-summary"
        className="disclosure list-none gap-3 px-4 py-2 [&::-webkit-details-marker]:hidden"
      >
        <span className="min-w-0 flex-1 truncate">
          Litter boxes{' '}
          <span className="font-normal text-ink-soft">· {litterFoldSummary(boxes, today)}</span>
        </span>
        <FoldChevron />
      </summary>
      <div className="border-t border-sand">
        {boxes.length === 0 ? (
          <p className="px-4 pt-4 text-sm text-ink-soft">No litter boxes yet.</p>
        ) : (
          <ul className="divide-y divide-sand">
            <AnimatePresence initial={false}>
              {boxes.map((box, index) => (
                <LitterBoxRow
                  key={box.id}
                  order={index}
                  box={box}
                  today={today}
                  hid={householdId}
                  uid={uid}
                  canEdit={canEdit}
                  litters={litterKinds}
                />
              ))}
            </AnimatePresence>
          </ul>
        )}
        {editable ? (
          <AddDisclosure
            label="Add litter box"
            testId="litter-add-toggle"
            className={boxes.length === 0 ? 'px-4' : 'border-t border-sand px-4'}
            defaultOpen={boxes.length === 0}
          >
            {(close) => (
              <LitterBoxForm hid={householdId} uid={uid} litters={litterKinds} onDone={close} />
            )}
          </AddDisclosure>
        ) : null}
      </div>
    </details>
  )
}

/** One box: how long since its full clean, and the swap / edit controls. */
export function LitterBoxRow({
  order,
  box,
  today,
  hid,
  uid,
  canEdit,
  litters,
}: {
  order: number
  box: LitterBox
  today: Date
  hid: string
  uid: string | null
  canEdit: boolean
  /** The household's litter kinds, archived included. */
  litters: readonly LitterKind[]
}) {
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const age = litterAge(box.lastChangedAt, today, box.changeEveryWeeks)
  const next = nextSwapLine(box, today)

  const handleReplacedToday = () => {
    setError(null)
    if (uid === null) return
    // A swap: the date moves AND the box's bags come off the litter stock.
    awaitOrQueued(replaceLitterBox(hid, uid, box, new Date())).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Could not save.')
    })
  }

  return (
    <ListRow order={order}>
      <div className="flex flex-col gap-3 px-4 py-4">
        {/* The two dates that matter, each with how far off it is. Past due,
        the whole next-swap line turns danger — no separate warning line. */}
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="font-semibold break-words">{box.location}</p>
          <p data-testid="litter-last-swap" className="text-sm text-ink-soft tabular-nums">
            {lastSwapLine(box.lastChangedAt, today)}
          </p>
          <p
            data-testid="litter-next-swap"
            className={
              next.due
                ? 'nudge text-sm font-semibold text-danger tabular-nums'
                : 'text-sm text-ink-soft tabular-nums'
            }
          >
            {next.text}
          </p>
          <p className="text-xs text-ink-soft">
            every {weeksLabel(box.changeEveryWeeks)} · {bagsLabel(box.bagsPerSwap)} a swap
          </p>
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
            litters={litters}
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
