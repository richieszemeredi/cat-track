import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { format } from 'date-fns'
import { useState } from 'react'
import { ErrorCard } from '../components/ErrorCard'
import { FoodForm } from '../components/FoodForm'
import { LogMealForm } from '../components/LogMealForm'
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
import { dayRange } from '../lib/dates'
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

export const Route = createFileRoute('/food')({
  component: FoodPage,
  errorComponent: ({ error, reset }) => <ErrorCard error={error} onRetry={reset} />,
})

const CARD_CLASS = 'flex flex-col gap-3 rounded-squishy bg-white p-4 shadow-squishy'
const DISCLAIMER = 'Estimates only — always confirm with your vet.'

function PageTitle() {
  return (
    <h1 className="text-2xl font-extrabold">
      Food <span aria-hidden="true">🍽️</span>
    </h1>
  )
}

function LoadingHint({ label }: { label: string }) {
  return <p className="animate-pulse text-sm text-ink-soft">{label}</p>
}

function SectionError({ label }: { label: string }) {
  return (
    <p role="alert" className="text-sm font-semibold text-danger">
      {label}
    </p>
  )
}

function FoodPage() {
  const { activeCat, catsLoading } = useHousehold()

  if (catsLoading) {
    return (
      <main className="flex flex-col gap-4 p-4">
        <PageTitle />
        <div className={CARD_CLASS}>
          <LoadingHint label="Fetching kitty data…" />
        </div>
      </main>
    )
  }

  if (activeCat === null) {
    return (
      <main className="flex flex-col gap-4 p-4">
        <PageTitle />
        <div className="flex flex-col items-center gap-3 rounded-squishy bg-white p-6 text-center shadow-squishy">
          <span aria-hidden="true" className="text-4xl">
            🐱
          </span>
          <p className="font-semibold">No cat here yet!</p>
          <Link
            to="/profile"
            className="rounded-full bg-coral px-5 py-2 font-extrabold text-white active:scale-95"
          >
            Set up your cat&apos;s profile first <span aria-hidden="true">🐾</span>
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
  const [day] = useState(() => dayRange(new Date()))
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
    <main className="flex flex-col gap-4 p-4">
      <PageTitle />

      {/* 1. Today's target */}
      <section className={CARD_CLASS}>
        <h2 className="text-lg font-extrabold">
          Today&apos;s calories <span aria-hidden="true">🔥</span>
        </h2>
        {weightsQuery.isLoading || feedingsQuery.isLoading ? (
          <LoadingHint label="Counting kibbles…" />
        ) : weightsQuery.isError || feedingsQuery.isError ? (
          <SectionError label="Couldn't load today's calories — please try again." />
        ) : (
          <TargetSummary eaten={sumKcal(feedings)} target={target} />
        )}
        <p className="text-xs text-ink-soft">{DISCLAIMER}</p>
      </section>

      {/* 2. Log a meal (editors only) */}
      {canEdit && uid !== null ? (
        <section className={CARD_CLASS}>
          <h2 className="text-lg font-extrabold">
            Log a meal <span aria-hidden="true">🥣</span>
          </h2>
          {foodsQuery.isLoading ? (
            <LoadingHint label="Opening the pantry…" />
          ) : foodsQuery.isError ? (
            <SectionError label="Couldn't load your foods — please try again." />
          ) : activeFoods.length === 0 ? (
            <p className="text-sm text-ink-soft">
              Add a food first <span aria-hidden="true">👇</span>
            </p>
          ) : (
            <LogMealForm hid={householdId} catId={cat.id} uid={uid} foods={activeFoods} />
          )}
        </section>
      ) : null}

      {/* 3. Today's meals */}
      <section className={CARD_CLASS}>
        <h2 className="text-lg font-extrabold">
          Today&apos;s meals <span aria-hidden="true">🕒</span>
        </h2>
        {feedingsQuery.isLoading ? (
          <LoadingHint label="Sniffing out today's meals…" />
        ) : feedingsQuery.isError ? (
          <SectionError label="Couldn't load today's meals — please try again." />
        ) : feedings.length === 0 ? (
          <p className="text-sm text-ink-soft">
            No meals logged yet today — kitty is waiting <span aria-hidden="true">🐾</span>
          </p>
        ) : (
          <>
            <ul className="flex flex-col divide-y divide-coral-soft">
              {feedings.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 py-2">
                  <span className="text-sm font-bold text-ink-soft tabular-nums">
                    {format(entry.datetime, 'HH:mm')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{entry.foodNameSnapshot}</span>
                    {entry.mealType === null ? null : (
                      <span className="text-xs text-ink-soft capitalize"> · {entry.mealType}</span>
                    )}
                  </span>
                  <span className="text-sm text-ink-soft">{roundGrams(entry.amountG)} g</span>
                  <span className="text-sm font-extrabold">{roundKcal(entry.kcal)} kcal</span>
                  {canEdit ? (
                    <button
                      type="button"
                      aria-label="Delete meal"
                      onClick={() => {
                        void removeFeeding(entry)
                      }}
                      className="rounded-full bg-coral-soft px-2 py-1 text-sm active:scale-95"
                    >
                      <span aria-hidden="true">🗑️</span>
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="text-sm font-semibold text-ink-soft">
              Total: {roundGrams(sumGrams(feedings))} g · {roundKcal(sumKcal(feedings))} kcal
            </p>
          </>
        )}
        {mealError === null ? null : <SectionError label={mealError} />}
      </section>

      {/* 4. Food catalog */}
      <section className={CARD_CLASS}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold">
            Food catalog <span aria-hidden="true">🥫</span>
          </h2>
          {canEdit && uid !== null ? (
            <button
              type="button"
              data-testid="food-add-open"
              onClick={() => {
                setShowAddFood((v) => !v)
              }}
              className="rounded-full bg-coral px-4 py-2 text-sm font-extrabold text-white active:scale-95"
            >
              {showAddFood ? 'Close' : 'Add food'} <span aria-hidden="true">➕</span>
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
          <LoadingHint label="Opening the pantry…" />
        ) : foodsQuery.isError ? (
          <SectionError label="Couldn't load your foods — please try again." />
        ) : activeFoods.length === 0 ? (
          <p className="text-sm text-ink-soft">
            No foods yet — add your kitten&apos;s first food to start logging meals{' '}
            <span aria-hidden="true">🍚</span>
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-coral-soft">
            {activeFoods.map((food) => (
              <li key={food.id} className="flex flex-col gap-2 py-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">
                      {food.name} <TypeBadge type={food.type} />
                    </p>
                    {food.brand === null || food.brand === '' ? null : (
                      <p className="text-xs text-ink-soft">{food.brand}</p>
                    )}
                    <p className="text-sm text-ink-soft">
                      {food.kcalPerGram} kcal/g · {roundKcal(food.kcalPerGram * 100)} kcal / 100 g
                    </p>
                  </div>
                  {canEdit && uid !== null ? (
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingFoodId((prev) => (prev === food.id ? null : food.id))
                        }}
                        className="rounded-full bg-mint-soft px-3 py-1.5 text-sm font-bold text-mint-deep active:scale-95"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void setFoodArchived(food, true)
                        }}
                        className="rounded-full bg-coral-soft px-3 py-1.5 text-sm font-bold text-coral-deep active:scale-95"
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
              className="self-start text-sm font-bold text-ink-soft underline active:scale-95"
            >
              {showArchived ? 'Hide archived' : `Show archived (${String(archivedFoods.length)})`}{' '}
              <span aria-hidden="true">📦</span>
            </button>
            {showArchived ? (
              <ul className="flex flex-col divide-y divide-coral-soft">
                {archivedFoods.map((food) => (
                  <li key={food.id} className="flex items-center gap-2 py-2">
                    <span className="min-w-0 flex-1 text-sm text-ink-soft">
                      {food.name} <TypeBadge type={food.type} />
                    </span>
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => {
                          void setFoodArchived(food, false)
                        }}
                        className="rounded-full bg-mint-soft px-3 py-1.5 text-sm font-bold text-mint-deep active:scale-95"
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

      {/* 5. RER / MER explainer */}
      <section className={CARD_CLASS}>
        <h2 className="text-lg font-extrabold">
          How the target works <span aria-hidden="true">🧮</span>
        </h2>
        {weightsQuery.isLoading ? (
          <LoadingHint label="Doing cat math…" />
        ) : (
          <RerMerMath cat={cat} latestWeightKg={latestWeightKg} now={now} />
        )}
        <p className="text-xs text-ink-soft">{DISCLAIMER}</p>
      </section>
    </main>
  )
}

function TargetSummary({ eaten, target }: { eaten: number; target: number | null }) {
  const eatenRounded = roundKcal(eaten)

  if (target === null) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-3xl font-extrabold">
          <span data-testid="today-kcal">{eatenRounded}</span>{' '}
          <span className="text-base font-semibold text-ink-soft">kcal eaten</span>
        </p>
        <p className="text-sm text-ink-soft">
          Weigh in first to get a daily target{' '}
          <Link to="/weight" className="font-bold text-coral-deep underline">
            Go to Weight <span aria-hidden="true">⚖️</span>
          </Link>
        </p>
      </div>
    )
  }

  const targetRounded = roundKcal(target)
  const remaining = targetRounded - eatenRounded
  const over = remaining < 0
  const pct = Math.min(100, Math.max(0, (eaten / target) * 100))

  return (
    <div className="flex flex-col gap-2">
      <p className="text-3xl font-extrabold">
        <span data-testid="today-kcal">{eatenRounded}</span>
        <span className="text-base font-semibold text-ink-soft">
          {' '}
          / <span data-testid="today-target">{targetRounded}</span> kcal
        </span>
      </p>
      <div
        role="progressbar"
        aria-label="Today's calorie progress"
        aria-valuemin={0}
        aria-valuemax={targetRounded}
        aria-valuenow={Math.min(eatenRounded, targetRounded)}
        className="h-3 w-full overflow-hidden rounded-full bg-coral-soft"
      >
        <div
          className={`h-full rounded-full ${over ? 'bg-coral-deep' : 'bg-mint'}`}
          style={{ width: `${String(pct)}%` }}
        />
      </div>
      <p className={`text-sm font-semibold ${over ? 'text-coral-deep' : 'text-mint-deep'}`}>
        {over ? `Over by ${String(-remaining)} kcal today` : `${String(remaining)} kcal left today`}
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
        Once you log a weight we&apos;ll show the resting (RER) and daily (MER) calorie math here{' '}
        <span aria-hidden="true">✨</span>
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
        <span className="font-bold">RER</span> (resting) = 70 × kg
        <sup aria-hidden="true">0.75</sup> ≈{' '}
        <span className="font-extrabold">{roundKcal(rer(latestWeightKg))} kcal/day</span> at{' '}
        {roundKg(latestWeightKg)} kg
      </p>
      <p className="text-sm">
        <span className="font-bold">MER</span> (daily target) = {multiplier} × RER ≈{' '}
        <span className="font-extrabold">{roundKcal(merValue)} kcal/day</span> —{' '}
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

const FOOD_TYPE_BADGE: Record<FoodType, string> = {
  dry: 'bg-butter text-ink',
  wet: 'bg-mint-soft text-mint-deep',
  treat: 'bg-coral-soft text-coral-deep',
}

function TypeBadge({ type }: { type: FoodType }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-bold capitalize ${FOOD_TYPE_BADGE[type]}`}
    >
      {type}
    </span>
  )
}
