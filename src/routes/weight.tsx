import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { differenceInDays, format } from 'date-fns'
import { useState } from 'react'
import { ErrorCard } from '../components/ErrorCard'
import { GrowthChart } from '../components/GrowthChart'
import { StatCard } from '../components/StatCard'
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
    <main className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-extrabold">
        Weight <span aria-hidden="true">⚖️</span>
      </h1>
      {catsLoading ? (
        <LoadingCard label="Fetching your cat…" />
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

  if (weightsQuery.isLoading) return <LoadingCard label="Fetching weigh-ins…" />
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
      ? 'First weigh-in! Kittens should be weighed weekly.'
      : differenceInDays(now, latest.date) > 7
        ? 'Time for the weekly weigh-in!'
        : null

  // Weekly change: delta between the last two entries, scaled to a 7-day pace
  // using the actual gap between them.
  let weekly: { delta: number; sinceLabel: string } | null = null
  if (latest !== undefined && previous !== undefined) {
    const gapDays = differenceInDays(latest.date, previous.date)
    if (gapDays > 0) {
      weekly = {
        delta: ((latest.weightKg - previous.weightKg) / gapDays) * 7,
        sinceLabel: format(previous.date, 'MMM d'),
      }
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
      {nudge === null ? null : (
        <p className="rounded-squishy bg-butter p-3 text-sm font-semibold">
          {nudge} <span aria-hidden="true">🐾</span>
        </p>
      )}

      <div className="grid grid-cols-2 gap-4">
        <StatCard
          label="Latest"
          emoji="⚖️"
          value={
            <span data-testid="weight-latest">
              {latest === undefined ? '—' : `${roundKg(latest.weightKg).toFixed(2)} kg`}
            </span>
          }
          {...(latest !== undefined ? { sub: format(latest.date, 'MMM d') } : {})}
        />
        <StatCard
          label="Weekly change"
          emoji="📈"
          tone={weekly !== null && weekly.delta > 0 && isKitten ? 'mint' : 'plain'}
          value={
            weekly === null
              ? '—'
              : `${weekly.delta >= 0 ? '+' : ''}${roundKg(weekly.delta).toFixed(2)} kg`
          }
          {...(weekly !== null ? { sub: `since ${weekly.sinceLabel}` } : {})}
        />
      </div>

      <section
        data-testid="weight-chart"
        className="flex flex-col gap-2 rounded-squishy bg-white p-4 shadow-squishy"
      >
        <h2 className="text-lg font-extrabold">
          Growth <span aria-hidden="true">🌱</span>
        </h2>
        <GrowthChart cat={cat} entries={entries} />
        <p className="text-xs text-ink-soft">Estimates only — always confirm with your vet.</p>
      </section>

      {canEdit && uid !== null ? (
        <section className="flex flex-col gap-3 rounded-squishy bg-white p-4 shadow-squishy">
          <h2 className="text-lg font-extrabold">
            Add weigh-in <span aria-hidden="true">📝</span>
          </h2>
          <WeighForm hid={hid} catId={cat.id} uid={uid} />
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-extrabold">
          History <span aria-hidden="true">📜</span>
        </h2>
        {deleteError === null ? null : (
          <p role="alert" className="text-sm font-semibold text-danger">
            {deleteError}
          </p>
        )}
        {entries.length === 0 ? (
          <div className="rounded-squishy bg-white p-6 text-center shadow-squishy">
            <p className="text-sm font-semibold text-ink-soft">
              No weigh-ins yet — grab the kitchen scale! <span aria-hidden="true">🐾</span>
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
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
    <li className="flex items-center justify-between gap-3 rounded-squishy bg-white p-4 shadow-squishy">
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-lg font-extrabold">{roundKg(entry.weightKg).toFixed(2)} kg</span>
          {entry.bodyConditionScore === null ? null : (
            <span className="rounded-full bg-peach px-2 py-0.5 text-xs font-bold text-ink">
              BCS {entry.bodyConditionScore}/9
            </span>
          )}
        </div>
        <span className="text-sm text-ink-soft">{format(entry.date, 'MMM d, yyyy')}</span>
        {entry.note === null ? null : <p className="text-sm break-words">{entry.note}</p>}
      </div>
      {canEdit ? (
        <button
          type="button"
          aria-label="Delete weigh-in"
          onClick={onDelete}
          className="shrink-0 rounded-full bg-coral-soft p-2 text-coral-deep active:scale-95"
        >
          <span aria-hidden="true">🗑️</span>
        </button>
      ) : null}
    </li>
  )
}

function LoadingCard({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-squishy bg-white p-4 shadow-squishy">
      <p className="text-sm font-semibold text-ink-soft">{label}</p>
      <div className="h-4 w-2/3 animate-pulse rounded-full bg-coral-soft" />
      <div className="h-4 w-1/2 animate-pulse rounded-full bg-coral-soft" />
    </div>
  )
}

function NoCatCard() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-squishy bg-white p-6 text-center shadow-squishy">
      <span aria-hidden="true" className="text-4xl">
        🐱
      </span>
      <p className="font-semibold">
        Set up your cat’s profile first <span aria-hidden="true">🐾</span>
      </p>
      <Link
        to="/profile"
        className="rounded-full bg-coral px-5 py-2 font-extrabold text-white active:scale-95"
      >
        Go to profile
      </Link>
    </div>
  )
}
