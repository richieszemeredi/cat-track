import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'
import { CatAge } from '../components/CatAge'
import { ErrorCard } from '../components/ErrorCard'
import { FoldChevron } from '../components/FoldChevron'
import { HomeWater } from '../components/HomeWater'
import { LitterFold } from '../components/LitterFold'
import { MealChecklist } from '../components/MealChecklist'
import { OffPlanList } from '../components/OffPlanList'
import { SectionError, Skeleton } from '../components/SectionStatus'
import { WeightRow } from '../components/WeightRow'
import { ageLabelLong } from '../lib/catmath'
import { type Cat } from '../lib/db'
import { useHousehold } from '../lib/household'
import { useSupplies, type SupplyAlert } from '../lib/supplies'
import { useCatDay, type CatDay } from '../lib/use-cat-day'
import { useMediaQuery } from '../lib/use-media-query'
import { useToday } from '../lib/use-today'

export const Route = createFileRoute('/')({
  component: HomePage,
  errorComponent: ({ error, reset }) => <ErrorCard error={error} onRetry={reset} />,
})

interface CatAndDay {
  cat: Cat
  day: CatDay
}

/**
 * The day at a glance, for every cat at once: what needs doing, the bowls to
 * tick, the water, the weigh-in, then the rarely-used rest folded away.
 * Everything else is one tap away on the tab bar, so there are no shortcuts
 * here — and no calories either: those live on Plan.
 */
