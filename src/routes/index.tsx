import { createFileRoute } from '@tanstack/react-router'
import { ErrorCard } from '../components/ErrorCard'

export const Route = createFileRoute('/')({
  component: HomePage,
  errorComponent: ({ error, reset }) => <ErrorCard error={error} onRetry={reset} />,
})

function HomePage() {
  return (
    <main className="p-4">
      <h1 className="text-2xl font-extrabold">Home</h1>
    </main>
  )
}
