import { FirebaseError } from 'firebase/app'
import { getRedirectResult } from 'firebase/auth'
import { useEffect, useState, type SubmitEvent } from 'react'
import { devSignIn, signInWithGoogle } from '../lib/auth'
import { auth, isEmulatorMode } from '../lib/firebase'

export function SignInScreen() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Coming back from signInWithRedirect: success lands via onAuthStateChanged,
  // but FAILURES (unauthorized domain, blocked storage, cancelled flow) only
  // surface through getRedirectResult — without this they'd be swallowed and
  // the user would just see the sign-in button again with no explanation.
  useEffect(() => {
    getRedirectResult(auth).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Sign-in failed — please try again.')
    })
  }, [])

  const handleGoogle = () => {
    setBusy(true)
    setError(null)
    signInWithGoogle()
      .catch((err: unknown) => {
        // Closing the popup yourself isn't an error worth shouting about.
        if (
          err instanceof FirebaseError &&
          (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request')
        ) {
          return
        }
        setError(err instanceof Error ? err.message : 'Sign-in failed — please try again.')
      })
      .finally(() => {
        setBusy(false)
      })
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-6 p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <span aria-hidden="true" className="text-6xl">
          🐱
        </span>
        <h1 className="text-3xl font-extrabold">CatTrack</h1>
        <p className="font-semibold text-ink-soft">
          Food, weight &amp; health for your kitten — together.
        </p>
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={handleGoogle}
        className="rounded-full bg-coral px-8 py-3 text-lg font-extrabold text-ink shadow-squishy active:scale-95 disabled:opacity-60"
      >
        Sign in with Google
      </button>

      {error === null ? null : (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      {isEmulatorMode ? <DevSignInForm onError={setError} /> : null}
    </main>
  )
}

/** Emulator-only email/password sign-in so dev + e2e are deterministic. */
function DevSignInForm({ onError }: { onError: (message: string | null) => void }) {
  const [email, setEmail] = useState('dev@example.com')
  const [password, setPassword] = useState('password123')

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    onError(null)
    devSignIn(email, password).catch((err: unknown) => {
      onError(err instanceof Error ? err.message : 'Dev sign-in failed')
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full flex-col gap-2 rounded-squishy border border-coral-soft bg-white p-4"
      data-testid="dev-sign-in"
    >
      <p className="text-xs font-bold tracking-wide text-ink-soft uppercase">
        Emulator dev sign-in
      </p>
      <label className="text-sm font-semibold">
        Email
        <input
          type="email"
          value={email}
          required
          onChange={(event) => {
            setEmail(event.target.value)
          }}
          className="mt-1 w-full rounded-xl border border-coral-soft px-3 py-2"
          data-testid="dev-email"
        />
      </label>
      <label className="text-sm font-semibold">
        Password
        <input
          type="password"
          value={password}
          required
          minLength={6}
          onChange={(event) => {
            setPassword(event.target.value)
          }}
          className="mt-1 w-full rounded-xl border border-coral-soft px-3 py-2"
          data-testid="dev-password"
        />
      </label>
      <button
        type="submit"
        className="mt-1 rounded-full bg-ink px-4 py-2 font-bold text-white active:scale-95"
        data-testid="dev-submit"
      >
        Dev sign in
      </button>
    </form>
  )
}