function HomePage() {
  const { cats, catsLoading } = useHousehold()
  const [only] = cats
  const single = cats.length === 1 ? only : undefined

  const header =
    single === undefined ? (
      <h1 className="page-title gutter">Home</h1>
    ) : (
      // Name and age on one line: the age is a footnote, not a second title.
      <header className="gutter flex flex-wrap items-baseline gap-x-3">
        <h1 className="page-title break-words">{single.name}</h1>
        <p className="text-sm text-ink-soft">{ageLabelLong(single.birthDate, new Date())}</p>
      </header>
    )

  if (catsLoading) {
    return (
      <main className="flex flex-col gap-6 p-4">
        <h1 className="page-title gutter">Home</h1>
        <div className="page-solo h-24 animate-pulse rounded-squishy bg-sand" />
      </main>
    )
  }

  if (cats.length === 0) {
    return (
      <main className="flex flex-col gap-7 p-4">
        {header}
        <div className="surface page-solo flex flex-col items-start gap-3 p-5">
          <p className="font-semibold">No cat set up yet.</p>
          <Link to="/profile" className="btn-primary">
            Add your cat
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="flex flex-col gap-7 p-4">
      {header}
      <CatDays cats={cats} done={[]}>
        {(days) => <HomeBody days={days} />}
      </CatDays>
    </main>
  )
}

/**
 * `useCatDay` for every cat. Hooks can't run in a loop, so each cat gets one
 * component level that loads her day and hands the growing list down; the
 * innermost level renders the screen with all of them. The same queries the
 * meal checklists read, so the off-plan count and the ticks always agree.
 */
function CatDays({
  cats,
  done,
  children,
}: {
  cats: readonly Cat[]
  done: readonly CatAndDay[]
  children: (days: readonly CatAndDay[]) => ReactNode
}) {
  const [first, ...rest] = cats
  if (first === undefined) return children(done)
  return (
    <CatDayLoader key={first.id} cat={first} rest={rest} done={done}>
      {children}
    </CatDayLoader>
  )
}

function CatDayLoader({
  cat,
  rest,
  done,
  children,
}: {
  cat: Cat
  rest: readonly Cat[]
  done: readonly CatAndDay[]
  children: (days: readonly CatAndDay[]) => ReactNode
}) {
  const day = useCatDay(cat)
  return (
    <CatDays cats={rest} done={[...done, { cat, day }]}>
      {children}
    </CatDays>
  )
}

function HomeBody({ days }: { days: readonly CatAndDay[] }) {
  const { alerts } = useSupplies()
  const { start: today } = useToday()
  // Needs attention leads the phone's one column but heads the right-hand
  // column on a wide screen — a move between columns, which CSS order can't
  // make without dissolving the columns themselves.
  const wide = useMediaQuery('(min-width: 768px)')
  const [litterOpen, setLitterOpen] = useState(false)
  const several = days.length > 1

  const openLitter = () => {
    setLitterOpen(true)
    // After the fold has rendered open, so it scrolls to its full height.
    requestAnimationFrame(() => {
      document.getElementById('litter-boxes')?.scrollIntoView({ block: 'start' })
    })
  }

  const attention = <NeedsAttention alerts={alerts} onOpenLitter={openLitter} />

  return (
    <>
      {wide ? null : attention}
      <div className="page-columns">
        {/* Today's tasks: the bowls, then the water filled on the same trip. */}
        <div className="page-column">
          {days.map(({ cat, day }, index) => (
            <section key={cat.id} className="flex flex-col gap-3">
              <h2 className="section-label gutter break-words">
                {several ? (
                  <>
                    {cat.name} · <CatAge cat={cat} now={day.now} />
                  </>
                ) : (
                  'Meals'
                )}
              </h2>
              <CatMeals cat={cat} day={day} />
              {/* Household-level: once, straight after the last cat's bowls. */}
              {index === days.length - 1 ? <HomeWater /> : null}
            </section>
          ))}
        </div>

        {/* What's due, the weigh-in, then the folded rest. */}
        <div className="page-column">
          {wide ? attention : null}

          <section className="flex flex-col gap-3">
            <h2 className="section-label gutter">Weight</h2>
            <ul data-testid="home-weight" className="surface divide-y divide-sand">
              {days.map(({ cat, day }) => (
                <li key={cat.id}>
                  {day.weightsQuery.isLoading ? (
                    <div className="px-4 py-3">
                      <div className="h-10 animate-pulse rounded-xl bg-sand" />
                    </div>
                  ) : day.weightsQuery.isError ? (
                    <p role="alert" className="px-4 py-3 text-sm font-semibold text-danger">
                      Couldn&apos;t load {cat.name}&rsquo;s weight.
                    </p>
                  ) : (
                    <WeightRow
                      cat={cat}
                      weights={day.weightsQuery.data ?? []}
                      today={today}
                      named={several}
                    />
                  )}
                </li>
              ))}
            </ul>
          </section>

          <div className="flex flex-col gap-3">
            <OffPlanFold days={days} />
            <LitterFold open={litterOpen} onOpenChange={setLitterOpen} />
          </div>
        </div>
      </div>
    </>
  )
}

/** One cat's planned bowls — or why there are none. */
function CatMeals({ cat, day }: { cat: Cat; day: CatDay }) {
  const { canEdit } = useHousehold()
  if (day.plansQuery.isLoading || day.feedingsQuery.isLoading) return <Skeleton />
  if (day.plansQuery.isError || day.feedingsQuery.isError) {
    return <SectionError label="Couldn't load today — please try again." />
  }
  if (day.plan === null) {
    return (
      <div className="gutter flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-sm text-ink-soft">No feeding plan yet.</p>
        {canEdit ? (
          <Link to="/plan" className="btn-chip">
            Set a plan
          </Link>
        ) : null}
      </div>
    )
  }
  return <MealChecklist cat={cat} day={day} showKcal={false} />
}

/**
 * Supplies running low and boxes overdue, one line each. Absent altogether
 * when nothing is due — an empty "all good" box would be read every morning
 * for nothing.
 */
function NeedsAttention({
  alerts,
  onOpenLitter,
}: {
  alerts: readonly SupplyAlert[]
  onOpenLitter: () => void
}) {
  if (alerts.length === 0) return null

  const rowClass = 'flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left hover:bg-sand'
  const line = (alert: SupplyAlert) => (
    <>
      <span className="min-w-0 flex-1 text-sm">
        <span className="font-semibold">{alert.title}</span>{' '}
        {/* One unit: when the line wraps, "about 1 day left" moves down
        whole rather than leaving "day left" orphaned on a line of its own. */}
        <span data-testid="home-attention-detail" className="whitespace-nowrap text-danger">
          · {alert.detail}
        </span>
      </span>
      <FoldChevron turns={false} />
    </>
  )

  return (
    <section data-testid="home-attention" className="flex flex-col gap-3">
      <h2 className="section-label gutter">Needs attention</h2>
      {/* The rows' hover fill follows the card's inner corners; clipping the
      card with overflow-hidden would also cut off the keyboard focus ring. */}
      <ul className="surface divide-y divide-sand [&>li:first-child>*]:rounded-t-[calc(var(--radius-squishy)-1px)] [&>li:last-child>*]:rounded-b-[calc(var(--radius-squishy)-1px)]">
        {alerts.map((alert) => (
          <li key={alert.key} data-testid="home-attention-row">
            {alert.kind === 'litterBox' ? (
              // The boxes are on this screen: open their fold rather than
              // navigating to where we already are.
              <button type="button" onClick={onOpenLitter} className={rowClass}>
                {line(alert)}
              </button>
            ) : (
              <Link to={alert.to} className={rowClass}>
                {line(alert)}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Treats, stolen bites, a tin that wasn't on the plan: rare, so folded to one
 * line that still says whether anything was logged.
 */
function OffPlanFold({ days }: { days: readonly CatAndDay[] }) {
  const several = days.length > 1
  const count = days.reduce((total, { day }) => total + day.offPlan.length, 0)

  return (
    <details data-testid="home-off-plan" className="surface group">
      <summary
        data-testid="home-off-plan-summary"
        className="disclosure list-none gap-3 px-4 py-2 [&::-webkit-details-marker]:hidden"
      >
        <span className="min-w-0 flex-1 truncate">
          Anything off-plan{' '}
          <span className="font-normal text-ink-soft">
            · {count === 0 ? 'nothing today' : `${String(count)} today`}
          </span>
        </span>
        <FoldChevron />
      </summary>
      <div className="flex flex-col gap-5 border-t border-sand py-4">
        {days.map(({ cat, day }) => (
          <OffPlanList
            key={cat.id}
            cat={cat}
            feedings={day.offPlan}
            foods={day.activeFoods}
            inset
            showKcal={false}
            addLabel="Log something"
            emptyText={
              several
                ? 'Nothing off-plan today.'
                : 'A treat, a stolen bite, a tin that wasn’t on the plan.'
            }
            {...(several ? { heading: cat.name } : {})}
          />
        ))}
      </div>
    </details>
  )
}
