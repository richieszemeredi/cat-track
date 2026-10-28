import { Link } from '@tanstack/react-router'
import { m } from 'motion/react'
import { glide } from '../lib/motion'

// Emoji earn their place here and nowhere else: in a bottom bar they are
// wayfinding you hit with a thumb, not decoration on a heading.
const TABS = [
  { to: '/', label: 'Home', emoji: '🏠' },
  { to: '/food', label: 'Food', emoji: '🍽️' },
  { to: '/weight', label: 'Weight', emoji: '⚖️' },
  { to: '/chores', label: 'Chores', emoji: '🧺' },
  { to: '/profile', label: 'Profile', emoji: '🐱' },
] as const

/**
 * The bottom tab bar on a phone and an upright iPad; from 1024pt (a sideways
 * iPad, a desktop) the same nav stands up as a rail down the left edge, where
 * a pointer expects it and the two columns get the full height. One element
 * in both shapes, so there is only ever one "Main" landmark. AppShell pads
 * itself by the rail's 6rem to keep content out from under it.
 *
 * The coral pill behind the active emoji is ONE element that travels: each
 * tab renders it only while active, and the shared layoutId makes Motion
 * slide it from the tab that lost it to the one that gained it — across the
 * bar or down the rail alike. `layoutRoot` is Motion's rule for layout inside
 * a fixed container: the pill is measured against the nav, not the page, so
 * the scroll reset that comes with navigating can never land between the two
 * measurements and throw the pill in from wherever the old page was scrolled.
 */
export function TabBar() {
  return (
    <m.nav
      layoutRoot
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 border-t border-sand bg-surface/90 pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] backdrop-blur lg:top-0 lg:right-auto lg:w-[calc(6rem+env(safe-area-inset-left))] lg:border-t-0 lg:border-r lg:pt-[env(safe-area-inset-top)] lg:pr-0"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around lg:flex-col lg:justify-start lg:gap-2 lg:py-6">
        <span aria-hidden="true" className="mb-4 hidden text-center text-4xl leading-none lg:block">
          🐈
        </span>
        {TABS.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            className="flex flex-1 flex-col items-center gap-0.5 rounded-xl py-2 text-xs font-medium text-ink-soft transition-[color,font-weight] duration-200 ease-squishy hover:text-ink data-[status=active]:font-semibold data-[status=active]:text-coral-ink data-[status=active]:hover:text-coral-ink lg:flex-none lg:py-3"
            activeProps={{ 'aria-current': 'page' }}
            activeOptions={{ exact: tab.to === '/' }}
          >
            {({ isActive }) => (
              <>
                <span
                  aria-hidden="true"
                  className="relative rounded-full px-4 py-1 text-xl leading-none"
                >
                  {isActive ? (
                    <m.span
                      layoutId="tab-pill"
                      transition={glide}
                      className="absolute inset-0 rounded-full bg-coral-soft"
                    />
                  ) : null}
                  {/* Positioned so it paints above the pill, which is too. */}
                  <span
                    className={`relative transition-opacity duration-200 ease-squishy ${isActive ? '' : 'opacity-60'}`}
                  >
                    {tab.emoji}
                  </span>
                </span>
                {tab.label}
              </>
            )}
          </Link>
        ))}
      </div>
    </m.nav>
  )
}
