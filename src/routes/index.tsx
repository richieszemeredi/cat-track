import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { format } from 'date-fns'
import { type ReactNode } from 'react'
import { ErrorCard } from '../components/ErrorCard'
import { StatCard, type StatTone } from '../components/StatCard'
import { ageLabel, roundGrams, roundKcal, roundKg } from '../lib/catmath'
import {
  feedingsForDayQueryOptions,
  useFeedingsForDayLive,
  useWeightsLive,
  weightsQueryOptions,
  type Cat,
} from '../lib/db'
import { useHousehold } from '../lib/household'
import { dailyKcalTarget, effectiveLifeStage, sumGrams, sumKcal } from '../lib/target'
import { useToday } from '../lib/use-today'

export const Route = createFileRoute('/')({
  component: HomePage,
  errorComponent: ({ error, reset }) => <ErrorCard error={error} onRetry={reset} />,
})

function HomePage() {
  const { activeCat, catsLoading } = useHousehold()

  if (catsLoading) {
    return (
      <main className="flex flex-col gap-4 p-4">
        <h1 className="text-2xl font-extrabold">
          <span aria-hidden="true">🐱</span> Home
        </h1>
        <div className="h-28 animate-pulse rounded-squishy bg-white/70 shadow-squishy" />
        <p className="text-center text-sm text-ink-soft">Fetching your kitty…</p>
      </main>
    )
  }

  if (activeCat === null) {
    return (
      <main className="flex flex-col gap-4 p-4">
        <h1 className="text-2xl font-extrabold">
          <span aria-hidden="true">🐱</span> Home
        </h1>
        <div className="flex flex-col items-center gap-3 rounded-squishy bg-white p-6 text-center shadow-squishy">
          <span aria-hidden="true" className="text-4xl">
            🐾
          </span>
          <p className="font-bold">
            Set up your cat&apos;s profile first <span aria-hidden="true">🐾</span>
          </p>
          <Link
            to="/profile"
            className="rounded-full bg-coral px-5 py-2 font-extrabold text-ink active:scale-95"
          >
            Go to profile
          </Link>
        </div>
      </main>
    )
  }

  return <Dashboard cat={activeCat} />
}

