import { createFileRoute } from '@tanstack/react-router'
import { ErrorCard } from '../components/ErrorCard'

export const Route = createFileRoute('/food')({
  component: FoodPage,
  errorComponent: ({ error, reset }) => <ErrorCard error={error} onRetry={reset} />,
})

function FoodPage() {
  return (
    <main className="p-4">
      <h1 className="text-2xl font-extrabold">Food</h1>
    </main>
  )
}
