import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { type ReactNode } from 'react'
import {
  ageLabelLong,
  formatWeightKg,
  roundGrams,
  roundKcal,
  roundKg,
  weeklyWeightTrend,
} from '../lib/catmath'
import {
  feedingsForDayQueryOptions,
  plansQueryOptions,
  useFeedingsForDayLive,
  usePlansLive,
  useWeightsLive,
  weightsQueryOptions,
  type Cat,
} from '../lib/db'
import { useHousehold } from '../lib/household'
import { planMealTimes } from '../lib/plan'
import { dailyKcalTarget, effectiveLifeStage, sumGrams, sumKcal } from '../lib/target'
import { useToday } from '../lib/use-today'
import { StatCard } from './StatCard'

/** Where one cat stands today: bowls given, calories, and her latest weight. */
function useCatToday(cat: Cat) {
  const { householdId } = useHousehold()
  const now = new Date()
  const { start, end } = useToday()

  const weightsQuery = useQuery(weightsQueryOptions(householdId, cat.id))
  useWeightsLive(householdId, cat.id)
  const feedingsQuery = useQuery(feedingsForDayQueryOptions(householdId, cat.id, start, end))
  useFeedingsForDayLive(householdId, cat.id, start, end)
  const plansQuery = useQuery(plansQueryOptions(householdId, cat.id))
  usePlansLive(householdId, cat.id)

  const weights = weightsQuery.data ?? []
  const feedings = feedingsQuery.data ?? []

  // Only the plan's own meal count is needed here — how many bowls are owed
  // today and how many have gone down. The composition lives on /food.
  const plan = plansQuery.data?.[0] ?? null
  const mealCount = plan === null ? 0 : planMealTimes(plan).length
  const mealsGiven =
    plan === null
      ? 0
      : new Set(
          feedings
            .filter(
              (feeding) =>
                feeding.planId === plan.id &&
                feeding.mealIndex !== null &&
                feeding.mealIndex < mealCount,
            )
            .map((feeding) => feeding.mealIndex),
        ).size

  // weights arrive ordered by date asc — latest is the last element.
  const latest = weights.at(-1)
  const previous = weights.at(-2)

  const eatenKcal = sumKcal(feedings)
  const gramsToday = sumGrams(feedings)
  const target = dailyKcalTarget(cat, latest?.weightKg ?? null, now)

  const stage = effectiveLifeStage(cat, now)
  const isKitten = stage === 'kitten_0_4' || stage === 'kitten_4_12'

  // Per week wherever a long enough span exists (catmath.weeklyWeightTrend);
  // the raw change between the last two weigh-ins only while it doesn't. The
  // sub-label always says which, so the figure is never ambiguous about what
  // it divided by.
  const trend = weeklyWeightTrend(weights)
  const weightDelta =
    trend !== null
      ? trend.kgPerWeek
      : latest !== undefined && previous !== undefined
        ? latest.weightKg - previous.weightKg
        : null
  const changeSub =
    trend !== null
      ? 'per week'
      : weightDelta !== null
        ? 'since the last weigh-in'
        : latest === undefined
          ? '—'
          : 'First weigh-in'

  return {
    now,
    plan,
    mealCount,
    mealsGiven,
    latest,
    eatenKcal,
    gramsToday,
    target,
    isKitten,
    weightDelta,
    changeSub,
    loading: weightsQuery.isLoading || feedingsQuery.isLoading,
    error: weightsQuery.error ?? feedingsQuery.error,
  }
}

const signed = (kg: number) => `${kg >= 0 ? '+' : ''}${formatWeightKg(kg)}`

/**
 * The home screen's view of one cat. `full` is the single-cat screen — the one
 * big number — and `compact` is one of several, where a figure per cat that
 * size would turn the screen into a wall of numbers.
 */
export function CatToday({ cat, variant }: { cat: Cat; variant: 'full' | 'compact' }) {
  const today = useCatToday(cat)

  if (today.loading) {
    return <div className="h-24 animate-pulse rounded-squishy bg-sand" />
  }
  if (today.error !== null) {
    return (
      <p role="alert" className="gutter text-sm font-semibold text-danger">
        Couldn&apos;t load {variant === 'compact' ? `${cat.name}’s` : 'today’s'} numbers.{' '}
        {today.error.message}
      </p>
    )
  }

  return variant === 'full' ? <FullToday today={today} /> : <CompactToday cat={cat} today={today} />
}

type Today = ReturnType<typeof useCatToday>

