import { useQueries } from '@tanstack/react-query'
import { format, isSameDay } from 'date-fns'
import { AnimatePresence } from 'motion/react'
import { useState } from 'react'
import { roundGrams, roundKcal, roundKg } from '../lib/catmath'
import { awaitOrQueued, deletePlan, planItemsQueryOptions, type Plan } from '../lib/db'
import { planDailyKcal } from '../lib/plan'
import { StackRow } from './ListRow'

/**
 * Every plan the cat has had, newest first, with a delete × for editors.
 * Mount it only once its fold is open: it reads each plan's items.
 */
export function PlanHistory({
  hid,
  catId,
  plans,
  kcalPerGram,
  canEdit,
}: {
  hid: string
  catId: string
  plans: Plan[]
  kcalPerGram: ReadonlyMap<string, number>
  canEdit: boolean
}) {
  const [error, setError] = useState<string | null>(null)
  // One small read per plan, and only once this section is open. A cat that
  // reaches twenty on fortnightly revisions has a few hundred documents here.
  const itemQueries = useQueries({
    queries: plans.map((plan) => planItemsQueryOptions(hid, catId, plan.id)),
  })

  async function remove(plan: Plan, isCurrent: boolean): Promise<void> {
    const prompt = isCurrent
      ? 'Delete this plan and go back to the previous one?'
      : 'Delete this plan from the history?'
    if (!window.confirm(prompt)) return
    setError(null)
    try {
      await awaitOrQueued(deletePlan(hid, catId, plan.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the plan.')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <AnimatePresence initial={false}>
        {plans.map((plan, index) => {
          const items = itemQueries[index]?.data ?? []
          const until = plans[index - 1]?.effectiveFrom ?? null
          const meals = plan.mealsPerDay
          const window =
            plan.mealTimes.length > 0
              ? plan.mealTimes.join(' · ')
              : `${plan.firstMealAt}–${plan.lastMealAt}`

          return (
            <StackRow key={plan.id} order={index} gap="1rem">
              <div className="flex gap-3">
                <span
                  aria-hidden="true"
                  className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${
                    index === 0 ? 'bg-coral' : 'border-2 border-sand-deep'
                  }`}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span
                    className={`text-sm tabular-nums ${index === 0 ? 'font-semibold text-coral-ink' : 'text-ink-soft'}`}
                  >
                    {/* A plan revised the same day it was set never really ran, and
                        "24 Aug – 24 Aug" reads as a bug rather than as a same-day
                        change of mind. */}
                    {until === null
                      ? `Since ${format(plan.effectiveFrom, 'd MMM')}`
                      : isSameDay(plan.effectiveFrom, until)
                        ? `${format(plan.effectiveFrom, 'd MMM')} · replaced the same day`
                        : `${format(plan.effectiveFrom, 'd MMM')} – ${format(until, 'd MMM')}`}
                  </span>
                  <span className="font-medium tabular-nums">
                    {meals} {meals === 1 ? 'meal' : 'meals'} · {window}
                  </span>
                  {/* Balanced, so a long food name never strands "a day". */}
                  <span className="text-sm text-balance text-ink-soft tabular-nums">
                    {items.length === 0
                      ? '—'
                      : items
                          .map(
                            (item) =>
                              `${String(roundGrams(item.amountPerDayG))} g ${item.foodNameSnapshot}`,
                          )
                          .join(' + ')}{' '}
                    a day
                  </span>
                  <span className="text-sm text-ink-soft tabular-nums">
                    {roundKcal(planDailyKcal(items, kcalPerGram))} kcal
                    {plan.setAtWeightKg === null
                      ? ''
                      : ` · she was ${String(roundKg(plan.setAtWeightKg))} kg`}
                  </span>
                </div>
                {canEdit ? (
                  <button
                    type="button"
                    aria-label={
                      index === 0
                        ? 'Delete this plan and go back to the previous one'
                        : 'Delete this plan'
                    }
                    onClick={() => {
                      void remove(plan, index === 0)
                    }}
                    className="btn-icon"
                  >
                    ×
                  </button>
                ) : null}
              </div>
            </StackRow>
          )
        })}
      </AnimatePresence>
      {error === null ? null : (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
