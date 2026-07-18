import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState, type SubmitEvent } from 'react'
import { CatForm } from '../components/CatForm'
import { ErrorCard } from '../components/ErrorCard'
import { signOutUser, useAuth } from '../lib/auth'
import { ageLabel, LIFE_STAGE_LABELS, MER_MULTIPLIERS } from '../lib/catmath'
import { addMember, awaitOrQueued, membersQueryOptions, useMembersLive, type Cat } from '../lib/db'
import { useHousehold } from '../lib/household'
import { type Role, type Sex } from '../lib/schemas'
import { effectiveLifeStage } from '../lib/target'

export const Route = createFileRoute('/profile')({
  component: ProfilePage,
  errorComponent: ({ error, reset }) => <ErrorCard error={error} onRetry={reset} />,
})

const FIELD = 'mt-1 w-full rounded-xl border border-coral-soft bg-white px-3 py-2'

const SEX_LABELS: Record<Sex, string> = {
  male: 'Male',
  female: 'Female',
  unknown: 'Sex unknown',
}

const ROLE_BADGE: Record<Role, string> = {
  owner: 'bg-butter text-ink',
  editor: 'bg-mint-soft text-mint-deep',
  viewer: 'bg-coral-soft text-coral-ink',
}

function ProfilePage() {
  const { user } = useAuth()
  const { householdId, role, canEdit, activeCat, catsLoading } = useHousehold()

  // The app shell only renders routes for signed-in users.
  if (user === null) return null

  return (
    <main className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-extrabold">
        Profile <span aria-hidden="true">🐱</span>
      </h1>

      {catsLoading ? (
        <CatSkeleton />
      ) : activeCat === null ? (
        <NoCatCard canEdit={canEdit} hid={householdId} uid={user.uid} />
      ) : (
        <CatCard cat={activeCat} canEdit={canEdit} hid={householdId} uid={user.uid} />
      )}

      <HouseholdCard hid={householdId} role={role} />

      <div className="flex flex-col items-center gap-3 pt-2">
        <button
          type="button"
          onClick={() => {
            void signOutUser()
          }}
          className="rounded-full border border-coral-soft px-5 py-2 font-bold"
        >
          Sign out
        </button>
        <p className="text-xs font-semibold text-ink-soft">
          CatTrack · made with <span aria-hidden="true">🧡</span> for the kitten
        </p>
      </div>
    </main>
  )
}

function CatSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading cat profile"
      className="flex flex-col gap-3 rounded-squishy bg-white p-4 shadow-squishy"
    >
      <div aria-hidden="true" className="h-8 w-2/5 animate-pulse rounded-full bg-coral-soft" />
      <div aria-hidden="true" className="h-4 w-3/5 animate-pulse rounded-full bg-coral-soft" />
      <div aria-hidden="true" className="h-4 w-1/2 animate-pulse rounded-full bg-coral-soft" />
    </div>
  )
}

function NoCatCard({ canEdit, hid, uid }: { canEdit: boolean; hid: string; uid: string }) {
  return (
    <section className="flex flex-col gap-4 rounded-squishy bg-white p-4 shadow-squishy">
      <div className="flex flex-col items-center gap-1 text-center">
        <span aria-hidden="true" className="text-5xl">
          🎉
        </span>
        <h2 className="text-lg font-extrabold">Tell us about your kitten!</h2>
        <p className="text-sm font-semibold text-ink-soft">
          {canEdit
            ? 'Fill this in once and CatTrack does the calorie math for you.'
            : 'Ask the owner to set up the cat profile.'}
        </p>
      </div>
      {canEdit ? <CatForm hid={hid} uid={uid} /> : null}
    </section>
  )
}

function CatCard({
  cat,
  canEdit,
  hid,
  uid,
}: {
  cat: Cat
  canEdit: boolean
  hid: string
  uid: string
}) {
  const [editing, setEditing] = useState(false)
  const now = new Date()
  const stage = effectiveLifeStage(cat, now)
  const multiplier = cat.merMultiplierOverride ?? MER_MULTIPLIERS[stage]

  return (
    <section className="flex flex-col gap-3 rounded-squishy bg-white p-4 shadow-squishy">
      <div>
        <h2 className="text-3xl font-extrabold">
          <span aria-hidden="true">🐾</span> {cat.name}
        </h2>
        <p className="text-sm font-semibold text-ink-soft">{ageLabel(cat.birthDate, now)} old</p>
      </div>

      <div className="flex flex-col gap-1 text-sm font-semibold">
        <p>
          {SEX_LABELS[cat.sex]} · {cat.neutered ? 'neutered' : 'not neutered'}
        </p>
        {cat.breed === null ? null : <p>Breed: {cat.breed}</p>}
        <p>
          Life stage: {LIFE_STAGE_LABELS[stage]}
          {cat.lifeStage === null ? <span className="text-ink-soft"> (auto)</span> : null}
        </p>
        <p>
          MER multiplier: {String(multiplier)} × RER
          {cat.merMultiplierOverride === null ? null : (
            <span className="text-ink-soft"> (vet override)</span>
          )}
        </p>
      </div>

      <p className="text-xs text-ink-soft">Estimates only — always confirm with your vet.</p>

      {canEdit ? (
        <button
          type="button"
          onClick={() => {
            setEditing((open) => !open)
          }}
          className={
            editing
              ? 'self-start rounded-full border border-coral-soft px-5 py-2 font-bold'
              : 'self-start rounded-full bg-coral px-5 py-2 font-extrabold text-ink active:scale-95'
          }
        >
          {editing ? (
            'Close editor'
          ) : (
            <>
              Edit profile <span aria-hidden="true">✏️</span>
            </>
          )}
        </button>
      ) : null}

      {editing ? (
        <CatForm
          hid={hid}
          uid={uid}
          existing={cat}
          onDone={() => {
            setEditing(false)
          }}
        />
      ) : null}
    </section>
  )
}

