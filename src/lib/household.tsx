import { useQuery } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { catsQueryOptions, useCatsLive } from './db'
import { type Cat, type Role } from './schemas'
import { readSelectedCatId, resolveActiveCat, writeSelectedCatId } from './selected-cat'

export interface HouseholdState {
  householdId: string
  role: Role
  canEdit: boolean
  cats: Cat[]
  /**
   * The cat the cat-scoped screens (/food, /weight, /profile) show: the one
   * chosen on this device, else the first (oldest-created); null pre-onboarding.
   */
  activeCat: Cat | null
  /** Switch the active cat; remembered on this device. */
  selectCat: (catId: string) => void
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

  const [selectedId, setSelectedId] = useState(() => readSelectedCatId(householdId))
  const selectCat = useCallback(
    (catId: string) => {
      setSelectedId(catId)
      writeSelectedCatId(householdId, catId)
    },
    [householdId],
  )

  const value = useMemo<HouseholdState>(
    () => ({
      householdId,
      role,
      canEdit: role === 'owner' || role === 'editor',
      cats,
      activeCat: resolveActiveCat(cats, selectedId),
      selectCat,
      catsLoading: catsQuery.isLoading,
    }),
    [householdId, role, cats, selectedId, selectCat, catsQuery.isLoading],
  )

  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>
}

export function useHousehold(): HouseholdState {
  const ctx = useContext(HouseholdContext)
  if (ctx === null) throw new Error('useHousehold must be used inside <HouseholdProvider>')
  return ctx
}
