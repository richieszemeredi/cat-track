import { createFileRoute } from '@tanstack/react-router'
import { AnimatePresence } from 'motion/react'
import { useState } from 'react'
import { ErrorCard } from '../components/ErrorCard'
import { FoodForm } from '../components/FoodForm'
import { ListRow, StackRow } from '../components/ListRow'
import { LitterForm } from '../components/LitterForm'
import { StockCard, type StockRecordKind } from '../components/StockCard'
import { useAuth } from '../lib/auth'
import {
  addFoodStockEvent,
  addLitterStockEvent,
  awaitOrQueued,
  updateFood,
  updateLitter,
  type Food,
  type LitterKind,
} from '../lib/db'
import { useHousehold } from '../lib/household'
import { unitFor } from '../lib/stock'
import { useSupplies, type FoodSupply, type LitterKindSupply } from '../lib/supplies'
import {
  foodLowLine,
  foodMeta,
  foodSubLine,
  litterLowLine,
  litterMeta,
  litterSubLine,
} from '../lib/supply-lines'
import { useNow } from '../lib/use-now'

export const Route = createFileRoute('/supplies')({
  component: SuppliesPage,
  errorComponent: ({ error, reset }) => <ErrorCard error={error} onRetry={reset} />,
})

// The rules' caps on one stock event.
const MAX_FOOD_UNITS = 10000
const MAX_LITTER_BAGS = 1000

/** The size of the most recent purchase in a log kept oldest first. */
function lastBoughtOf<T extends { kind: string }>(
  events: readonly T[],
  amount: (event: T) => number,
): number | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]
    if (event?.kind === 'bought') return amount(event)
  }
  return null
}

function SuppliesPage() {
  const { loading, isError } = useSupplies()
  // Skeleton only for the first load: adding a food starts a new stock read,
  // and blanking the screen for it would throw away the form mid-save.
  const [ready, setReady] = useState(!loading)
  if (!loading && !ready) setReady(true)

  return (
    <main className="flex flex-col gap-7 p-4">
      <h1 className="page-title gutter">Supplies</h1>
      {isError ? (
        <p role="alert" className="gutter text-sm font-semibold text-danger">
          Couldn’t load all of your supplies — please try again.
        </p>
      ) : null}
      {ready ? (
        <div className="page-columns">
          <FoodColumn />
          <LitterColumn />
        </div>
      ) : (
        <div className="page-solo h-40 animate-pulse rounded-squishy bg-sand" />
      )}
    </main>
  )
}

