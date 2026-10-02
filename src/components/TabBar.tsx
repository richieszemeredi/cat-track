import { Link } from '@tanstack/react-router'
import { PawMark } from './PawMark'

// Emoji earn their place here and nowhere else: in a bottom bar they are
// wayfinding you hit with a thumb, not decoration on a heading.
const TABS = [
  { to: '/', label: 'Home', emoji: '🏠' },
  { to: '/food', label: 'Food', emoji: '🍽️' },
  { to: '/weight', label: 'Weight', emoji: '⚖️' },
  { to: '/profile', label: 'Profile', emoji: '🐱' },
] as const

/**
 * The bottom tab bar on a phone and an upright iPad; from 1024pt (a sideways
 * iPad, a desktop) the same nav stands up as a rail down the left edge, where
 * a pointer expects it and the two columns get the full height. One element
 * in both shapes, so there is only ever one "Main" landmark. AppShell pads
 * itself by the rail's 6rem to keep content out from under it.
 */
export function TabBar() {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 border-t border-sand bg-surface/90 pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] backdrop-blur lg:top-0 lg:right-auto lg:w-[calc(6rem+env(safe-area-inset-left))] lg:border-t-0 lg:border-r lg:pt-[env(safe-area-inset-top)] lg:pr-0"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around lg:flex-col lg:justify-start lg:gap-2 lg:py-6">
        <PawMark className="mx-auto mb-4 hidden h-9 w-9 text-coral lg:block" />
        {TABS.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            className="flex flex-1 flex-col items-center gap-0.5 rounded-xl py-2 text-xs font-medium text-ink-soft hover:text-ink lg:flex-none lg:py-3"
            activeProps={{
              className: 'text-coral-ink hover:text-coral-ink font-semibold',
              'aria-current': 'page',
            }}
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
