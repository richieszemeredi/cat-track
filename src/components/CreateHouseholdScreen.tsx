import { useQueryClient } from '@tanstack/react-query'
import { type User } from 'firebase/auth'
import { useState, type SubmitEvent } from 'react'
import { awaitOrQueued, createHouseholdWithOwner, membershipQueryOptions } from '../lib/db'

/** First-run: the signed-in user has no household yet — create one. */
export function CreateHouseholdScreen({ user }: { user: User }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('Our home')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (trimmed.length === 0) return
    setBusy(true)
    setError(null)
    awaitOrQueued(createHouseholdWithOwner(trimmed, user))
      .then(() => queryClient.invalidateQueries(membershipQueryOptions(user.uid)))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not create the household.')
      })
      .finally(() => {
        setBusy(false)
      })
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-6 p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <span aria-hidden="true" className="text-5xl">
          🏡
        </span>
        <h1 className="text-2xl font-extrabold">Set up your household</h1>
        <p className="text-sm font-semibold text-ink-soft">
          Everyone in the household shares the same cat log.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3">
        <label className="font-semibold">
          Household name
          <input
            type="text"
            value={name}
            required
            maxLength={60}
            onChange={(event) => {
              setName(event.target.value)
            }}
            className="mt-1 w-full rounded-xl border border-coral-soft bg-white px-3 py-2"
            data-testid="household-name"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-coral px-6 py-3 font-extrabold text-white shadow-squishy active:scale-95 disabled:opacity-60"
          data-testid="household-create"
        >
          Create household
        </button>
        {error === null ? null : (
          <p role="alert" className="text-sm font-semibold text-danger">
            {error}
          </p>
        )}
      </form>
    </main>
  )
}
