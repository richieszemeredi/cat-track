import { Link } from '@tanstack/react-router'

// Emoji earn their place here and nowhere else: in a bottom bar they are
// wayfinding you hit with a thumb, not decoration on a heading.
const TABS = [
  { to: '/', label: 'Home', emoji: '🏠' },
  { to: '/food', label: 'Food', emoji: '🍽️' },
  { to: '/weight', label: 'Weight', emoji: '⚖️' },
  { to: '/profile', label: 'Profile', emoji: '🐱' },
] as const

export function TabBar() {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 border-t border-sand bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around">
        {TABS.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            className="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium text-ink-soft"
            activeProps={{ className: 'text-coral-ink font-semibold', 'aria-current': 'page' }}
            activeOptions={{ exact: tab.to === '/' }}
          >
            <span aria-hidden="true" className="text-xl leading-none">
              {tab.emoji}
            </span>
            {tab.label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
