import { format, isValid, parse } from 'date-fns'
import { useState, type ReactNode, type SubmitEvent } from 'react'
import { useAuth } from '../lib/auth'
import { roundGrams, roundKcal } from '../lib/catmath'
import {
  addFeedings,
  awaitOrQueued,
  deleteFeedings,
  retimeFeedings,
  setMealTimeOverride,
  type Cat,
  type Feeding,
  type Plan,
  type PlanItem,
} from '../lib/db'
import { useHousehold } from '../lib/household'
import { mealComposition } from '../lib/plan'
import { type CatDay } from '../lib/use-cat-day'
import { MealTick } from './MealTick'
import { SectionError, Skeleton } from './SectionStatus'

/**
 * Today's planned bowls for one cat, one tick row each: tick / undo, the time
 * (editable), and what goes in the bowl. Renders nothing without a plan — the
 * screen around it says what to do about that.
 */
export function MealChecklist({
  cat,
  day,
  showKcal = true,
  footer,
}: {
  cat: Cat
  /** That cat's day, from `useCatDay(cat)`. */
  day: CatDay
  /** Print kcal beside the grams on each row. Home shows grams only. */
  showKcal?: boolean
  /** One extra `<li>` (or several) after the bowls, inside the same card. */
  footer?: ReactNode
}) {
  const { householdId, canEdit } = useHousehold()
  const { user } = useAuth()
  const uid = user?.uid ?? null
  const { plan, planItems, kcalPerGram, times, adjustedTimes, givenByMeal, overridesForDay } = day

  const [mealError, setMealError] = useState<string | null>(null)
  const [busyMeal, setBusyMeal] = useState<number | null>(null)

  if (plan === null) return null

  async function toggleMeal(currentPlan: Plan, mealIndex: number): Promise<void> {
    if (uid === null) return
    setMealError(null)
    setBusyMeal(mealIndex)
    try {
      const already = givenByMeal.get(mealIndex)
      if (already !== undefined && already.length > 0) {
        await awaitOrQueued(
          deleteFeedings(
            householdId,
            cat.id,
            already.map((entry) => entry.id),
          ),
        )
        return
      }

      const lines = mealComposition(currentPlan, planItems, mealIndex)
      // The tick logs the bowl's own (possibly already-shifted) due time, not
      // the moment of the tap — a quick tap after feeding her fast shouldn't
      // need a follow-up edit just to fix the time back to when it happened.
      const datetime = adjustedTimes[mealIndex] ?? day.day.start
      const inputs = lines
        .map((line) => ({
          datetime,
          foodId: line.foodId,
          foodNameSnapshot: line.name,
          amountG: roundGrams(line.grams),
          kcal: roundKcal(line.grams * (kcalPerGram.get(line.foodId) ?? 0)),
          note: null,
          planId: currentPlan.id,
          mealIndex,
        }))
        // A ramp's first step can round the incoming food down to nothing;
        // amountG must stay positive or the rules reject the whole batch.
        .filter((input) => input.amountG > 0)

      if (inputs.length === 0) {
        setMealError('That bowl works out to nothing — check the plan amounts.')
        return
      }
      // 'confirmed' and 'queued' both count as success (offline-first).
      await awaitOrQueued(addFeedings(householdId, cat.id, uid, inputs))
    } catch (err) {
      setMealError(err instanceof Error ? err.message : 'Could not update the meal.')
    } finally {
      setBusyMeal(null)
    }
  }

  // One control, two destinations. A bowl already ticked off is a logged fact,
  // so re-timing it rewrites its feedings; a bowl still owed is a plan for the
  // rest of the day, so it writes an override both phones can see — the plan
  // itself stays untouched either way.
  async function setMealTime(currentPlan: Plan, mealIndex: number, timeStr: string): Promise<void> {
    if (uid === null) return
    const datetime = parse(timeStr, 'HH:mm', day.day.start)
    if (!isValid(datetime)) {
      setMealError('Pick a valid time.')
      return
    }
    setMealError(null)
    setBusyMeal(mealIndex)
    try {
      const already = givenByMeal.get(mealIndex) ?? []
      // 'confirmed' and 'queued' both count as success (offline-first).
      if (already.length > 0) {
        await awaitOrQueued(retimeFeedings(householdId, cat.id, uid, already, datetime))
        return
      }
      await awaitOrQueued(
        setMealTimeOverride(
          householdId,
          cat.id,
          uid,
          { planId: currentPlan.id, mealIndex, overrideAt: datetime },
          overridesForDay
            .filter((entry) => entry.planId === currentPlan.id && entry.mealIndex === mealIndex)
            .map((entry) => entry.id),
        ),
      )
    } catch (err) {
      setMealError(err instanceof Error ? err.message : 'Could not update the time.')
    } finally {
      setBusyMeal(null)
    }
  }

  return (
    <>
      {day.planItemsQuery.isLoading ? (
        <Skeleton />
      ) : planItems.length === 0 ? (
        <p className="gutter text-sm text-ink-soft">
          This plan has no foods on it — edit it to add one.
        </p>
      ) : (
        <ul className="surface divide-y divide-sand">
          {times.map((time, mealIndex) => (
            <MealRow
              key={time + String(mealIndex)}
              time={time}
              adjustedAt={adjustedTimes[mealIndex] ?? day.day.start}
              mealIndex={mealIndex}
              plan={plan}
              items={planItems}
              kcalPerGram={kcalPerGram}
              given={givenByMeal.get(mealIndex) ?? []}
              busy={busyMeal === mealIndex}
              canEdit={canEdit}
              showKcal={showKcal}
              onToggle={() => {
                void toggleMeal(plan, mealIndex)
              }}
              onSetTime={(timeStr) => {
                void setMealTime(plan, mealIndex, timeStr)
              }}
            />
          ))}
          {footer}
        </ul>
      )}
      {mealError === null ? null : <SectionError label={mealError} />}
    </>
  )
}

