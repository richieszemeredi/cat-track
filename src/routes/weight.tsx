import { createFileRoute } from '@tanstack/react-router'
import { ErrorCard } from '../components/ErrorCard'

export const Route = createFileRoute('/weight')({
  component: WeightPage,
  errorComponent: ({ error, reset }) => <ErrorCard error={error} onRetry={reset} />,
})

function WeightPage() {
  return (
    <main className="p-4">
      <h1 className="text-2xl font-extrabold">Weight</h1>
    </main>
  )
}
