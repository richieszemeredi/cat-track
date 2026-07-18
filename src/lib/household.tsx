import { useQuery } from '@tanstack/react-query'
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { catsQueryOptions, useCatsLive } from './db'
import { type Cat, type Role } from './schemas'

export interface HouseholdState {
  householdId: string
  role: Role
  canEdit: boolean
  cats: Cat[]
  /** MVP is single-cat: the first (oldest-created) cat, or null pre-onboarding. */
  activeCat: Cat | null
  catsLoading: boolean
}

const HouseholdContext = createContext<HouseholdState | null>(null)

export function HouseholdProvider({
  householdId,
  role,
  children,
}: {
  householdId: string
  role: Role
  children: ReactNode
}) {
  const catsQuery = useQuery(catsQueryOptions(householdId))
  useCatsLive(householdId)

  const cats = useMemo(() => catsQuery.data ?? [], [catsQuery.data])

  const value = useMemo<HouseholdState>(
    () => ({
      householdId,
      role,
      canEdit: role === 'owner' || role === 'editor',
      cats,
      activeCat: cats[0] ?? null,
      catsLoading: catsQuery.isLoading,
    }),
    [householdId, role, cats, catsQuery.isLoading],
  )

  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>
}

export function useHousehold(): HouseholdState {
  const ctx = useContext(HouseholdContext)
  if (ctx === null) throw new Error('useHousehold must be used inside <HouseholdProvider>')
  return ctx
}
