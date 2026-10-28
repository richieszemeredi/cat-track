import { AnimatePresence, m } from 'motion/react'
import { useState } from 'react'
import { fade } from '../lib/motion'
import { isIos, isStandalone } from '../lib/standalone'

const DISMISS_KEY = 'cattrack.installPromptDismissed'

/**
 * iOS never auto-prompts for PWA install, so show the Add-to-Home-Screen
 * steps when running in Safari (not yet installed).
 */
export function InstallPrompt() {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === 'true')

  const show = !dismissed && isIos() && !isStandalone()

  return (
    // initial={false}: the tip is there from the first frame or not at all —
    // only dismissing it should move anything.
    <AnimatePresence initial={false}>
      {show ? (
        // Same collapse as the offline banner: the card sits above the page,
        // so closing it folds its height (margin included, which is why the
        // wrapper rather than the card animates) instead of yanking the
        // content up by a card's worth.
        <m.div
          key="install-prompt"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={fade}
          className="overflow-hidden"
        >
          <div className="surface mx-4 mb-4 p-4 md:max-w-lg">
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-semibold">Put CatTrack on your Home Screen</h2>
              <button
                type="button"
                aria-label="Dismiss install tip"
                className="btn-icon -mt-1"
                onClick={() => {
                  localStorage.setItem(DISMISS_KEY, 'true')
                  setDismissed(true)
                }}
              >
                ×
              </button>
            </div>
            <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-ink-soft">
              <li>
                Tap the <span className="font-medium text-ink">Share</span> button in Safari
              </li>
              <li>
                Choose <span className="font-medium text-ink">Add to Home Screen</span>
              </li>
              <li>
                Tap <span className="font-medium text-ink">Add</span>
              </li>
            </ol>
          </div>
        </m.div>
      ) : null}
    </AnimatePresence>
  )
}
