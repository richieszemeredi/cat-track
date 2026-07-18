import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { auth, isEmulatorMode } from './firebase'

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

// Redirect, not popup: popups are unreliable in iOS standalone PWA mode.
export async function signInWithGoogle(): Promise<void> {
  await signInWithRedirect(auth, new GoogleAuthProvider())
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
