import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { differenceInDays, format } from 'date-fns'
import { useState } from 'react'
import { ErrorCard } from '../components/ErrorCard'
import { GrowthChart } from '../components/GrowthChart'
import { WeighForm } from '../components/WeighForm'
import { useAuth } from '../lib/auth'
import { roundKg } from '../lib/catmath'
import { awaitOrQueued, deleteWeightEntry, useWeightsLive, weightsQueryOptions } from '../lib/db'
import { useHousehold } from '../lib/household'
import { type Cat, type WeightEntry } from '../lib/schemas'
import { effectiveLifeStage } from '../lib/target'

export const Route = createFileRoute('/weight')({
  component: WeightPage,
  errorComponent: ({ error, reset }) => <ErrorCard error={error} onRetry={reset} />,
})

function WeightPage() {
  const { householdId, canEdit, activeCat, catsLoading } = useHousehold()
  const { user } = useAuth()

  return (
    <main className="flex flex-col gap-7 p-4">
      <h1 className="page-title">Weight</h1>
      {catsLoading ? (
        <div className="h-24 animate-pulse rounded-squishy bg-sand" />
      ) : activeCat === null ? (
        <NoCatCard />
      ) : (
        <WeightBody hid={householdId} cat={activeCat} canEdit={canEdit} uid={user?.uid ?? null} />
      )}
    </main>
  )
}

function WeightBody({
  hid,
  cat,
  canEdit,
  uid,
}: {
  hid: string
  cat: Cat
  canEdit: boolean
  uid: string | null
}) {
  const weightsQuery = useQuery(weightsQueryOptions(hid, cat.id))
  useWeightsLive(hid, cat.id)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  if (weightsQuery.isLoading) return <div className="h-24 animate-pulse rounded-squishy bg-sand" />
  if (weightsQuery.isError) {
    return (
      <ErrorCard
        title="Couldn't load weigh-ins"
        error={weightsQuery.error}
        onRetry={() => {
          void weightsQuery.refetch()
        }}
      />
    )
  }

  const entries = weightsQuery.data ?? []
  const now = new Date()
  const latest = entries.at(-1)
  const previous = entries.at(-2)

  const stage = effectiveLifeStage(cat, now)
  const isKitten = stage === 'kitten_0_4' || stage === 'kitten_4_12'

  const nudge =
    latest === undefined
      ? 'First weigh-in — kittens should be weighed weekly.'
      : differenceInDays(now, latest.date) > 7
        ? 'Time for the weekly weigh-in.'
        : null

  // Change since the previous weigh-in — shown raw, never extrapolated: with
  // the weekly weigh-in cadence this IS the weekly change, and scaling a
  // short gap up to 7 days would only amplify kitchen-scale noise.
  let change: { delta: number; sinceLabel: string } | null = null
  if (latest !== undefined && previous !== undefined) {
    change = {
      delta: latest.weightKg - previous.weightKg,
      sinceLabel: format(previous.date, 'MMM d'),
    }
  }

  const handleDelete = (entryId: string) => {
    setDeleteError(null)
    awaitOrQueued(deleteWeightEntry(hid, cat.id, entryId)).catch((err: unknown) => {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete the weigh-in.')
    })
  }

  return (
    <>
      {/* The one number this screen leads with. */}
      <section className="flex flex-col gap-2">
        <h2 className="section-label">Latest</h2>
        <p className="flex items-baseline gap-2">
          <span
            data-testid="weight-latest"
            className="text-5xl font-bold tracking-tight tabular-nums"
          >
            {latest === undefined ? '—' : `${roundKg(latest.weightKg).toFixed(2)} kg`}
          </span>
        </p>
        <p className="text-sm text-ink-soft">
          {latest === undefined ? (
            'No weigh-ins yet'
          ) : change === null ? (
            format(latest.date, 'MMM d')
          ) : (
            <>
              {format(latest.date, 'MMM d')} ·{' '}
              <span
                className={change.delta > 0 && isKitten ? 'font-semibold text-positive' : undefined}
              >
                {change.delta >= 0 ? '+' : ''}
                {roundKg(change.delta).toFixed(2)} kg
              </span>{' '}
              since {change.sinceLabel}
            </>
          )}
        </p>
        {nudge === null ? null : <p className="text-sm text-coral-ink">{nudge}</p>}
      </section>

      <section data-testid="weight-chart" className="flex flex-col gap-3">
        <h2 className="section-label">Growth</h2>
        <div className="surface p-4">
          <GrowthChart cat={cat} entries={entries} />
        </div>
        <p className="text-xs text-ink-soft">Estimates only — always confirm with your vet.</p>
      </section>

      {canEdit && uid !== null ? (
        <section className="flex flex-col gap-3">
          <h2 className="section-label">Add weigh-in</h2>
          <div className="surface p-4">
            <WeighForm hid={hid} catId={cat.id} uid={uid} />
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="section-label">History</h2>
        {deleteError === null ? null : (
          <p role="alert" className="text-sm font-semibold text-danger">
            {deleteError}
          </p>
        )}
        {entries.length === 0 ? (
          <p className="text-sm text-ink-soft">No weigh-ins yet.</p>
        ) : (
          <ul className="surface divide-y divide-sand">
            {[...entries].reverse().map((entry) => (
              <HistoryRow
                key={entry.id}
                entry={entry}
                canEdit={canEdit}
                onDelete={() => {
                  if (window.confirm('Delete this weigh-in?')) {
                    handleDelete(entry.id)
                  }
                }}
              />
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

function HistoryRow({
  entry,
  canEdit,
  onDelete,
}: {
  entry: WeightEntry
  canEdit: boolean
  onDelete: () => void
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="w-20 shrink-0 font-semibold tabular-nums">
        {roundKg(entry.weightKg).toFixed(2)} kg
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-sm text-ink-soft">{format(entry.date, 'MMM d, yyyy')}</span>
        {entry.note === null ? null : (
          <span className="block text-sm break-words text-ink-soft">{entry.note}</span>
        )}
      </span>
      {canEdit ? (
        <button
          type="button"
          aria-label="Delete weigh-in"
          onClick={onDelete}
          className="-mr-1 shrink-0 px-1 text-lg leading-none text-ink-soft active:scale-95"
        >
          ×
        </button>
      ) : null}
    </li>
  )
}

function NoCatCard() {
  return (
    <div className="surface flex flex-col items-start gap-3 p-5">
      <p className="font-semibold">No cat set up yet.</p>
      <Link to="/profile" className="btn-primary">
        Add your cat
      </Link>
    </div>
  )
}
