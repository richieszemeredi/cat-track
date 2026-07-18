import { useQuery } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import { type User } from 'firebase/auth'
import { ErrorBoundary } from 'react-error-boundary'
import { CreateHouseholdScreen } from '../components/CreateHouseholdScreen'
import { ErrorCard } from '../components/ErrorCard'
import { InstallPrompt } from '../components/InstallPrompt'
import { OfflineBanner } from '../components/OfflineBanner'
import { SignInScreen } from '../components/SignInScreen'
import { Splash } from '../components/Splash'
import { TabBar } from '../components/TabBar'
import { UpdateToast } from '../components/UpdateToast'
import { useAuth } from '../lib/auth'
import { membershipQueryOptions } from '../lib/db'
import { HouseholdProvider } from '../lib/household'
import { type RouterContext } from '../lib/router-context'
import { useOnline } from '../lib/use-online'

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
  errorComponent: ({ error, reset }) => <ErrorCard error={error} onRetry={reset} />,
  notFoundComponent: () => <ErrorCard title="This page wandered off" />,
})

function RootComponent() {
  const { user, loading } = useAuth()
  return (
    <>
      {loading ? <Splash /> : user === null ? <SignInScreen /> : <MembershipGate user={user} />}
      {/* Mounted on every screen (incl. sign-in): useRegisterSW inside is the
          only thing that registers the service worker, and the offline app
          shell must work before the user is signed in. */}
      <UpdateToast />
    </>
  )
}

function MembershipGate({ user }: { user: User }) {
  const online = useOnline()
  const membership = useQuery({
    ...membershipQueryOptions(user.uid),
    // Poll while unresolved: when the owner adds this account's UID from the
    // other phone, the waiting partner gets in on the next tick.
    refetchInterval: (query) => (query.state.data ? false : 15_000),
  })

  if (membership.isLoading) return <Splash message="Finding your household…" />
  if (membership.isError) {
    return (
      <ErrorCard
        title="Couldn't load your household"
        error={membership.error}
        onRetry={() => void membership.refetch()}
      />
    )
  }
  const found = membership.data
  if (found === null || found === undefined) {
    // Never offer "create household" on an offline cache-miss — membership
    // may exist server-side, and creating again would split the household.
    if (!online) return <Splash message="Reconnect to finish setting up 🐾" />
    return <CreateHouseholdScreen user={user} />
  }

  return (
    <HouseholdProvider householdId={found.householdId} role={found.role}>
      <AppShell />
    </HouseholdProvider>
  )
}

function AppShell() {
  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-24">
      <OfflineBanner />
      <InstallPrompt />
      <ErrorBoundary
        fallbackRender={({ error, resetErrorBoundary }) => (
          <ErrorCard error={error} onRetry={resetErrorBoundary} />
        )}
      >
        <Outlet />
      </ErrorBoundary>
      <TabBar />
    </div>
  )
}
