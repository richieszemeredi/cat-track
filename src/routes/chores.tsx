import { createFileRoute } from '@tanstack/react-router'
import { ErrorCard } from '../components/ErrorCard'
import { LitterSection } from '../components/LitterSection'
import { WaterSection } from '../components/WaterSection'

export const Route = createFileRoute('/chores')({
  component: ChoresPage,
  errorComponent: ({ error, reset }) => <ErrorCard error={error} onRetry={reset} />,
})

function ChoresPage() {
  return (
    <main className="flex flex-col gap-7 p-4">
      <h1 className="page-title gutter">Chores</h1>
      {/* The things the household has to keep up — not about any one cat. */}
      <div className="page-columns">
        <WaterSection />
        <LitterSection />
      </div>
    </main>
  )
}
