import { format } from 'date-fns'
import { AnimatePresence } from 'motion/react'
import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { roundGrams, roundKcal } from '../lib/catmath'
import { awaitOrQueued, deleteFeeding, type Cat, type Feeding, type Food } from '../lib/db'
import { useHousehold } from '../lib/household'
import { sumGrams, sumKcal } from '../lib/target'
import { ListRow } from './ListRow'
import { LogMealForm } from './LogMealForm'
import { SectionError } from './SectionStatus'

/**
 * One cat's off-plan feedings for today — a treat, a stolen bite, a tin that
 * wasn't on the plan — each with a delete ×, plus `LogMealForm` behind an add
 * control. Typed, because by definition it isn't predictable.
 *
 * With a `heading` the add chip sits beside it in a header row and the form
 * opens above the list; without one the chip and the form follow the list
 * (for a screen that labels the section itself, e.g. inside a fold).
 */
export function OffPlanList({
  cat,
  feedings,
  foods,
  heading,
  addLabel = 'Add',
}: {
  cat: Cat
  /** That cat's off-plan feedings for today (`useCatDay(cat).offPlan`). */
  feedings: readonly Feeding[]
  /** The foods the form offers — the household's active ones. */
  foods: Food[]
  /** A section label to show above the list, with the add chip beside it. */
  heading?: string
  /** The add chip's text while the form is closed. */
  addLabel?: string
}) {
  const { householdId, canEdit } = useHousehold()
  const { user } = useAuth()
  const uid = user?.uid ?? null
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function removeFeeding(entry: Feeding): Promise<void> {
    if (!window.confirm(`Delete this meal (${entry.foodNameSnapshot})?`)) return
    setError(null)
    try {
      // 'confirmed' and 'queued' both count as success (offline-first).
      await awaitOrQueued(deleteFeeding(householdId, cat.id, entry.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the meal.')
    }
  }

  const addChip =
    canEdit && uid !== null && foods.length > 0 ? (
      <button
        type="button"
        data-testid="off-plan-open"
        onClick={() => {
          setShowForm((v) => !v)
        }}
        className={heading === undefined ? 'btn-chip self-start' : 'btn-chip'}
      >
        {showForm ? 'Close' : addLabel}
      </button>
    ) : null

  const form =
    showForm && canEdit && uid !== null ? (
      <div className="surface p-4">
        <LogMealForm hid={householdId} catId={cat.id} uid={uid} foods={foods} />
      </div>
    ) : null

  return (
    <div className="flex flex-col gap-3">
      {heading === undefined ? null : (
        <div className="gutter flex items-center justify-between gap-2">
          <h2 className="section-label">{heading}</h2>
          {addChip}
        </div>
      )}

      {heading === undefined ? null : form}

      {feedings.length === 0 ? (
        <p className="gutter text-sm text-ink-soft">Nothing off-plan today.</p>
      ) : (
        <>
          <ul className="surface divide-y divide-sand">
            <AnimatePresence initial={false}>
              {feedings.map((entry, index) => (
                <ListRow key={entry.id} order={index}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span className="text-sm text-ink-soft tabular-nums">
                      {format(entry.datetime, 'HH:mm')}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {entry.foodNameSnapshot}
                    </span>
                    <span className="shrink-0 text-sm text-ink-soft tabular-nums">
                      {roundGrams(entry.amountG)} g · {roundKcal(entry.kcal)} kcal
                    </span>
                    {canEdit ? (
                      <button
                        type="button"
                        aria-label="Delete meal"
                        onClick={() => {
                          void removeFeeding(entry)
                        }}
                        className="btn-icon"
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                </ListRow>
              ))}
            </AnimatePresence>
          </ul>
          <p className="gutter text-sm text-ink-soft tabular-nums">
            Total: {roundGrams(sumGrams(feedings))} g · {roundKcal(sumKcal(feedings))} kcal
          </p>
        </>
      )}

      {heading === undefined ? (
        <>
          {addChip}
          {form}
        </>
      ) : null}
      {error === null ? null : <SectionError label={error} />}
    </div>
  )
}