function Dashboard({ cat }: { cat: Cat }) {
  const { householdId, canEdit } = useHousehold()
  const now = new Date()
  const { start, end } = useToday()

  const weightsQuery = useQuery(weightsQueryOptions(householdId, cat.id))
  useWeightsLive(householdId, cat.id)
  const feedingsQuery = useQuery(feedingsForDayQueryOptions(householdId, cat.id, start, end))
  useFeedingsForDayLive(householdId, cat.id, start, end)

  const weights = weightsQuery.data ?? []
  const feedings = feedingsQuery.data ?? []

  // weights arrive ordered by date asc — latest is the last element.
  const latest = weights.at(-1)
  const previous = weights.at(-2)

  const eatenKcal = sumKcal(feedings)
  const gramsToday = sumGrams(feedings)
  const target = dailyKcalTarget(cat, latest?.weightKg ?? null, now)
  const overTarget = target !== null && eatenKcal > target
  const foodTone: StatTone = target === null ? 'plain' : overTarget ? 'coral' : 'mint'
  const progressPct = target === null ? 0 : Math.min(100, (eatenKcal / target) * 100)

  const stage = effectiveLifeStage(cat, now)
  const isKitten = stage === 'kitten_0_4' || stage === 'kitten_4_12'

  let weightSub: ReactNode
  if (latest === undefined) {
    weightSub = 'No weigh-ins yet'
  } else if (previous === undefined) {
    weightSub = 'First weigh-in!'
  } else {
    const delta = roundKg(latest.weightKg - previous.weightKg)
    const deltaText = `${delta >= 0 ? '+' : ''}${delta.toFixed(2)} kg since last weigh-in`
    weightSub =
      isKitten && delta > 0 ? (
        <span className="font-semibold text-mint-deep">{deltaText}</span>
      ) : (
        deltaText
      )
  }

  const statsLoading = weightsQuery.isLoading || feedingsQuery.isLoading
  const statsError = weightsQuery.error ?? feedingsQuery.error

  return (
    <main className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-extrabold">
        <span aria-hidden="true">🐱</span> {cat.name} · {ageLabel(cat.birthDate, now)}
      </h1>

      {statsLoading ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="h-28 animate-pulse rounded-squishy bg-white/70 shadow-squishy" />
          <div className="h-28 animate-pulse rounded-squishy bg-white/70 shadow-squishy" />
        </div>
      ) : statsError !== null ? (
        <div
          role="alert"
          className="rounded-squishy bg-white p-4 text-sm font-semibold text-danger shadow-squishy"
        >
          <span aria-hidden="true">🙀</span> Couldn&apos;t load today&apos;s numbers.{' '}
          {statsError.message}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Today's food"
              emoji="🍽️"
              tone={foodTone}
              value={
                <span data-testid="dash-kcal-today">
                  {target === null
                    ? `${String(roundKcal(eatenKcal))} kcal`
                    : `${String(roundKcal(eatenKcal))} / ${String(roundKcal(target))} kcal`}
                </span>
              }
              sub={
                target === null
                  ? 'Weigh in to get a target'
                  : `${String(roundGrams(gramsToday))} g fed today`
              }
            />
            <StatCard
              label="Latest weight"
              emoji="⚖️"
              tone="plain"
              value={
                <span data-testid="dash-weight">
                  {latest === undefined ? '—' : `${roundKg(latest.weightKg).toFixed(2)} kg`}
                </span>
              }
              sub={weightSub}
            />
          </div>
          {target !== null && (
            <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-coral-soft">
              <div
                className="h-full rounded-full bg-coral"
                style={{ width: `${String(progressPct)}%` }}
              />
            </div>
          )}
        </>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-extrabold">
          <span aria-hidden="true">🍽️</span> Today&apos;s meals
        </h2>
        {feedingsQuery.isLoading ? (
          <div className="flex flex-col gap-2">
            <div className="h-12 animate-pulse rounded-squishy bg-white/70 shadow-squishy" />
            <div className="h-12 animate-pulse rounded-squishy bg-white/70 shadow-squishy" />
          </div>
        ) : feedingsQuery.error !== null ? (
          <div
            role="alert"
            className="rounded-squishy bg-white p-4 text-sm font-semibold text-danger shadow-squishy"
          >
            <span aria-hidden="true">🙀</span> Couldn&apos;t load today&apos;s meals.{' '}
            {feedingsQuery.error.message}
          </div>
        ) : feedings.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-squishy bg-white p-6 text-center shadow-squishy">
            <p className="text-ink-soft">
              No meals logged yet today <span aria-hidden="true">🍽️</span>
            </p>
            {canEdit && (
              <Link
                to="/food"
                className="rounded-full bg-coral px-5 py-2 font-extrabold text-ink active:scale-95"
              >
                Log the first one
              </Link>
            )}
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-coral-soft rounded-squishy bg-white shadow-squishy">
            {feedings.map((feeding) => (
              <li key={feeding.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="text-sm font-semibold text-ink-soft tabular-nums">
                    {format(feeding.datetime, 'HH:mm')}
                  </span>
                  <span className="truncate font-bold">{feeding.foodNameSnapshot}</span>
                </div>
                <span className="shrink-0 text-sm text-ink-soft">
                  {String(roundGrams(feeding.amountG))} g · {String(roundKcal(feeding.kcal))} kcal
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canEdit && (
        <div className="flex gap-3">
          <Link
            to="/food"
            className="flex-1 rounded-full bg-coral px-4 py-3 text-center font-extrabold text-ink active:scale-95"
          >
            <span aria-hidden="true">🍽️</span> Log a meal
          </Link>
          <Link
            to="/weight"
            className="flex-1 rounded-full bg-mint px-4 py-3 text-center font-extrabold text-ink active:scale-95"
          >
            <span aria-hidden="true">⚖️</span> Weigh in
          </Link>
        </div>
      )}

      <p className="text-center text-xs text-ink-soft">
        Estimates only — always confirm with your vet.
      </p>
    </main>
  )
}
