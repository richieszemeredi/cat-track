import { useState, type ReactNode } from 'react'
import { awaitOrQueued } from '../lib/db'
import { unitNoun, type StockLevel, type StockUnit } from '../lib/stock'
import { PoppingNumber } from './AnimatedNumber'
import { Stepper } from './Stepper'

type Panel = 'bought' | 'recount' | 'edit'

/** What the two stock panels write: a purchase, or "there are exactly N". */
export type StockRecordKind = 'bought' | 'count'

/**
 * One supply on the Supplies screen — a food, or the household's litter: the
 * figure left, when it was last known for sure, a low warning, and the
 * "Bought more" / "Recount" (/ "Edit") chips whose panels open inline below,
 * one at a time.
 */
export function StockCard({
  title,
  meta,
  unit,
  stock,
  sub,
  low,
  lastBought,
  max,
  record,
  edit,
  testId,
}: {
  title: string
  meta: string | null
  unit: StockUnit
  /** null = not counted or bought yet. */
  stock: StockLevel | null
  sub: string | null
  /** The danger line, or null when there's plenty. */
  low: string | null
  /** The last purchase's size — what "Bought more" opens on. */
  lastBought: number | null
  /** The most one event may record (the rules' cap). */
  max: number
  /** Writes one stock event; null for a viewer, who sees no controls. */
  record: ((kind: StockRecordKind, amount: number) => Promise<unknown>) | null
  /** The Edit panel's content; null for no Edit chip. */
  edit: ((close: () => void) => ReactNode) | null
  testId: string
}) {
  const [panel, setPanel] = useState<Panel | null>(null)
  const [amount, setAmount] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const shown = stock?.shown ?? 0
  const plural = unitNoun(unit, 2)

  function toggle(next: Panel): void {
    setError(null)
    if (panel === next) {
      setPanel(null)
      return
    }
    // A purchase is usually the same size as the last; a recount usually
    // one nudge from the app's own estimate.
    if (next === 'bought') setAmount(lastBought ?? 1)
    if (next === 'recount') setAmount(shown)
    setPanel(next)
  }

  async function save(kind: StockRecordKind): Promise<void> {
    if (record === null) return
    setSaving(true)
    setError(null)
    try {
      // 'confirmed' and 'queued' both count as success (offline-first).
      await awaitOrQueued(record(kind, amount))
      setPanel(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save — please try again.')
    } finally {
      setSaving(false)
    }
  }

  function chip(id: Panel, label: string) {
    const open = panel === id
    return (
      <button
        type="button"
        aria-expanded={open}
        data-testid={`${testId}-${id}`}
        onClick={() => {
          toggle(id)
        }}
        className={`btn-chip ${open ? 'bg-sand' : ''}`}
      >
        {label}
      </button>
    )
  }

  const total = shown + amount

  return (
    <article data-testid={testId} className="surface flex flex-col gap-3 p-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h3 className="font-semibold">{title}</h3>
        {meta === null ? null : <p className="text-sm text-ink-soft">{meta}</p>}
      </div>

      {stock === null ? (
        <p data-testid={`${testId}-figure`} className="text-ink-soft">
          Not counted yet
        </p>
      ) : (
        <div className="flex flex-col gap-0.5">
          <p className="flex flex-wrap items-baseline gap-x-1.5">
            <span
              data-testid={`${testId}-figure`}
              className="text-2xl font-bold tracking-tight tabular-nums"
            >
              {stock.exact ? null : 'about '}
              <PoppingNumber value={stock.shown} />
            </span>
            <span className="text-ink-soft">{unitNoun(unit, stock.shown)} left</span>
          </p>
          {sub === null ? null : <p className="text-sm text-ink-soft tabular-nums">{sub}</p>}
          {/* Balanced, so a wrap never leaves "order" alone on the last line. */}
          {low === null ? null : (
            <p className="nudge text-sm font-semibold text-balance text-danger">{low}</p>
          )}
        </div>
      )}

      {record === null ? null : (
        <div className="flex flex-wrap gap-2">
          {chip('bought', 'Bought more')}
          {chip('recount', 'Recount')}
          {edit === null ? null : chip('edit', 'Edit')}
        </div>
      )}

      {record !== null && panel === 'bought' ? (
        <div className="flex flex-col gap-3 border-t border-sand pt-4">
          <Stepper
            label="How many did you buy?"
            value={amount}
            min={1}
            max={max}
            unit={plural}
            onChange={setAmount}
            testId={`${testId}-bought-amount`}
          />
          <p className="text-sm text-ink-soft tabular-nums">
            That makes {stock?.exact === true ? '' : 'about '}
            {total} {unitNoun(unit, total)}.
          </p>
          <button
            type="button"
            data-testid={`${testId}-bought-save`}
            disabled={saving}
            onClick={() => {
              void save('bought')
            }}
            className="btn-primary self-start"
          >
            Add to stock
          </button>
        </div>
      ) : null}

      {record !== null && panel === 'recount' ? (
        <div className="flex flex-col gap-3 border-t border-sand pt-4">
          <Stepper
            label={`How many ${plural} are there?`}
            value={amount}
            min={0}
            max={max}
            unit={plural}
            onChange={setAmount}
            testId={`${testId}-count-amount`}
          />
          <button
            type="button"
            data-testid={`${testId}-count-save`}
            disabled={saving}
            onClick={() => {
              void save('count')
            }}
            className="btn-primary self-start"
          >
            Save count
          </button>
        </div>
      ) : null}

      {record !== null && edit !== null && panel === 'edit' ? (
        <div className="flex flex-col gap-3 border-t border-sand pt-4">
          {edit(() => {
            setPanel(null)
          })}
        </div>
      ) : null}

      {error === null ? null : (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </article>
  )
}