function HouseholdCard({ hid, role }: { hid: string; role: Role }) {
  const membersQuery = useQuery(membersQueryOptions(hid))
  useMembersLive(hid)

  const members = membersQuery.data

  return (
    <section className="flex flex-col gap-3 rounded-squishy bg-white p-4 shadow-squishy">
      <h2 className="text-lg font-extrabold">
        <span aria-hidden="true">🏡</span> Household
      </h2>

      {membersQuery.isLoading ? (
        <p className="text-sm font-semibold text-ink-soft">Loading members…</p>
      ) : membersQuery.isError ? (
        <div className="flex flex-col items-start gap-2">
          <p role="alert" className="text-sm font-semibold text-danger">
            Couldn’t load the member list.
          </p>
          <button
            type="button"
            onClick={() => {
              void membersQuery.refetch()
            }}
            className="rounded-full bg-coral px-4 py-1.5 text-sm font-extrabold text-ink active:scale-95"
          >
            Try again
          </button>
        </div>
      ) : members === undefined || members.length === 0 ? (
        <p className="text-sm font-semibold text-ink-soft">No members found yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {members.map((member) => (
            <li key={member.id} className="flex items-center justify-between gap-2">
              <span className="font-semibold">{member.displayName}</span>
              <span
                className={`rounded-full px-3 py-0.5 text-xs font-extrabold ${ROLE_BADGE[member.role]}`}
              >
                {member.role}
              </span>
            </li>
          ))}
        </ul>
      )}

      {role === 'owner' ? <AddMemberForm hid={hid} /> : null}
    </section>
  )
}

function AddMemberForm({ hid }: { hid: string }) {
  const [memberUid, setMemberUid] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [memberRole, setMemberRole] = useState<'editor' | 'viewer'>('editor')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setFlash(null)
    const uid = memberUid.trim()
    const name = displayName.trim()
    if (uid === '' || name === '') {
      setError('Both the user ID and a display name are needed.')
      return
    }
    setBusy(true)
    awaitOrQueued(addMember(hid, { uid, role: memberRole, displayName: name }))
      .then((result) => {
        setFlash(
          result === 'queued' ? 'Member added — will sync when back online 📶' : 'Member added! 🎉',
        )
        setMemberUid('')
        setDisplayName('')
        setMemberRole('editor')
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not add the member.')
      })
      .finally(() => {
        setBusy(false)
      })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-xl bg-cream p-3">
      <h3 className="font-extrabold">
        Add a member <span aria-hidden="true">➕</span>
      </h3>

      <label className="text-sm font-semibold">
        User ID
        <input
          type="text"
          value={memberUid}
          required
          onChange={(event) => {
            setMemberUid(event.target.value)
          }}
          className={FIELD}
        />
      </label>

      <label className="text-sm font-semibold">
        Display name
        <input
          type="text"
          value={displayName}
          required
          maxLength={60}
          onChange={(event) => {
            setDisplayName(event.target.value)
          }}
          className={FIELD}
        />
      </label>

      <label className="text-sm font-semibold">
        Role
        <select
          value={memberRole}
          onChange={(event) => {
            setMemberRole(event.target.value === 'viewer' ? 'viewer' : 'editor')
          }}
          className={FIELD}
        >
          <option value="editor">Editor — can log food & weights</option>
          <option value="viewer">Viewer — can only look</option>
        </select>
      </label>

      <button
        type="submit"
        disabled={busy}
        className="rounded-full bg-coral px-5 py-2 font-extrabold text-ink active:scale-95 disabled:opacity-60"
      >
        Add member
      </button>

      <p className="text-xs text-ink-soft">
        Your partner signs in with Google once, then you paste their user ID here. (Invite links
        come later.)
      </p>

      {flash === null ? null : <p className="text-sm font-semibold text-mint-deep">{flash}</p>}
      {error === null ? null : (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </form>
  )
}
