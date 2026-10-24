import { createFileRoute, Link } from '@tanstack/react-router'
import { CatToday } from '../components/CatToday'
import { ErrorCard } from '../components/ErrorCard'
import { LitterGlance } from '../components/LitterGlance'
import { WaterGlance } from '../components/WaterGlance'
import { ageLabelLong } from '../lib/catmath'
import { useHousehold } from '../lib/household'

export const Route = createFileRoute('/')({
  component: HomePage,
  errorComponent: ({ error, reset }) => <ErrorCard error={error} onRetry={reset} />,
})

/**
 * What is worth knowing on opening the app: how today is going for each cat
 * (left column) and what the household has to do (right). Everything else is
 * one tap away on the tab bar, so there are no shortcuts and no food list here.
 */
function HomePage() {
  const { cats, catsLoading } = useHousehold()
  const [only] = cats
  const single = cats.length === 1 ? only : undefined

  if (catsLoading) {
    return (
      <main className="flex flex-col gap-6 p-4">
        <h1 className="page-title gutter">Home</h1>
        <div className="page-solo h-24 animate-pulse rounded-squishy bg-sand" />
      </main>
    )
  }

  return (
    <main className="flex flex-col gap-7 p-4">
      {single === undefined ? (
        <h1 className="page-title gutter">Home</h1>
      ) : (
        <header className="gutter">
          <h1 className="page-title">{single.name}</h1>
          <p className="text-sm text-ink-soft">{ageLabelLong(single.birthDate, new Date())}</p>
        </header>
      )}

      <div className="page-columns">
        {/* Where today stands. */}
        <div className="page-column">
          {cats.length === 0 ? (
            <div className="surface flex flex-col items-start gap-3 p-5">
              <p className="font-semibold">No cat set up yet.</p>
              <Link to="/profile" className="btn-primary">
                Add your cat
              </Link>
            </div>
          ) : (
            cats.map((cat) => (
              <CatToday
                key={cat.id}
                cat={cat}
                variant={single === undefined ? 'compact' : 'full'}
              />
            ))
          )}
        </div>

        {/* What the household has to do — not about any one cat. */}
        <div className="page-column">
          <WaterGlance />
          <LitterGlance />
        </div>
      </div>

      {cats.length === 0 ? null : (
        <p className="gutter text-xs text-ink-soft">
          Estimates only — always confirm with your vet.
        </p>
      )}
    </main>
  )
}
