import { createFileRoute, Link } from '@tanstack/react-router'
import { format } from 'date-fns'
import { useState } from 'react'
import { CatAge } from '../components/CatAge'
import { ErrorCard } from '../components/ErrorCard'
import { OutgrownNudge } from '../components/OutgrownNudge'
import { PlanForm } from '../components/PlanForm'
import { PlanHistory } from '../components/PlanHistory'
import { PlanSummaryRows } from '../components/PlanSummary'
import { RerMerMath } from '../components/RerMerMath'
import { SectionError, Skeleton } from '../components/SectionStatus'
import { useAuth } from '../lib/auth'
import { type Cat } from '../lib/db'
import { useHousehold } from '../lib/household'
import { isOutgrown } from '../lib/plan'
import { useCatPlan, type CatPlan } from '../lib/use-cat-day'

export const Route = createFileRoute('/plan')({
  component: PlanPage,
  errorComponent: ({ error, reset }) => <ErrorCard error={error} onRetry={reset} />,
})

const DISCLAIMER = 'Estimates only — always confirm with your vet.'
// Balanced where it is shown: wrapped plainly it left "history." alone on a line.
const CHANGE_NOTE = 'A change starts today; the old plan stays in the history.'
const NO_PLAN =
  'No feeding plan yet. Set how many meals she gets, when, and how much a day — the app works out the rest.'

function sinceLabel(date: Date): string {
  return format(date, 'd MMM')
}