function MealRow({
  time,
  adjustedAt,
  mealIndex,
  plan,
  items,
  kcalPerGram,
  given,
  busy,
  canEdit,
  showKcal,
  onToggle,
  onSetTime,
}: {
  /** The plan's own clock for this bowl, before today's nudges and cascades. */
  time: string
  /** When this bowl is due — or, once ticked, when it actually happened. */
  adjustedAt: Date
  mealIndex: number
  plan: Plan
  items: PlanItem[]
  kcalPerGram: ReadonlyMap<string, number>
  given: Feeding[]
  busy: boolean
  canEdit: boolean
  showKcal: boolean
  onToggle: () => void
  onSetTime: (timeStr: string) => void
}) {
  const lines = mealComposition(plan, items, mealIndex)
  const grams = lines.reduce((total, line) => total + line.grams, 0)
  const kcal = lines.reduce(
    (total, line) => total + line.grams * (kcalPerGram.get(line.foodId) ?? 0),
    0,
  )
  // A bowl of one food IS its own total, and printing both says 23 g twice per
  // row, ten times down a five-meal day. The meal total only earns its line
  // when there is more than one food to add up.
  const isSingleFood = lines.length === 1
  const isGiven = given.length > 0
  // One time per row: when the bowl happened if it has, when it is due if it
  // hasn't. Both come from adjustedAt, which already resolves to the feeding's
  // own datetime once a bowl is ticked.
  const shownTime = format(adjustedAt, 'HH:mm')
  const kcalSuffix = showKcal ? ` · ${String(roundKcal(kcal))} kcal` : ''

  const [editingTime, setEditingTime] = useState(false)
  const [timeValue, setTimeValue] = useState(shownTime)

  // The tick is the whole point of keeping a daily record: one bowl goes down,
  // and the other phone can see that it did. It is the most-used tap in the
  // app, so it gets to feel done — on the other phone too, when it lands live.
  const tick = <MealTick given={isGiven} />
  // The time fades to the same soft grey as the food lines beside the tick
  // rather than switching in a frame.
  const timeClass = `font-medium tabular-nums transition-colors duration-200 ease-squishy ${
    isGiven ? 'text-ink-soft' : ''
  }`

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      {canEdit ? (
        <button
          type="button"
          data-testid={`meal-tick-${String(mealIndex)}`}
          aria-label={isGiven ? `Undo the ${shownTime} meal` : `Mark the ${shownTime} meal given`}
          aria-pressed={isGiven}
          disabled={busy}
          onClick={onToggle}
          className="-my-1 -ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition duration-150 ease-squishy active:scale-95 disabled:opacity-60"
        >
          {tick}
        </button>
      ) : (
        <span className="-my-1 -ml-2 flex h-11 w-11 shrink-0 items-center justify-center">
          {tick}
        </span>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          {canEdit && !editingTime ? (
            <button
              type="button"
              data-testid={`meal-time-${String(mealIndex)}`}
              disabled={busy}
              onClick={() => {
                setTimeValue(shownTime)
                setEditingTime(true)
              }}
              className="-mx-2 -my-1 flex min-h-9 shrink-0 items-baseline gap-1.5 rounded px-2 py-1 active:bg-sand disabled:opacity-60"
            >
              <span className={timeClass}>{shownTime}</span>
              <span className="text-xs text-ink-soft">edit</span>
            </button>
          ) : (
            <span className={timeClass}>{shownTime}</span>
          )}
          {isSingleFood ? null : (
            <span className="shrink-0 text-sm text-ink-soft tabular-nums">
              {roundGrams(grams)} g{kcalSuffix}
            </span>
          )}
        </div>
        {/* One line per food. Two lines is what a flavour switch looks like. */}
        {lines.map((line) => (
          <div
            key={line.foodId}
            className="flex items-baseline justify-between gap-2 text-sm text-ink-soft"
          >
            <span className="min-w-0 truncate">{line.name}</span>
            <span className="shrink-0 tabular-nums">
              {roundGrams(line.grams)} g{isSingleFood ? kcalSuffix : ''}
            </span>
          </div>
        ))}
        {editingTime ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e: SubmitEvent<HTMLFormElement>) => {
              e.preventDefault()
              onSetTime(timeValue)
              setEditingTime(false)
            }}
          >
            <input
              type="time"
              required
              data-testid={`meal-time-input-${String(mealIndex)}`}
              value={timeValue}
              onChange={(e) => {
                setTimeValue(e.target.value)
              }}
              className="field w-auto"
            />
            <button
              type="submit"
              data-testid={`meal-time-save-${String(mealIndex)}`}
              className="btn-chip"
            >
              Save
            </button>
            <button
              type="button"
              className="btn-chip"
              onClick={() => {
                setEditingTime(false)
              }}
            >
              Cancel
            </button>
          </form>
        ) : shownTime === time ? null : (
          // The row leads with the time that applies today — early, late or
          // moved on purpose. This is the plan's own clock, kept as a footnote
          // so a day that ran off schedule still says what it ran off from.
          <span className="text-xs text-ink-soft">Planned {time}</span>
        )}
      </div>
    </li>
  )
}
