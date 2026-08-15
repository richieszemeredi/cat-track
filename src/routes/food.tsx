import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { format } from 'date-fns'
import { useState } from 'react'
import { ErrorCard } from '../components/ErrorCard'
import { FoodForm } from '../components/FoodForm'
import { LogMealForm } from '../components/LogMealForm'
import { RepeatDayCard } from '../components/RepeatDayCard'
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
  awaitOrQueued,
  deleteFeeding,
  feedingsForDayQueryOptions,
  foodsQueryOptions,
  updateFood,
  useFeedingsForDayLive,
  useFoodsLive,
  useWeightsLive,
  weightsQueryOptions,
  type Cat,
  type Feeding,
  type Food,
} from '../lib/db'
import { useHousehold } from '../lib/household'
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

  const [showAddFood, setShowAddFood] = useState(false)
  const [editingFoodId, setEditingFoodId] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [mealError, setMealError] = useState<string | null>(null)
  const [catalogError, setCatalogError] = useState<string | null>(null)

  const latestWeightKg = weightsQuery.data?.at(-1)?.weightKg ?? null
  const target = dailyKcalTarget(cat, latestWeightKg, now)
  const feedings = feedingsQuery.data ?? []
  const foods = foodsQuery.data ?? []
  const activeFoods = foods.filter((f) => !f.archived)
  const archivedFoods = foods.filter((f) => f.archived)

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

  return (
    <main className="flex flex-col gap-7 p-4">
      <h1 className="page-title gutter">Food</h1>

      {/* 1. Today's target — the one figure this screen leads with */}
      <section className="gutter flex flex-col gap-3">
        <h2 className="section-label">Today&apos;s calories</h2>
        {weightsQuery.isLoading || feedingsQuery.isLoading ? (
          <Skeleton />
        ) : weightsQuery.isError || feedingsQuery.isError ? (
          <SectionError label="Couldn't load today's calories — please try again." />
        ) : (
          <TargetSummary eaten={sumKcal(feedings)} target={target} />
        )}
      </section>

      {/* 2. Log a meal (editors only) */}
      {canEdit && uid !== null ? (
        <section className="flex flex-col gap-3">
          <h2 className="section-label gutter">Log a meal</h2>
          {foodsQuery.isLoading ? (
            <Skeleton />
          ) : foodsQuery.isError ? (
            <SectionError label="Couldn't load your foods — please try again." />
          ) : activeFoods.length === 0 ? (
            <p className="gutter text-sm text-ink-soft">Add a food below to start logging meals.</p>
          ) : (
            <div className="surface p-4">
              <LogMealForm hid={householdId} catId={cat.id} uid={uid} foods={activeFoods} />
            </div>
          )}
        </section>
      ) : null}

      {/* 2b. Repeat the last logged day (most days are the same day) */}
      {canEdit && uid !== null ? (
        <RepeatDayCard hid={householdId} catId={cat.id} uid={uid} todayStart={day.start} />
      ) : null}

      {/* 3. Today's meals */}
      <section className="flex flex-col gap-3">
        <h2 className="section-label gutter">Today&apos;s meals</h2>
        {feedingsQuery.isLoading ? (
          <Skeleton />
        ) : feedingsQuery.isError ? (
          <SectionError label="Couldn't load today's meals — please try again." />
        ) : feedings.length === 0 ? (
          <p className="gutter text-sm text-ink-soft">Nothing logged yet today.</p>
        ) : (
          <>
            <ul className="surface divide-y divide-sand">
              {feedings.map((entry) => (
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
              Total: {roundGrams(sumGrams(feedings))} g · {roundKcal(sumKcal(feedings))} kcal
            </p>
          </>
        )}
        {mealError === null ? null : <SectionError label={mealError} />}
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
            No foods yet — add one to start logging meals.
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

      {/* 5. RER / MER explainer — reference material, folded away by default */}
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

function TargetSummary({ eaten, target }: { eaten: number; target: number | null }) {
  const eatenRounded = roundKcal(eaten)

  if (target === null) {
    return (
      <div className="flex flex-col gap-2">
        <p className="flex items-baseline gap-2">
          <span data-testid="today-kcal" className="text-5xl font-bold tracking-tight tabular-nums">
            {eatenRounded}
          </span>
          <span className="text-lg text-ink-soft">kcal</span>
        </p>
        <p className="text-sm text-ink-soft">
          Log a weigh-in to get a daily target.{' '}
          <Link to="/weight" className="font-semibold text-coral-ink underline underline-offset-2">
            Go to Weight
          </Link>
        </p>
      </div>
    )
  }

  const targetRounded = roundKcal(target)
  // Judge over/under on the UNROUNDED values (same rule as the dashboard's
  // tone logic); only the displayed numbers are rounded.
  const over = eaten > target
  const remainingKcal = roundKcal(Math.abs(target - eaten))
  const pct = Math.min(100, Math.max(0, (eaten / target) * 100))

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-baseline gap-2">
        <span data-testid="today-kcal" className="text-5xl font-bold tracking-tight tabular-nums">
          {eatenRounded}
        </span>
        <span className="text-lg text-ink-soft">
          of <span data-testid="today-target">{targetRounded}</span> kcal
        </span>
      </p>
      <div
        role="progressbar"
        aria-label="Today's calorie progress"
        aria-valuemin={0}
        aria-valuemax={targetRounded}
        aria-valuenow={Math.min(eatenRounded, targetRounded)}
        className="h-2 w-full overflow-hidden rounded-full bg-sand"
      >
        <div
          className={`h-full rounded-full ${over ? 'bg-coral-deep' : 'bg-coral'}`}
          style={{ width: `${String(pct)}%` }}
        />
      </div>
      <p className={`text-sm ${over ? 'font-semibold text-coral-ink' : 'text-ink-soft'}`}>
        {over
          ? `${String(remainingKcal)} kcal over today`
          : `${String(remainingKcal)} kcal left today`}
      </p>
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
