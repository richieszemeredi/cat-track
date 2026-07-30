import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { auth, isEmulatorMode } from './firebase'
import { isStandalone } from './standalone'

export interface AuthState {
  user: User | null
  /** True until the first onAuthStateChanged fires (incl. post-redirect). */
  loading: boolean
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true })

  useEffect(
    () =>
      onAuthStateChanged(auth, (user) => {
        setState({ user, loading: false })
      }),
    [],
  )

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (ctx === null) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

// Installed PWA → redirect: popups are unreliable in iOS standalone mode, and
// with authDomain set to the hosting domain the redirect stays same-site, so
// Safari's storage partitioning doesn't break it.
// Browser tab (incl. localhost dev) → popup: there the redirect flow is
// cross-origin to authDomain and browsers that partition third-party storage
// silently fail to complete it — popup + postMessage is the flow Firebase
// recommends for that case.
export async function signInWithGoogle(): Promise<void> {
  const provider = new GoogleAuthProvider()
  if (isStandalone()) {
    await signInWithRedirect(auth, provider)
  } else {
    await signInWithPopup(auth, provider)
  }
}

export async function signOutUser(): Promise<void> {
  await signOut(auth)
}

/** Emulator-only deterministic sign-in, used by dev and the e2e suite. */
export async function devSignIn(email: string, password: string): Promise<void> {
  if (!isEmulatorMode) throw new Error('devSignIn is emulator-only')
  try {
    await signInWithEmailAndPassword(auth, email, password)
  } catch {
    await createUserWithEmailAndPassword(auth, email, password)
  }
}