function FullToday({ today }: { today: Today }) {
  const { plan, mealCount, mealsGiven, latest, eatenKcal, gramsToday, target } = today
  const overTarget = target !== null && eatenKcal > target

  const weightSub: ReactNode =
    latest === undefined ? 'No weigh-ins yet' : format(latest.date, 'MMM d')

  return (
    <>
      {/* The one number this screen exists to show. With a plan in force
      that is how far through it she is — the calorie total is a
      foregone conclusion by breakfast, the bowls are not. */}
      <section className="gutter flex flex-col gap-3">
        <h2 className="section-label">{plan === null ? 'Eaten today' : 'Today'}</h2>
        {plan === null ? (
          <>
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
                <Meter value={eatenKcal} max={target} label="Today's calorie progress" />
                <p
                  className={`text-sm ${overTarget ? 'font-semibold text-coral-ink' : 'text-ink-soft'}`}
                >
                  {overTarget
                    ? `${String(roundKcal(eatenKcal - target))} kcal over · ${String(roundGrams(gramsToday))} g fed`
                    : `${String(roundKcal(target - eatenKcal))} kcal left · ${String(roundGrams(gramsToday))} g fed`}
                </p>
              </>
            )}
          </>
        ) : (
          <>
            <p className="flex items-baseline gap-2">
              <span
                data-testid="dash-meals-today"
                className="text-5xl font-bold tracking-tight tabular-nums"
              >
                {mealsGiven} of {mealCount}
              </span>
              <span className="text-lg text-ink-soft">meals given</span>
            </p>
            <Meter value={mealsGiven} max={mealCount} label="Today's meals given" />
            {/* "target" is load-bearing: /food counts the same kcal against
            what the PLAN delivers, and two denominators sharing one
            phrasing would read as a contradiction. */}
            <p data-testid="dash-kcal-today" className="text-sm text-ink-soft tabular-nums">
              {roundKcal(eatenKcal)}
              {target === null ? ' kcal' : ` of ${String(roundKcal(target))} kcal target`} ·{' '}
              {roundGrams(gramsToday)} g fed
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
            tone={
              today.weightDelta !== null && today.weightDelta > 0 && today.isKitten
                ? 'positive'
                : 'plain'
            }
            value={today.weightDelta === null ? '—' : signed(today.weightDelta)}
            sub={today.changeSub}
          />
        </div>
      </section>
    </>
  )
}

function CompactToday({ cat, today }: { cat: Cat; today: Today }) {
  const { plan, mealCount, mealsGiven, latest, eatenKcal, target, weightDelta, changeSub } = today

  return (
    <section className="flex flex-col gap-3">
      <h2 className="section-label gutter break-words">
        {cat.name} · {ageLabelLong(cat.birthDate, today.now)}
      </h2>
      <div className="surface flex flex-col gap-3 p-4">
        {plan === null ? (
          <p className="tabular-nums">
            <span className="text-2xl font-bold tracking-tight">{roundKcal(eatenKcal)}</span>
            <span className="text-ink-soft">
              {target === null ? ' kcal eaten' : ` of ${String(roundKcal(target))} kcal`}
            </span>
          </p>
        ) : (
          <>
            <p className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight tabular-nums">
                {mealsGiven} of {mealCount}
              </span>
              <span className="text-ink-soft">meals given</span>
            </p>
            <Meter value={mealsGiven} max={mealCount} label={`${cat.name}’s meals given today`} />
          </>
        )}
        <p className="text-sm text-ink-soft tabular-nums">
          {latest === undefined
            ? 'No weigh-ins yet'
            : `${roundKg(latest.weightKg).toFixed(2)} kg${
                weightDelta === null ? '' : ` · ${signed(weightDelta)} ${changeSub}`
              }`}
        </p>
      </div>
    </section>
  )
}

/** Progress toward a daily figure. Coral fills; over target it deepens. */
function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  const over = value > max
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={roundKcal(max)}
      aria-valuenow={roundKcal(Math.min(value, max))}
      className="h-2 w-full overflow-hidden rounded-full bg-sand"
    >
      {/* Fills rather than jumps: feedings arrive live, so a bowl ticked on
      the other phone should visibly move this bar. Plain ease-out, not
      ease-squishy — a fill that overshoots would claim, for a moment, more
      than she has eaten. The colour eases with it when she goes over. */}
      <div
        className={`h-full rounded-full transition-[width,background-color] duration-500 ease-out ${over ? 'bg-coral-deep' : 'bg-coral'}`}
        style={{ width: `${String(pct)}%` }}
      />
    </div>
  )
}