function FoodColumn() {
  const { householdId: hid, canEdit } = useHousehold()
  const { user } = useAuth()
  const { foods, activeFoods, foodSupplies } = useSupplies()
  const now = useNow()
  const [adding, setAdding] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const uid = canEdit ? (user?.uid ?? null) : null
  const archivedFoods = foods.filter((f) => f.archived)

  async function setArchived(food: Food, archived: boolean): Promise<void> {
    if (archived && !window.confirm(`Archive ${food.name}? You can bring it back later.`)) return
    setError(null)
    try {
      await awaitOrQueued(updateFood(hid, food.id, { archived }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the food.')
    }
  }

  return (
    <div className="page-column">
      <section className="flex flex-col gap-3">
        <div className="gutter flex items-center justify-between gap-2">
          <h2 className="section-label">Food</h2>
          {uid === null ? null : (
            <button
              type="button"
              data-testid="supplies-add-food"
              aria-expanded={adding}
              onClick={() => {
                setAdding((v) => !v)
              }}
              className="btn-chip"
            >
              {adding ? 'Close' : 'Add food'}
            </button>
          )}
        </div>

        {adding && uid !== null ? (
          <FoodForm
            hid={hid}
            uid={uid}
            onDone={() => {
              setAdding(false)
            }}
          />
        ) : null}

        {activeFoods.length === 0 ? (
          <p className="gutter text-sm text-ink-soft">No foods yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <AnimatePresence initial={false}>
              {activeFoods.map((food, index) => {
                const supply = foodSupplies.get(food.id)
                return supply === undefined ? null : (
                  <StackRow key={food.id} order={index} gap="0.75rem">
                    <FoodCard
                      supply={supply}
                      hid={hid}
                      uid={uid}
                      now={now}
                      onArchive={() => {
                        void setArchived(food, true)
                      }}
                    />
                  </StackRow>
                )
              })}
            </AnimatePresence>
          </div>
        )}

        <ArchivedList
          items={archivedFoods}
          open={showArchived}
          onToggle={() => {
            setShowArchived((v) => !v)
          }}
          onUnarchive={
            uid === null
              ? null
              : (food) => {
                  void setArchived(food, false)
                }
          }
        />

        {error === null ? null : (
          <p role="alert" className="gutter text-sm font-semibold text-danger">
            {error}
          </p>
        )}
      </section>
    </div>
  )
}

function FoodCard({
  supply,
  hid,
  uid,
  now,
  onArchive,
}: {
  supply: FoodSupply
  hid: string
  /** null for a viewer: no controls. */
  uid: string | null
  now: Date
  onArchive: () => void
}) {
  const { food, events, state } = supply
  return (
    <StockCard
      testId="food-supply"
      title={food.name}
      meta={foodMeta(food)}
      unit={unitFor(food)}
      stock={state.stock}
      sub={foodSubLine(food, state, now)}
      low={foodLowLine(state)}
      lastBought={lastBoughtOf(events, (e) => e.units)}
      max={MAX_FOOD_UNITS}
      record={
        uid === null
          ? null
          : (kind: StockRecordKind, units: number) =>
              addFoodStockEvent(hid, food.id, uid, { kind, units, at: new Date() })
      }
      edit={
        uid === null
          ? null
          : (close) => (
              <>
                <FoodForm hid={hid} uid={uid} existing={food} onDone={close} />
                <button type="button" onClick={onArchive} className="btn-chip self-start">
                  Archive
                </button>
              </>
            )
      }
    />
  )
}

function LitterColumn() {
  const { householdId: hid, canEdit } = useHousehold()
  const { user } = useAuth()
  const { litterKinds, litters } = useSupplies()
  const now = useNow()
  const [adding, setAdding] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const uid = canEdit ? (user?.uid ?? null) : null
  const archivedKinds = litterKinds.filter((l) => l.archived)

  async function setArchived(litter: LitterKind, archived: boolean): Promise<void> {
    if (archived && !window.confirm(`Archive ${litter.name}? You can bring it back later.`)) return
    setError(null)
    try {
      await awaitOrQueued(updateLitter(hid, litter.id, { archived }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the litter.')
    }
  }

  return (
    <div className="page-column">
      <section className="flex flex-col gap-3">
        <div className="gutter flex items-center justify-between gap-2">
          <h2 className="section-label">Litter</h2>
          {uid === null ? null : (
            <button
              type="button"
              data-testid="supplies-add-litter"
              aria-expanded={adding}
              onClick={() => {
                setAdding((v) => !v)
              }}
              className="btn-chip"
            >
              {adding ? 'Close' : 'Add litter'}
            </button>
          )}
        </div>

        {adding && uid !== null ? (
          <LitterForm
            hid={hid}
            uid={uid}
            onDone={() => {
              setAdding(false)
            }}
          />
        ) : null}

        {litters.length === 0 ? (
          <p className="gutter text-sm text-ink-soft">No litter added yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <AnimatePresence initial={false}>
              {litters.map((supply, index) => (
                <StackRow key={supply.litter.id} order={index} gap="0.75rem">
                  <LitterCard
                    supply={supply}
                    hid={hid}
                    uid={uid}
                    now={now}
                    onArchive={() => {
                      void setArchived(supply.litter, true)
                    }}
                  />
                </StackRow>
              ))}
            </AnimatePresence>
          </div>
        )}

        <ArchivedList
          items={archivedKinds}
          open={showArchived}
          onToggle={() => {
            setShowArchived((v) => !v)
          }}
          onUnarchive={
            uid === null
              ? null
              : (litter) => {
                  void setArchived(litter, false)
                }
          }
        />

        {error === null ? null : (
          <p role="alert" className="gutter text-sm font-semibold text-danger">
            {error}
          </p>
        )}

        <p className="gutter text-sm text-ink-soft">
          A full swap takes its box’s bags off. Top-ups aren’t counted — recount now and then.
        </p>
      </section>
    </div>
  )
}

function LitterCard({
  supply,
  hid,
  uid,
  now,
  onArchive,
}: {
  supply: LitterKindSupply
  hid: string
  /** null for a viewer: no controls. */
  uid: string | null
  now: Date
  onArchive: () => void
}) {
  const { litter, events, boxes, state } = supply
  return (
    <StockCard
      testId="litter-supply"
      title={litter.name}
      meta={litterMeta(litter, boxes)}
      unit="bag"
      stock={state.stock}
      sub={litterSubLine(state, now)}
      low={litterLowLine(state)}
      lastBought={lastBoughtOf(events, (e) => e.bags)}
      max={MAX_LITTER_BAGS}
      record={
        uid === null
          ? null
          : (kind: StockRecordKind, bags: number) =>
              addLitterStockEvent(hid, uid, { litterId: litter.id, kind, bags, at: new Date() })
      }
      edit={
        uid === null
          ? null
          : (close) => (
              <>
                <LitterForm hid={hid} uid={uid} existing={litter} onDone={close} />
                <button type="button" onClick={onArchive} className="btn-chip self-start">
                  Archive
                </button>
              </>
            )
      }
    />
  )
}

/**
 * "Show archived (n)" and, opened, the archived entries of a catalog — each
 * with "Unarchive" for an editor. Nothing at all while none are archived.
 */
function ArchivedList<T extends { id: string; name: string }>({
  items,
  open,
  onToggle,
  onUnarchive,
}: {
  items: readonly T[]
  open: boolean
  onToggle: () => void
  /** null for a viewer: no controls. */
  onUnarchive: ((item: T) => void) | null
}) {
  if (items.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="gutter min-h-10 self-start text-sm font-semibold text-coral-ink underline underline-offset-2"
      >
        {open ? 'Hide archived' : `Show archived (${String(items.length)})`}
      </button>
      {open ? (
        <ul className="surface divide-y divide-sand">
          <AnimatePresence initial={false}>
            {items.map((item, index) => (
              <ListRow key={item.id} order={index}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">{item.name}</span>
                  {onUnarchive === null ? null : (
                    <button
                      type="button"
                      onClick={() => {
                        onUnarchive(item)
                      }}
                      className="btn-chip"
                    >
                      Unarchive
                    </button>
                  )}
                </div>
              </ListRow>
            ))}
          </AnimatePresence>
        </ul>
      ) : null}
    </div>
  )
}
