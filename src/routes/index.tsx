import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { format } from 'date-fns'
import { type ReactNode } from 'react'
import { ErrorCard } from '../components/ErrorCard'
import { StatCard } from '../components/StatCard'
import { ageLabelLong, roundGrams, roundKcal, roundKg } from '../lib/catmath'
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
      <main className="flex flex-col gap-6 p-4">
        <h1 className="page-title gutter">Home</h1>
        <div className="h-24 animate-pulse rounded-squishy bg-sand" />
      </main>
    )
  }

  if (activeCat === null) {
    return (
      <main className="flex flex-col gap-6 p-4">
        <h1 className="page-title gutter">Home</h1>
        <div className="surface flex flex-col items-start gap-3 p-5">
          <p className="font-semibold">No cat set up yet.</p>
          <Link to="/profile" className="btn-primary">
            Add your cat
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

  const stage = effectiveLifeStage(cat, now)
  const isKitten = stage === 'kitten_0_4' || stage === 'kitten_4_12'

  const weightDelta =
    latest !== undefined && previous !== undefined
      ? roundKg(latest.weightKg - previous.weightKg)
      : null
  const weightSub: ReactNode =
    latest === undefined ? 'No weigh-ins yet' : format(latest.date, 'MMM d')
  const changeSub: ReactNode =
    weightDelta !== null ? 'since the last weigh-in' : latest === undefined ? '—' : 'First weigh-in'

  const statsLoading = weightsQuery.isLoading || feedingsQuery.isLoading
  const statsError = weightsQuery.error ?? feedingsQuery.error

  return (
    <main className="flex flex-col gap-7 p-4">
      <header className="gutter">
        <h1 className="page-title">{cat.name}</h1>
        <p className="text-sm text-ink-soft">{ageLabelLong(cat.birthDate, now)}</p>
      </header>

      {statsLoading ? (
        <div className="h-24 animate-pulse rounded-squishy bg-sand" />
      ) : statsError !== null ? (
        <p role="alert" className="gutter text-sm font-semibold text-danger">
          Couldn&apos;t load today&apos;s numbers. {statsError.message}
        </p>
      ) : (
        <>
          {/* The one number this screen exists to show. */}
          <section className="gutter flex flex-col gap-3">
            <h2 className="section-label">Eaten today</h2>
            <p className="flex items-baseline gap-2">
              <span
                data-testid="dash-kcal-today"
                className="text-5xl font-bold tracking-tight tabular-nums"
              >
                {roundKcal(eatenKcal)}
              </span>
              <span className="text-lg text-ink-soft">
                {target === null ? 'kcal' : `of ${String(roundKcal(target))} kcal`}
              </span>
            </p>
            {target === null ? (
              <p className="text-sm text-ink-soft">Log a weigh-in to get a daily target.</p>
            ) : (
              <>
                <Meter value={eatenKcal} max={target} />
                <p
                  className={`text-sm ${overTarget ? 'font-semibold text-coral-ink' : 'text-ink-soft'}`}
                >
                  {overTarget
                    ? `${String(roundKcal(eatenKcal - target))} kcal over · ${String(roundGrams(gramsToday))} g fed`
                    : `${String(roundKcal(target - eatenKcal))} kcal left · ${String(roundGrams(gramsToday))} g fed`}
                </p>
              </>
            )}
          </section>

          <section className="surface grid grid-cols-2 divide-x divide-sand">
            <div className="p-4">
              <StatCard
                label="Weight"
                value={
                  <span data-testid="dash-weight">
                    {latest === undefined ? '—' : `${roundKg(latest.weightKg).toFixed(2)} kg`}
                  </span>
                }
                sub={weightSub}
              />
            </div>
            <div className="p-4">
              <StatCard
                label="Change"
                tone={weightDelta !== null && weightDelta > 0 && isKitten ? 'positive' : 'plain'}
                value={
                  weightDelta === null
                    ? '—'
                    : `${weightDelta >= 0 ? '+' : ''}${weightDelta.toFixed(2)} kg`
                }
                sub={changeSub}
              />
            </div>
          </section>
        </>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="section-label gutter">Today&apos;s meals</h2>
        {feedingsQuery.isLoading ? (
          <div className="h-16 animate-pulse rounded-squishy bg-sand" />
        ) : feedingsQuery.error !== null ? (
          <p role="alert" className="gutter text-sm font-semibold text-danger">
            Couldn&apos;t load today&apos;s meals. {feedingsQuery.error.message}
          </p>
        ) : feedings.length === 0 ? (
          <p className="gutter text-sm text-ink-soft">Nothing logged yet today.</p>
        ) : (
          <ul className="surface divide-y divide-sand">
            {feedings.map((feeding) => (
              <li key={feeding.id} className="flex items-center gap-3 px-4 py-3">
                <span className="text-sm text-ink-soft tabular-nums">
                  {format(feeding.datetime, 'HH:mm')}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">
                  {feeding.foodNameSnapshot}
                </span>
                <span className="shrink-0 text-sm text-ink-soft tabular-nums">
                  {roundGrams(feeding.amountG)} g · {roundKcal(feeding.kcal)} kcal
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canEdit && (
        <div className="flex gap-3">
          <Link to="/food" className="btn-primary flex-1">
            Log a meal
          </Link>
          <Link to="/weight" className="btn-secondary flex-1">
            Weigh in
          </Link>
        </div>
      )}

      <p className="gutter text-xs text-ink-soft">Estimates only — always confirm with your vet.</p>
    </main>
  )
}

/** Progress toward the daily target. Coral fills; over target it deepens. */
function Meter({ value, max }: { value: number; max: number }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  const over = value > max
  return (
    <div
      role="progressbar"
      aria-label="Today's calorie progress"
      aria-valuemin={0}
      aria-valuemax={roundKcal(max)}
      aria-valuenow={roundKcal(Math.min(value, max))}
      className="h-2 w-full overflow-hidden rounded-full bg-sand"
    >
      <div
        className={`h-full rounded-full ${over ? 'bg-coral-deep' : 'bg-coral'}`}
        style={{ width: `${String(pct)}%` }}
      />
    </div>
  )
}
