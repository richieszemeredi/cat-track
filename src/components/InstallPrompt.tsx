import { useState } from 'react'
import { isStandalone } from '../lib/standalone'

const DISMISS_KEY = 'cattrack.installPromptDismissed'

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

/**
 * iOS never auto-prompts for PWA install, so show a friendly card with the
 * Add-to-Home-Screen steps when running in Safari (not yet installed).
 */
export function InstallPrompt() {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === 'true')

  if (dismissed || !isIos() || isStandalone()) return null

  return (
    <div className="mx-4 mb-4 rounded-squishy border border-coral-soft bg-white p-4 shadow-squishy">
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-extrabold">
          <span aria-hidden="true">📲</span> Put CatTrack on your Home Screen
        </h2>
        <button
          type="button"
          aria-label="Dismiss install tip"
          className="px-1 text-lg leading-none text-ink-soft"
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
          Tap the <span className="font-semibold">Share</span> button in Safari
        </li>
        <li>
          Choose <span className="font-semibold">Add to Home Screen</span>
        </li>
        <li>
          Tap <span className="font-semibold">Add</span> — done!
        </li>
      </ol>
    </div>
  )
}