function PlanPage() {
  const { cats, catsLoading, canEdit } = useHousehold()
  const [editingCatId, setEditingCatId] = useState<string | null>(null)

  if (catsLoading) {
    return (
      <main className="flex flex-col gap-6 p-4">
        <h1 className="page-title gutter">Plan</h1>
        <div className="page-solo">
          <Skeleton />
        </div>
      </main>
    )
  }

  const [firstCat] = cats
  if (firstCat === undefined) {
    return (
      <main className="flex flex-col gap-6 p-4">
        <h1 className="page-title gutter">Plan</h1>
        <div className="surface page-solo flex flex-col items-start gap-3 p-5">
          <p className="font-semibold">No cat set up yet.</p>
          <Link to="/profile" className="btn-primary">
            Add your cat
          </Link>
        </div>
      </main>
    )
  }

  const editingCat = cats.find((cat) => cat.id === editingCatId)
  if (editingCat !== undefined && canEdit) {
    return (
      <PlanEditor
        key={editingCat.id}
        cat={editingCat}
        showName={cats.length > 1}
        onDone={() => {
          setEditingCatId(null)
        }}
      />
    )
  }

  if (cats.length === 1) {
    return (
      <SoloPlan
        key={firstCat.id}
        cat={firstCat}
        onEdit={() => {
          setEditingCatId(firstCat.id)
        }}
      />
    )
  }

  // Several cats: one self-contained block each, stacked — the same shape as
  // Home, so there is no switcher to forget about.
  return (
    <main className="flex flex-col gap-7 p-4">
      <h1 className="page-title gutter">Plan</h1>
      <div className="page-columns">
        {cats.map((cat) => (
          <div key={cat.id} className="page-column">
            <CatPlanBlock
              cat={cat}
              onEdit={() => {
                setEditingCatId(cat.id)
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {canEdit ? (
          <p className="gutter text-sm text-balance text-ink-soft">{CHANGE_NOTE}</p>
        ) : null}
        <p className="gutter text-xs text-ink-soft">{DISCLAIMER}</p>
      </div>
    </main>
  )
}

/** The full-page plan form for one cat, in place of the screen. */
function PlanEditor({
  cat,
  showName,
  onDone,
}: {
  cat: Cat
  showName: boolean
  onDone: () => void
}) {
  const { householdId } = useHousehold()
  const { user } = useAuth()
  const uid = user?.uid ?? null
  const catPlan = useCatPlan(cat)
  const { plan } = catPlan
  // PlanForm reads the current plan once, when it mounts — so it must not
  // mount before the plan and its items are in.
  const loading =
    catPlan.plansQuery.isLoading || (plan !== null && catPlan.planItemsQuery.isLoading)

  return (
    // A form, not a dashboard: it keeps the phone's width on a wide screen
    // rather than stretching every field across both columns.
    <main className="mx-auto flex w-full max-w-lg flex-col gap-7 p-4">
      <header className="gutter flex flex-col gap-0.5">
        <h1 className="page-title">{plan === null ? 'Set her plan' : 'Edit plan'}</h1>
        {showName ? <p className="text-sm text-ink-soft">{cat.name}</p> : null}
      </header>
      {uid === null || loading ? (
        <Skeleton />
      ) : (
        <div className="gutter">
          <PlanForm
            hid={householdId}
            catId={cat.id}
            uid={uid}
            foods={catPlan.activeFoods}
            currentPlan={plan}
            currentItems={catPlan.planItems}
            latestWeightKg={catPlan.latestWeightKg}
            targetKcal={catPlan.target}
            onDone={onDone}
          />
        </div>
      )}
    </main>
  )
}

/** One cat: the plan on the left, the reference folds on the right from 768pt. */
function SoloPlan({ cat, onEdit }: { cat: Cat; onEdit: () => void }) {
  const { canEdit } = useHousehold()
  const catPlan = useCatPlan(cat)
  const { plan, plans, plansQuery } = catPlan
  const loading = plansQuery.isLoading || (plan !== null && catPlan.planItemsQuery.isLoading)

  return (
    <main className="flex flex-col gap-7 p-4">
      <header className="gutter flex flex-col gap-0.5">
        <h1 className="page-title">Plan</h1>
        {plan === null ? null : (
          <p data-testid="plan-since" className="text-sm text-ink-soft">
            {cat.name} · in force since {sinceLabel(plan.effectiveFrom)}
          </p>
        )}
      </header>

      {loading ? (
        <div className="page-solo">
          <Skeleton />
        </div>
      ) : plansQuery.isError ? (
        <SectionError label="Couldn't load the plan — please try again." />
      ) : (
        <div className="page-columns">
          <div className="page-column">
            {plan === null ? (
              <NoPlan onEdit={onEdit} className="gutter" />
            ) : (
              <section className="flex flex-col gap-3">
                <h2 className="section-label gutter">Every day</h2>
                <div className="surface divide-y divide-sand">
                  <PlanSummaryRows
                    plan={plan}
                    items={catPlan.planItems}
                    times={catPlan.times}
                    dailyKcal={catPlan.planDailyKcal}
                    targetKcal={catPlan.target}
                    ratio={catPlan.ratio}
                  />
                </div>
                {canEdit ? (
                  <>
                    <button
                      type="button"
                      data-testid="plan-edit"
                      onClick={onEdit}
                      className="btn-primary self-start"
                    >
                      Change the plan
                    </button>
                    <p className="gutter text-sm text-balance text-ink-soft">{CHANGE_NOTE}</p>
                  </>
                ) : null}
              </section>
            )}
            <Outgrown catPlan={catPlan} onEdit={onEdit} />
          </div>

          <div className="page-column">
            <details className="surface px-4">
              <summary className="disclosure">How the target works</summary>
              <TargetBody cat={cat} catPlan={catPlan} />
            </details>
            {plans.length > 0 ? (
              <HistoryFold
                cat={cat}
                catPlan={catPlan}
                label={`Plan history (${String(plans.length)})`}
                className="surface px-4"
              />
            ) : null}
          </div>
        </div>
      )}

      <p className="gutter text-xs text-ink-soft">{DISCLAIMER}</p>
    </main>
  )
}

/** One cat among several: name and age, then everything about her plan in one card. */
function CatPlanBlock({ cat, onEdit }: { cat: Cat; onEdit: () => void }) {
  const { canEdit } = useHousehold()
  const catPlan = useCatPlan(cat)
  const { plan, plans, plansQuery } = catPlan
  const loading = plansQuery.isLoading || (plan !== null && catPlan.planItemsQuery.isLoading)

  return (
    <section className="flex flex-col gap-3">
      <div className="gutter flex items-baseline justify-between gap-2">
        <h2 className="section-label min-w-0 break-words">
          {cat.name} · <CatAge cat={cat} now={catPlan.now} />
        </h2>
        {plan === null ? null : (
          <span className="shrink-0 text-sm text-ink-soft">
            since {sinceLabel(plan.effectiveFrom)}
          </span>
        )}
      </div>

      {loading ? (
        <Skeleton />
      ) : plansQuery.isError ? (
        <SectionError label="Couldn't load the plan — please try again." />
      ) : (
        <div className="surface divide-y divide-sand">
          {plan === null ? (
            <NoPlan onEdit={onEdit} className="p-4" />
          ) : (
            <>
              <PlanSummaryRows
                plan={plan}
                items={catPlan.planItems}
                times={catPlan.times}
                dailyKcal={catPlan.planDailyKcal}
                targetKcal={catPlan.target}
                ratio={catPlan.ratio}
              />
              {canEdit ? (
                <div className="px-4 py-3">
                  <button
                    type="button"
                    data-testid="plan-edit"
                    onClick={onEdit}
                    className="btn-chip"
                  >
                    Change the plan
                  </button>
                </div>
              ) : null}
            </>
          )}
          <details className="px-4">
            <summary className="disclosure">How the target works</summary>
            <TargetBody cat={cat} catPlan={catPlan} />
          </details>
          {plans.length > 0 ? (
            <HistoryFold
              cat={cat}
              catPlan={catPlan}
              label={`History (${String(plans.length)})`}
              className="px-4"
            />
          ) : null}
        </div>
      )}

      <Outgrown catPlan={catPlan} onEdit={onEdit} />
    </section>
  )
}

function NoPlan({ onEdit, className }: { onEdit: () => void; className: string }) {
  const { canEdit } = useHousehold()
  const { user } = useAuth()

  return (
    <div className={`flex flex-col items-start gap-3 ${className}`}>
      <p className="text-sm text-ink-soft">{canEdit ? NO_PLAN : 'No feeding plan yet.'}</p>
      {canEdit && user !== null ? (
        <button type="button" data-testid="plan-setup" onClick={onEdit} className="btn-primary">
          Set her plan
        </button>
      ) : null}
    </div>
  )
}

/** The outgrown nudge, only while the plan has drifted off her target. */
function Outgrown({ catPlan, onEdit }: { catPlan: CatPlan; onEdit: () => void }) {
  const { canEdit } = useHousehold()
  const { plan, target, planDailyKcal } = catPlan
  if (plan === null || target === null || !isOutgrown(planDailyKcal, target)) return null

  return (
    <OutgrownNudge
      plan={plan}
      items={catPlan.planItems}
      kcalPerGram={catPlan.kcalPerGram}
      dailyKcal={planDailyKcal}
      targetKcal={target}
      latestWeightKg={catPlan.latestWeightKg}
      canEdit={canEdit}
      onBump={onEdit}
    />
  )
}

function TargetBody({ cat, catPlan }: { cat: Cat; catPlan: CatPlan }) {
  return (
    <div className="pb-4">
      {catPlan.weightsQuery.isLoading ? (
        <Skeleton />
      ) : (
        <RerMerMath cat={cat} latestWeightKg={catPlan.latestWeightKg} now={catPlan.now} />
      )}
    </div>
  )
}

/** Every plan she has had. Folded, and its reads only happen once it is opened. */
function HistoryFold({
  cat,
  catPlan,
  label,
  className,
}: {
  cat: Cat
  catPlan: CatPlan
  label: string
  className: string
}) {
  const { householdId, canEdit } = useHousehold()
  const [open, setOpen] = useState(false)

  return (
    <details
      className={className}
      onToggle={(e) => {
        setOpen(e.currentTarget.open)
      }}
    >
      <summary className="disclosure">{label}</summary>
      <div className="pb-4">
        {open ? (
          <PlanHistory
            hid={householdId}
            catId={cat.id}
            plans={catPlan.plans}
            kcalPerGram={catPlan.kcalPerGram}
            canEdit={canEdit}
          />
        ) : null}
      </div>
    </details>
  )
}
