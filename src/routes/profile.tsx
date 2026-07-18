import { createFileRoute } from '@tanstack/react-router'
import { ErrorCard } from '../components/ErrorCard'

export const Route = createFileRoute('/profile')({
  component: ProfilePage,
  errorComponent: ({ error, reset }) => <ErrorCard error={error} onRetry={reset} />,
})

function ProfilePage() {
  return (
    <main className="p-4">
      <h1 className="text-2xl font-extrabold">Profile</h1>
    </main>
  )
}
