import { createFileRoute, Link } from '@tanstack/react-router'
import { AnimatePresence } from 'motion/react'
import { useState } from 'react'
import { PoppingNumber } from '../components/AnimatedNumber'
import { CatSwitcher } from '../components/CatSwitcher'
import { ErrorCard } from '../components/ErrorCard'
import { FoodForm } from '../components/FoodForm'
import { ListRow } from '../components/ListRow'
import { MealChecklist } from '../components/MealChecklist'
import { OffPlanList } from '../components/OffPlanList'
import { OutgrownNudge } from '../components/OutgrownNudge'
import { PlanForm } from '../components/PlanForm'
import { PlanHistory } from '../components/PlanHistory'
import { RerMerMath } from '../components/RerMerMath'
import { SectionError, Skeleton } from '../components/SectionStatus'
import { useAuth } from '../lib/auth'
import { roundGrams, roundKcal } from '../lib/catmath'
import { awaitOrQueued, updateFood, type Cat, type Food } from '../lib/db'
import { useHousehold } from '../lib/household'
import { isOutgrown, planDailyGrams } from '../lib/plan'
import { type FoodType } from '../lib/schemas'
import { useBounceWhenDone } from '../lib/use-animated-number'
import { useCatDay } from '../lib/use-cat-day'

export const Route = createFileRoute('/food')({
  component: FoodPage,
  errorComponent: ({ error, reset }) => <ErrorCard error={error} onRetry={reset} />,
})

const DISCLAIMER = 'Estimates only — always confirm with your vet.'

function FoodPage() {
  const { activeCat, catsLoading } = useHousehold()

  if (catsLoading) {
    return (
      <main className="flex flex-col gap-6 p-4">
        <h1 className="page-title gutter">Food</h1>
        <div className="page-solo">
          <Skeleton />
        </div>
      </main>
    )
  }

  if (activeCat === null) {
    return (
      <main className="flex flex-col gap-6 p-4">
        <h1 className="page-title gutter">Food</h1>
        <div className="surface page-solo flex flex-col items-start gap-3 p-5">
          <p className="font-semibold">No cat set up yet.</p>
          <Link to="/profile" className="btn-primary">
            Add your cat
          </Link>
        </div>
      </main>
    )
  }

  return <FoodContent key={activeCat.id} cat={activeCat} />
}

function FoodContent({ cat }: { cat: Cat }) {
  const { householdId, canEdit } = useHousehold()
  const { user } = useAuth()
  const uid = user?.uid ?? null
  const catDay = useCatDay(cat)
  const {
    now,
    weightsQuery,
    foodsQuery,
    feedingsQuery,
    plansQuery,
    latestWeightKg,
    target,
    foods,
    activeFoods,
    kcalPerGram,
    plans,
    plan,
    planItems,
    times,
    ratio,
    offPlan,
    givenCount,
    eatenKcal,
  } = catDay
  const planDailyKcalValue = catDay.planDailyKcal

  const [editingPlan, setEditingPlan] = useState(false)
  const [showAddFood, setShowAddFood] = useState(false)
  const [editingFoodId, setEditingFoodId] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [catalogError, setCatalogError] = useState<string | null>(null)

  const archivedFoods = foods.filter((f) => f.archived)

  async function setFoodArchived(food: Food, archived: boolean): Promise<void> {
    if (archived && !window.confirm(`Archive ${food.name}? You can bring it back later.`)) return
    setCatalogError(null)
    try {
      await awaitOrQueued(updateFood(householdId, food.id, { archived }))
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : 'Could not update the food.')
    }
  }

  if (editingPlan && canEdit && uid !== null) {
    return (
      // A form, not a dashboard: it keeps the phone's width on a wide screen
      // rather than stretching every field across both columns.
      <main className="mx-auto flex w-full max-w-lg flex-col gap-7 p-4">
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
      <CatSwitcher />

      <div className="page-columns">
        {/* Today: how far through the plan she is, and what is left to give. */}
        <div className="page-column">
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
                  No feeding plan yet. Set how many meals she gets, when, and how much a day — the
                  app works out the rest.
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

              <MealChecklist
                cat={cat}
                day={catDay}
                footer={
                  <li className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="text-sm text-ink-soft tabular-nums">
                      {roundGrams(planDailyGrams(planItems))} g · {roundKcal(planDailyKcalValue)}{' '}
                      kcal a day
                    </span>
                    {ratio === null ? null : (
                      <span
                        data-testid="plan-ratio"
                        className={`text-sm font-semibold tabular-nums ${
                          isOutgrown(planDailyKcalValue, target)
                            ? 'text-coral-ink'
                            : 'text-positive'
                        }`}
                      >
                        {Math.round(ratio * 100)}% of target
                      </span>
                    )}
                  </li>
                }
              />
            </section>
          ) : null}

          {/* 3. Anything off-plan: a treat, a stolen bite, a tin that wasn't on
          the plan. Typed, because by definition it isn't predictable. */}
          <section>
            <OffPlanList cat={cat} feedings={offPlan} foods={activeFoods} heading="Anything else" />
          </section>
        </div>

        {/* The catalog and the reference material behind the plan. */}
        <div className="page-column">
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
                <AnimatePresence initial={false}>
                  {activeFoods.map((food, index) => (
                    <ListRow key={food.id} order={index}>
                      <div className="flex flex-col gap-3 p-4">
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
                              {food.brand === null || food.brand === '' ? null : (
                                <span>{food.brand}</span>
                              )}
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
                            uid={uid}
                            existing={food}
                            onDone={() => {
                              setEditingFoodId(null)
                            }}
                          />
                        ) : null}
                      </div>
                    </ListRow>
                  ))}
                </AnimatePresence>
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
                  {showArchived
                    ? 'Hide archived'
                    : `Show archived (${String(archivedFoods.length)})`}
                </button>
                {showArchived ? (
                  <ul className="surface divide-y divide-sand">
                    <AnimatePresence initial={false}>
                      {archivedFoods.map((food, index) => (
                        <ListRow key={food.id} order={index}>
                          <div className="flex items-center gap-3 px-4 py-3">
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
                          </div>
                        </ListRow>
                      ))}
                    </AnimatePresence>
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
        </div>
      </div>
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
  const figure = useBounceWhenDone<HTMLSpanElement>(total > 0 && left <= 0)

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-baseline gap-2">
        <span
          ref={figure}
          data-testid="today-meals"
          className="text-5xl font-bold tracking-tight tabular-nums"
        >
          <PoppingNumber value={given} /> of {total}
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
        {/* Fills like the Home meter (CatToday's Meter), for the same reason:
        the other phone's tick arrives live and should be seen to land. */}
        <div
          className="h-full rounded-full bg-coral transition-[width] duration-500 ease-out"
          style={{ width: `${String(pct)}%` }}
        />
      </div>
      <p data-testid="today-kcal" className="text-sm text-ink-soft tabular-nums">
        {roundKcal(eatenKcal)} of {roundKcal(planKcal)} kcal
        {left > 0 ? ` · ${String(left)} ${left === 1 ? 'bowl' : 'bowls'} left` : ' · all done'}
      </p>
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
