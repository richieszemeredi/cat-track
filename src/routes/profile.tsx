import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState, type ReactNode, type SubmitEvent } from 'react'
import { CatForm } from '../components/CatForm'
import { ErrorCard } from '../components/ErrorCard'
import { signOutUser, useAuth } from '../lib/auth'
import { ageLabelLong, LIFE_STAGE_LABELS, MER_MULTIPLIERS } from '../lib/catmath'
import { addMember, awaitOrQueued, membersQueryOptions, useMembersLive, type Cat } from '../lib/db'
import { useHousehold } from '../lib/household'
import { type Role, type Sex } from '../lib/schemas'
import { effectiveLifeStage } from '../lib/target'

export const Route = createFileRoute('/profile')({
  component: ProfilePage,
  errorComponent: ({ error, reset }) => <ErrorCard error={error} onRetry={reset} />,
})

const FIELD = 'field mt-1'

const SEX_LABELS: Record<Sex, string> = {
  male: 'Male',
  female: 'Female',
  unknown: 'Sex unknown',
}

// Roles are metadata, not status — one quiet outlined tag for all three.
const ROLE_BADGE =
  'rounded-full border border-sand-deep px-2 py-0.5 text-xs font-medium text-ink-soft'

function ProfilePage() {
  const { user } = useAuth()
  const { householdId, role, canEdit, activeCat, catsLoading } = useHousehold()

  // The app shell only renders routes for signed-in users.
  if (user === null) return null

  return (
    <main className="flex flex-col gap-7 p-4">
      <h1 className="page-title">Profile</h1>

      {catsLoading ? (
        <CatSkeleton />
      ) : activeCat === null ? (
        <NoCatCard canEdit={canEdit} hid={householdId} uid={user.uid} />
      ) : (
        <CatCard cat={activeCat} canEdit={canEdit} hid={householdId} uid={user.uid} />
      )}

      <HouseholdCard hid={householdId} role={role} />

      <div className="flex flex-col items-start gap-4">
        <button
          type="button"
          onClick={() => {
            void signOutUser()
          }}
          className="btn-secondary"
        >
          Sign out
        </button>
        <p className="text-xs text-ink-soft">CatTrack</p>
      </div>
    </main>
  )
}

function CatSkeleton() {
  return (
    <div role="status" aria-label="Loading cat profile" className="flex flex-col gap-3">
      <div aria-hidden="true" className="h-8 w-2/5 animate-pulse rounded-full bg-sand" />
      <div aria-hidden="true" className="h-4 w-3/5 animate-pulse rounded-full bg-sand" />
      <div aria-hidden="true" className="h-4 w-1/2 animate-pulse rounded-full bg-sand" />
    </div>
  )
}

function NoCatCard({ canEdit, hid, uid }: { canEdit: boolean; hid: string; uid: string }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="section-label">Your cat</h2>
        <p className="text-sm text-ink-soft">
          {canEdit
            ? 'Fill this in once and the calorie math takes care of itself.'
            : 'Ask the owner to set up the cat profile.'}
        </p>
      </div>
      {canEdit ? (
        <div className="surface p-4">
          <CatForm hid={hid} uid={uid} />
        </div>
      ) : null}
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
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-2xl font-bold">{cat.name}</h2>
        <p className="text-sm text-ink-soft">{ageLabelLong(cat.birthDate, now)}</p>
      </div>

      {/* Facts as a definition list: the label carries the structure, so the
          values do not all have to shout in bold. */}
      <dl className="surface divide-y divide-sand text-sm">
        <Fact label="Sex">
          {SEX_LABELS[cat.sex]} · {cat.neutered ? 'neutered' : 'not neutered'}
        </Fact>
        {cat.breed === null ? null : <Fact label="Breed">{cat.breed}</Fact>}
        <Fact label="Life stage">
          {LIFE_STAGE_LABELS[stage]}
          {cat.lifeStage === null ? <span className="text-ink-soft"> (auto)</span> : null}
        </Fact>
        <Fact label="MER multiplier">
          {String(multiplier)} × RER
          {cat.merMultiplierOverride === null ? null : (
            <span className="text-ink-soft"> (vet override)</span>
          )}
        </Fact>
      </dl>

      <p className="text-xs text-ink-soft">Estimates only — always confirm with your vet.</p>

      {canEdit ? (
        <button
          type="button"
          onClick={() => {
            setEditing((open) => !open)
          }}
          className={editing ? 'btn-secondary self-start' : 'btn-primary self-start'}
        >
          {editing ? 'Close editor' : 'Edit profile'}
        </button>
      ) : null}

      {editing ? (
        <div className="surface p-4">
          <CatForm
            hid={hid}
            uid={uid}
            existing={cat}
            onDone={() => {
              setEditing(false)
            }}
          />
        </div>
      ) : null}
    </section>
  )
}

function HouseholdCard({ hid, role }: { hid: string; role: Role }) {
  const membersQuery = useQuery(membersQueryOptions(hid))
  useMembersLive(hid)

  const members = membersQuery.data

  return (
    <section className="flex flex-col gap-3">
      <h2 className="section-label">Household</h2>

      {membersQuery.isLoading ? (
        <p className="text-sm text-ink-soft">Loading…</p>
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
            className="btn-chip"
          >
            Try again
          </button>
        </div>
      ) : members === undefined || members.length === 0 ? (
        <p className="text-sm text-ink-soft">No members found yet.</p>
      ) : (
        <ul className="surface divide-y divide-sand">
          {members.map((member) => (
            <li key={member.id} className="flex items-center justify-between gap-3 px-4 py-3">
              {/* Display names are often long emails — truncate, never push
                  the role badge off the row. */}
              <span className="min-w-0 truncate font-medium">{member.displayName}</span>
              <span className={ROLE_BADGE}>{member.role}</span>
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
    <form onSubmit={handleSubmit} className="surface flex flex-col gap-3 p-4">
      <h3 className="section-label">Add a member</h3>

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

      <button type="submit" disabled={busy} className="btn-primary">
        Add member
      </button>

      <p className="text-xs text-ink-soft">
        Your partner signs in with Google once, then you paste their user ID here. (Invite links
        come later.)
      </p>

      {flash === null ? null : <p className="text-sm font-semibold text-positive">{flash}</p>}
      {error === null ? null : (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </form>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-2.5">
      <dt className="shrink-0 text-ink-soft">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  )
}
