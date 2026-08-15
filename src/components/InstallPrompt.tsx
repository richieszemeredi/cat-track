import { useState } from 'react'
import { isStandalone } from '../lib/standalone'

const DISMISS_KEY = 'cattrack.installPromptDismissed'

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

/**
 * iOS never auto-prompts for PWA install, so show the Add-to-Home-Screen
 * steps when running in Safari (not yet installed).
 */
export function InstallPrompt() {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === 'true')

  if (dismissed || !isIos() || isStandalone()) return null

  return (
    <div className="surface mx-4 mb-4 p-4">
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-semibold">Put CatTrack on your Home Screen</h2>
        <button
          type="button"
          aria-label="Dismiss install tip"
          className="-mt-1 px-1 text-lg leading-none text-ink-soft"
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
  )
}
