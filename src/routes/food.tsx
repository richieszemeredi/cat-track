import { useQueries, useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { format, isSameDay } from 'date-fns'
import { useState } from 'react'
import { ErrorCard } from '../components/ErrorCard'
import { FoodForm } from '../components/FoodForm'
import { LogMealForm } from '../components/LogMealForm'
import { PlanForm } from '../components/PlanForm'
import { useAuth } from '../lib/auth'
import {
  LIFE_STAGE_LABELS,
  MER_MULTIPLIERS,
  mer,
  rer,
  roundGrams,
  roundKcal,
  roundKg,
} from '../lib/catmath'
import {
  addFeedings,
  awaitOrQueued,
  deleteFeeding,
  deleteFeedings,
  deletePlan,
  feedingsForDayQueryOptions,
  foodsQueryOptions,
  planItemsQueryOptions,
  plansQueryOptions,
  updateFood,
  useFeedingsForDayLive,
  useFoodsLive,
  usePlanItemsLive,
  usePlansLive,
  useWeightsLive,
  weightsQueryOptions,
  type Cat,
  type Feeding,
  type Food,
  type Plan,
  type PlanItem,
} from '../lib/db'
import { useHousehold } from '../lib/household'
import {
  isOutgrown,
  mealComposition,
  mealTimes,
  planDailyGrams,
  planDailyKcal,
  planTargetRatio,
  scaleItemsToTarget,
} from '../lib/plan'
import { type FoodType } from '../lib/schemas'
import { dailyKcalTarget, effectiveLifeStage, sumGrams, sumKcal } from '../lib/target'
import { useToday } from '../lib/use-today'

export const Route = createFileRoute('/food')({
  component: FoodPage,
  errorComponent: ({ error, reset }) => <ErrorCard error={error} onRetry={reset} />,
})

const DISCLAIMER = 'Estimates only — always confirm with your vet.'

function Skeleton() {
  return <div className="h-16 animate-pulse rounded-squishy bg-sand" />
}

function SectionError({ label }: { label: string }) {
  return (
    <p role="alert" className="gutter text-sm font-semibold text-danger">
      {label}
    </p>
  )
}

function FoodPage() {
  const { activeCat, catsLoading } = useHousehold()

  if (catsLoading) {
    return (
      <main className="flex flex-col gap-6 p-4">
        <h1 className="page-title gutter">Food</h1>
        <Skeleton />
      </main>
    )
  }

  if (activeCat === null) {
    return (
      <main className="flex flex-col gap-6 p-4">
        <h1 className="page-title gutter">Food</h1>
        <div className="surface flex flex-col items-start gap-3 p-5">
          <p className="font-semibold">No cat set up yet.</p>
          <Link to="/profile" className="btn-primary">
            Add your cat
          </Link>
        </div>
      </main>
    )
  }

  return <FoodContent cat={activeCat} />
}

function FoodContent({ cat }: { cat: Cat }) {
  const { householdId, canEdit } = useHousehold()
  const { user } = useAuth()
  const uid = user?.uid ?? null
  const day = useToday()
  const now = new Date()

  const weightsQuery = useQuery(weightsQueryOptions(householdId, cat.id))
  useWeightsLive(householdId, cat.id)
  const foodsQuery = useQuery(foodsQueryOptions(householdId, cat.id))
  useFoodsLive(householdId, cat.id)
  const feedingsQuery = useQuery(
    feedingsForDayQueryOptions(householdId, cat.id, day.start, day.end),
  )
  useFeedingsForDayLive(householdId, cat.id, day.start, day.end)
  const plansQuery = useQuery(plansQueryOptions(householdId, cat.id))
  usePlansLive(householdId, cat.id)

  const plans = plansQuery.data ?? []
  // Plans come back newest first and are never edited, so [0] is the one in
  // force and everything after it is history.
  const plan = plans[0] ?? null
  const planItemsQuery = useQuery({
    ...planItemsQueryOptions(householdId, cat.id, plan?.id ?? '__none__'),
    enabled: plan !== null,
  })
  usePlanItemsLive(householdId, cat.id, plan?.id ?? null)

  const [editingPlan, setEditingPlan] = useState(false)
  const [showOffPlanForm, setShowOffPlanForm] = useState(false)
  const [showAddFood, setShowAddFood] = useState(false)
  const [editingFoodId, setEditingFoodId] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [mealError, setMealError] = useState<string | null>(null)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [busyMeal, setBusyMeal] = useState<number | null>(null)

  const latestWeightKg = weightsQuery.data?.at(-1)?.weightKg ?? null
  const target = dailyKcalTarget(cat, latestWeightKg, now)
  const feedings = feedingsQuery.data ?? []
  const foods = foodsQuery.data ?? []
  const activeFoods = foods.filter((f) => !f.archived)
  const archivedFoods = foods.filter((f) => f.archived)
  const planItems = plan === null ? [] : (planItemsQuery.data ?? [])

  const kcalPerGram = new Map(foods.map((food) => [food.id, food.kcalPerGram]))
  const times = plan === null ? [] : mealTimes(plan.mealsPerDay, plan.firstMealAt, plan.lastMealAt)
  const planDailyKcalValue = planDailyKcal(planItems, kcalPerGram)
  const ratio = planTargetRatio(planDailyKcalValue, target)

  // A feeding belongs to a planned bowl only if it names THIS plan — a tick
  // left over from yesterday's plan must not mark today's bowl as given.
  const givenByMeal = new Map<number, Feeding[]>()
  const offPlan: Feeding[] = []
  for (const feeding of feedings) {
    if (plan !== null && feeding.planId === plan.id && feeding.mealIndex !== null) {
      const existing = givenByMeal.get(feeding.mealIndex) ?? []
      givenByMeal.set(feeding.mealIndex, [...existing, feeding])
    } else {
      offPlan.push(feeding)
    }
  }
  const givenCount = [...givenByMeal.keys()].filter((index) => index < times.length).length
  const eatenKcal = sumKcal(feedings)

  async function toggleMeal(mealIndex: number): Promise<void> {
    if (plan === null || uid === null) return
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

      const lines = mealComposition(
        { mealsPerDay: plan.mealsPerDay, transition: plan.transition },
        planItems,
        day.start,
        mealIndex,
      )
      const inputs = lines
        .map((line) => ({
          datetime: new Date(),
          foodId: line.foodId,
          foodNameSnapshot: line.name,
          amountG: roundGrams(line.grams),
          kcal: roundKcal(line.grams * (kcalPerGram.get(line.foodId) ?? 0)),
          note: null,
          planId: plan.id,
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

  async function removeFeeding(entry: Feeding): Promise<void> {
    if (!window.confirm(`Delete this meal (${entry.foodNameSnapshot})?`)) return
    setMealError(null)
    try {
      // 'confirmed' and 'queued' both count as success (offline-first).
      await awaitOrQueued(deleteFeeding(householdId, cat.id, entry.id))
    } catch (err) {
      setMealError(err instanceof Error ? err.message : 'Could not delete the meal.')
    }
  }

  async function setFoodArchived(food: Food, archived: boolean): Promise<void> {
    if (archived && !window.confirm(`Archive ${food.name}? You can bring it back later.`)) return
    setCatalogError(null)
    try {
      await awaitOrQueued(updateFood(householdId, cat.id, food.id, { archived }))
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : 'Could not update the food.')
    }
  }

  if (editingPlan && canEdit && uid !== null) {
    return (
      <main className="flex flex-col gap-7 p-4">
        <h1 className="page-title gutter">{plan === null ? 'Set her plan' : 'Edit plan'}</h1>
        <div className="gutter">
          <PlanForm
            hid={householdId}
            catId={cat.id}
            uid={uid}
            foods={activeFoods}
            currentPlan={plan}
            currentItems={planItems}
            latestWeightKg={latestWeightKg}
            targetKcal={target}
            onDone={() => {
              setEditingPlan(false)
            }}
          />
        </div>
      </main>
    )
  }

  return (
    <main className="flex flex-col gap-7 p-4">
      <h1 className="page-title gutter">Food</h1>

      {/* 1. Progress through today's plan — the one figure this screen leads
          with. Not calories: with a fixed regimen the only thing that changes
          during a day is which bowl is still owed. */}
      <section className="gutter flex flex-col gap-3">
        <h2 className="section-label">Today</h2>
        {plansQuery.isLoading || feedingsQuery.isLoading ? (
          <Skeleton />
        ) : plansQuery.isError || feedingsQuery.isError ? (
          <SectionError label="Couldn't load today — please try again." />
        ) : plan === null ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink-soft">
              No feeding plan yet. Set how many meals she gets, when, and how much a day — the app
              works out the rest.
            </p>
            {canEdit && uid !== null ? (
              <button
                type="button"
                data-testid="plan-setup"
                onClick={() => {
                  setEditingPlan(true)
                }}
                className="btn-primary self-start"
              >
                Set her plan
              </button>
            ) : null}
          </div>
        ) : (
          <TodayProgress
            given={givenCount}
            total={times.length}
            eatenKcal={eatenKcal}
            planKcal={planDailyKcalValue}
          />
        )}
      </section>

      {/* 1b. A kitten outgrows a plan on her own, without anyone editing
          anything — this is the only thing the app knows that you don't. */}
      {plan !== null && target !== null && isOutgrown(planDailyKcalValue, target) ? (
        <OutgrownNudge
          plan={plan}
          items={planItems}
          kcalPerGram={kcalPerGram}
          dailyKcal={planDailyKcalValue}
          targetKcal={target}
          latestWeightKg={latestWeightKg}
          canEdit={canEdit}
          onBump={() => {
            setEditingPlan(true)
          }}
        />
      ) : null}

      {/* 2. Today's plan as a checklist. One tap per bowl. */}
      {plan !== null ? (
        <section className="flex flex-col gap-3">
          <div className="gutter flex items-center justify-between gap-2">
            <h2 className="section-label">Today&apos;s plan</h2>
            {canEdit && uid !== null ? (
              <button
                type="button"
                data-testid="plan-edit"
                onClick={() => {
                  setEditingPlan(true)
                }}
                className="btn-chip"
              >
                Edit plan
              </button>
            ) : null}
          </div>

          {planItemsQuery.isLoading ? (
            <Skeleton />
          ) : planItems.length === 0 ? (
            <p className="gutter text-sm text-ink-soft">
              This plan has no foods on it — edit it to add one.
            </p>
          ) : (
            <>
              <ul className="surface divide-y divide-sand">
                {times.map((time, mealIndex) => (
                  <MealRow
                    key={time + String(mealIndex)}
                    time={time}
                    mealIndex={mealIndex}
                    plan={plan}
                    items={planItems}
                    kcalPerGram={kcalPerGram}
                    day={day.start}
                    given={givenByMeal.get(mealIndex) ?? []}
                    busy={busyMeal === mealIndex}
                    canEdit={canEdit}
                    onToggle={() => {
                      void toggleMeal(mealIndex)
                    }}
                  />
                ))}
                <li className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="text-sm text-ink-soft tabular-nums">
                    {roundGrams(planDailyGrams(planItems))} g · {roundKcal(planDailyKcalValue)} kcal
                    a day
                  </span>
                  {ratio === null ? null : (
                    <span
                      data-testid="plan-ratio"
                      className={`text-sm font-semibold tabular-nums ${
                        isOutgrown(planDailyKcalValue, target) ? 'text-coral-ink' : 'text-positive'
                      }`}
                    >
                      {Math.round(ratio * 100)}% of target
                    </span>
                  )}
                </li>
              </ul>
              {plan.transition === null ? null : (
                <p className="gutter text-sm text-ink-soft">
                  Switching from {plan.transition.fromFoodNameSnapshot} over {plan.transition.steps}{' '}
                  {plan.transition.unit === 'day' ? 'days' : 'meals'}, from{' '}
                  {format(plan.transition.startedOn, 'd MMM')}.
                </p>
              )}
            </>
          )}
          {mealError === null ? null : <SectionError label={mealError} />}
        </section>
      ) : null}

      {/* 3. Anything off-plan: a treat, a stolen bite, a tin that wasn't on
          the plan. Typed, because by definition it isn't predictable. */}
      <section className="flex flex-col gap-3">
        <div className="gutter flex items-center justify-between gap-2">
          <h2 className="section-label">Anything else</h2>
          {canEdit && uid !== null && activeFoods.length > 0 ? (
            <button
              type="button"
              data-testid="off-plan-open"
              onClick={() => {
                setShowOffPlanForm((v) => !v)
              }}
              className="btn-chip"
            >
              {showOffPlanForm ? 'Close' : 'Add'}
            </button>
          ) : null}
        </div>

        {showOffPlanForm && canEdit && uid !== null ? (
          <div className="surface p-4">
            <LogMealForm hid={householdId} catId={cat.id} uid={uid} foods={activeFoods} />
          </div>
        ) : null}

        {offPlan.length === 0 ? (
          <p className="gutter text-sm text-ink-soft">Nothing off-plan today.</p>
        ) : (
          <>
            <ul className="surface divide-y divide-sand">
              {offPlan.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 px-4 py-3">
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
                </li>
              ))}
            </ul>
            <p className="gutter text-sm text-ink-soft tabular-nums">
              Total: {roundGrams(sumGrams(offPlan))} g · {roundKcal(sumKcal(offPlan))} kcal
            </p>
          </>
        )}
      </section>

      {/* 4. Food catalog */}
      <section className="flex flex-col gap-3">
        <div className="gutter flex items-center justify-between gap-2">
          <h2 className="section-label">Food catalog</h2>
          {canEdit && uid !== null ? (
            <button
              type="button"
              data-testid="food-add-open"
              onClick={() => {
                setShowAddFood((v) => !v)
              }}
              className="btn-chip"
            >
              {showAddFood ? 'Close' : 'Add food'}
            </button>
          ) : null}
        </div>

        {showAddFood && canEdit && uid !== null ? (
          <FoodForm
            hid={householdId}
            catId={cat.id}
            uid={uid}
            onDone={() => {
              setShowAddFood(false)
            }}
          />
        ) : null}

        {foodsQuery.isLoading ? (
          <Skeleton />
        ) : foodsQuery.isError ? (
          <SectionError label="Couldn't load your foods — please try again." />
        ) : activeFoods.length === 0 ? (
          <p className="gutter text-sm text-ink-soft">
            No foods yet — add one before setting her plan.
          </p>
        ) : (
          <ul className="surface divide-y divide-sand">
            {activeFoods.map((food) => (
              <li key={food.id} className="flex flex-col gap-3 p-4">
                {/* Actions sit on their own row rather than beside the text:
                    squeezed next to two chips, a real food name wrapped onto
                    three lines and the energy figures broke mid-unit. */}
                <div className="flex flex-col gap-3">
                  {/* Name, then one metadata line. The type used to be an
                      inline pill after the name, which orphaned onto a line of
                      its own as soon as the name wrapped. */}
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="font-semibold">{food.name}</p>
                    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-ink-soft">
                      <TypeBadge type={food.type} />
                      {food.brand === null || food.brand === '' ? null : <span>{food.brand}</span>}
                    </p>
                    {/* Each figure stays whole: "100 g" wrapped mid-unit on a
                        375pt screen. */}
                    <p className="text-sm text-ink-soft tabular-nums">
                      <span className="whitespace-nowrap">{food.kcalPerGram} kcal/g</span> ·{' '}
                      <span className="whitespace-nowrap">
                        {roundKcal(food.kcalPerGram * 100)} kcal / 100 g
                      </span>
                    </p>
                  </div>
                  {canEdit && uid !== null ? (
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingFoodId((prev) => (prev === food.id ? null : food.id))
                        }}
                        className="btn-chip"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void setFoodArchived(food, true)
                        }}
                        className="btn-chip"
                      >
                        Archive
                      </button>
                    </div>
                  ) : null}
                </div>
                {editingFoodId === food.id && canEdit && uid !== null ? (
                  <FoodForm
                    hid={householdId}
                    catId={cat.id}
                    uid={uid}
                    existing={food}
                    onDone={() => {
                      setEditingFoodId(null)
                    }}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {archivedFoods.length > 0 ? (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                setShowArchived((v) => !v)
              }}
              className="gutter self-start text-sm font-semibold text-coral-ink underline underline-offset-2"
            >
              {showArchived ? 'Hide archived' : `Show archived (${String(archivedFoods.length)})`}
            </button>
            {showArchived ? (
              <ul className="surface divide-y divide-sand">
                {archivedFoods.map((food) => (
                  <li key={food.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">
                      {food.name}
                    </span>
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => {
                          void setFoodArchived(food, false)
                        }}
                        className="btn-chip"
                      >
                        Unarchive
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {catalogError === null ? null : <SectionError label={catalogError} />}
      </section>

      {/* 5. What she has been eating. Folded away, and its reads only happen
          once it is opened. */}
      {plans.length > 1 ? (
        <details
          className="surface px-4"
          onToggle={(e) => {
            setHistoryOpen(e.currentTarget.open)
          }}
        >
          <summary className="disclosure">Plan history</summary>
          <div className="pb-4">
            {historyOpen ? (
              <PlanHistory
                hid={householdId}
                catId={cat.id}
                plans={plans}
                kcalPerGram={kcalPerGram}
                canEdit={canEdit}
              />
            ) : null}
          </div>
        </details>
      ) : null}

      {/* 6. RER / MER explainer — reference material, folded away by default */}
      <details className="surface px-4">
        <summary className="disclosure">How the target works</summary>
        <div className="flex flex-col gap-2 pb-4">
          {weightsQuery.isLoading ? (
            <Skeleton />
          ) : (
            <RerMerMath cat={cat} latestWeightKg={latestWeightKg} now={now} />
          )}
          <p className="text-xs text-ink-soft">{DISCLAIMER}</p>
        </div>
      </details>
    </main>
  )
}

function TodayProgress({
  given,
  total,
  eatenKcal,
  planKcal,
}: {
  given: number
  total: number
  eatenKcal: number
  planKcal: number
}) {
  const pct = total === 0 ? 0 : Math.min(100, (given / total) * 100)
  const left = total - given

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-baseline gap-2">
        <span data-testid="today-meals" className="text-5xl font-bold tracking-tight tabular-nums">
          {given} of {total}
        </span>
        <span className="text-lg text-ink-soft">meals given</span>
      </p>
      <div
        role="progressbar"
        aria-label="Meals given today"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={given}
        className="h-2 w-full overflow-hidden rounded-full bg-sand"
      >
        <div className="h-full rounded-full bg-coral" style={{ width: `${String(pct)}%` }} />
      </div>
      <p data-testid="today-kcal" className="text-sm text-ink-soft tabular-nums">
        {roundKcal(eatenKcal)} of {roundKcal(planKcal)} kcal
        {left > 0 ? ` · ${String(left)} ${left === 1 ? 'bowl' : 'bowls'} left` : ' · all done'}
      </p>
    </div>
  )
}

function OutgrownNudge({
  plan,
  items,
  kcalPerGram,
  dailyKcal,
  targetKcal,
  latestWeightKg,
  canEdit,
  onBump,
}: {
  plan: Plan
  items: PlanItem[]
  kcalPerGram: ReadonlyMap<string, number>
  dailyKcal: number
  targetKcal: number
  latestWeightKg: number | null
  canEdit: boolean
  onBump: () => void
}) {
  if (items.length === 0) return null

  const suggested = scaleItemsToTarget(items, kcalPerGram, targetKcal, plan.mealsPerDay)
  const share = Math.round((dailyKcal / targetKcal) * 100)

  return (
    <section
      data-testid="plan-outgrown"
      className="gutter mx-4 flex flex-col gap-3 rounded-squishy bg-coral-soft p-4"
    >
      <h2 className="section-label text-coral-ink">
        {share < 100 ? "She's outgrown this plan" : 'This plan is over her target'}
      </h2>
      <p className="text-base">
        {plan.setAtWeightKg === null || latestWeightKg === null
          ? `This plan covers about ${String(share)}% of what she needs now.`
          : `She was ${String(roundKg(plan.setAtWeightKg))} kg when you set this plan and she's ${String(roundKg(latestWeightKg))} kg now. ${String(roundKcal(dailyKcal))} kcal a day covers about ${String(share)}% of what she needs.`}
      </p>
      {suggested === null ? null : (
        <p className="text-sm text-ink-soft tabular-nums">
          {suggested
            .map((item) => `${String(roundGrams(item.amountPerDayG))} g ${item.foodNameSnapshot}`)
            .join(' + ')}{' '}
          a day would put her back on target at {roundKcal(targetKcal)} kcal.
        </p>
      )}
      {canEdit ? (
        <button type="button" onClick={onBump} className="btn-primary self-start">
          Adjust the plan
        </button>
      ) : null}
    </section>
  )
}

function MealRow({
  time,
  mealIndex,
  plan,
  items,
  kcalPerGram,
  day,
  given,
  busy,
  canEdit,
  onToggle,
}: {
  time: string
  mealIndex: number
  plan: Plan
  items: PlanItem[]
  kcalPerGram: ReadonlyMap<string, number>
  day: Date
  given: Feeding[]
  busy: boolean
  canEdit: boolean
  onToggle: () => void
}) {
  const lines = mealComposition(
    { mealsPerDay: plan.mealsPerDay, transition: plan.transition },
    items,
    day,
    mealIndex,
  )
  const grams = lines.reduce((total, line) => total + line.grams, 0)
  const kcal = lines.reduce(
    (total, line) => total + line.grams * (kcalPerGram.get(line.foodId) ?? 0),
    0,
  )
  const isGiven = given.length > 0
  const by = given[0]

  // The tick is the whole point of keeping a daily record: one bowl goes down,
  // and the other phone can see that it did.
  const tick = (
    <span
      aria-hidden="true"
      className={`flex h-7 w-7 items-center justify-center rounded-full ${
        isGiven ? 'bg-coral' : 'border-2 border-sand-deep'
      }`}
    >
      {isGiven ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M20 6 9 17l-5-5"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </span>
  )

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      {canEdit ? (
        <button
          type="button"
          data-testid={`meal-tick-${String(mealIndex)}`}
          aria-label={isGiven ? `Undo the ${time} meal` : `Mark the ${time} meal given`}
          aria-pressed={isGiven}
          disabled={busy}
          onClick={onToggle}
          className="-my-1 -ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full active:scale-95 disabled:opacity-60"
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
          <span className={`font-medium tabular-nums ${isGiven ? 'text-ink-soft' : ''}`}>
            {time}
          </span>
          <span className="shrink-0 text-sm text-ink-soft tabular-nums">
            {roundGrams(grams)} g · {roundKcal(kcal)} kcal
          </span>
        </div>
        {/* One line per food. Two lines is what a flavour switch looks like. */}
        {lines.map((line) => (
          <div
            key={line.foodId}
            className="flex items-baseline justify-between gap-2 text-sm text-ink-soft"
          >
            <span className="min-w-0 truncate">{line.name}</span>
            <span className="shrink-0 tabular-nums">{roundGrams(line.grams)} g</span>
          </div>
        ))}
        {isGiven && by !== undefined ? (
          <span className="text-xs text-ink-soft">Given {format(by.datetime, 'HH:mm')}</span>
        ) : null}
      </div>
    </li>
  )
}

function PlanHistory({
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

  async function remove(plan: Plan): Promise<void> {
    if (!window.confirm('Delete this plan from the history?')) return
    setError(null)
    try {
      await awaitOrQueued(deletePlan(hid, catId, plan.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the plan.')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {plans.map((plan, index) => {
        const items = itemQueries[index]?.data ?? []
        const until = plans[index - 1]?.effectiveFrom ?? null
        const meals = plan.mealsPerDay
        const window = `${plan.firstMealAt}–${plan.lastMealAt}`

        return (
          <div key={plan.id} className="flex gap-3">
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
              <span className="text-sm text-ink-soft tabular-nums">
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
            {canEdit && index > 0 ? (
              <button
                type="button"
                aria-label="Delete this plan"
                onClick={() => {
                  void remove(plan)
                }}
                className="btn-icon"
              >
                ×
              </button>
            ) : null}
          </div>
        )
      })}
      {error === null ? null : (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

function RerMerMath({
  cat,
  latestWeightKg,
  now,
}: {
  cat: Cat
  latestWeightKg: number | null
  now: Date
}) {
  const stage = effectiveLifeStage(cat, now)
  const multiplier = cat.merMultiplierOverride ?? MER_MULTIPLIERS[stage]

  if (latestWeightKg === null) {
    return (
      <p className="text-sm text-ink-soft">
        Once you log a weight, the resting (RER) and daily (MER) calorie math shows up here.
      </p>
    )
  }

  const merValue = mer({
    weightKg: latestWeightKg,
    lifeStage: stage,
    idealWeightKg: cat.idealWeightKg,
    merMultiplierOverride: cat.merMultiplierOverride,
  })

  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm">
        <span className="font-semibold">RER</span> (resting) = 70 × kg
        <sup aria-hidden="true">0.75</sup> ≈{' '}
        <span className="font-semibold">{roundKcal(rer(latestWeightKg))} kcal/day</span> at{' '}
        {roundKg(latestWeightKg)} kg
      </p>
      <p className="text-sm">
        <span className="font-semibold">MER</span> (daily target) = {multiplier} × RER ≈{' '}
        <span className="font-semibold">{roundKcal(merValue)} kcal/day</span> —{' '}
        {LIFE_STAGE_LABELS[stage]}
      </p>
      {stage === 'weight_loss' && cat.idealWeightKg !== null ? (
        <p className="text-xs text-ink-soft">
          For weight loss the RER is based on the ideal weight ({roundKg(cat.idealWeightKg)} kg).
        </p>
      ) : null}
    </div>
  )
}

const FOOD_TYPE_LABEL: Record<FoodType, string> = {
  dry: 'Dry',
  wet: 'Wet',
  treat: 'Treat',
}

/** Food type reads as a quiet outlined tag — colour is reserved for meaning. */
function TypeBadge({ type }: { type: FoodType }) {
  return (
    <span className="shrink-0 rounded-full border border-sand-deep px-2 py-0.5 text-xs font-medium text-ink-soft">
      {FOOD_TYPE_LABEL[type]}
    </span>
  )
}
