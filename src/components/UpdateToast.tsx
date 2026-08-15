import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * registerType is 'prompt': a new version waits until the user opts in, so an
 * update never yanks the page out from under a half-typed entry.
 */
export function UpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    // A resident iOS PWA rarely re-fetches the SW on its own — without a
    // periodic check the update toast might never appear.
    onRegisteredSW(_url, registration) {
      if (registration) {
        setInterval(
          () => {
            void registration.update()
          },
          60 * 60 * 1000,
        )
      }
    },
  })

  if (!needRefresh) return null

  return (
    <div
      role="status"
      className="surface fixed inset-x-4 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-center justify-between gap-3 p-3 shadow-squishy"
    >
      <span className="text-sm font-medium">A new version is ready</span>
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded-full px-3 py-1.5 text-sm font-semibold text-ink-soft"
          onClick={() => {
            setNeedRefresh(false)
          }}
        >
          Later
        </button>
        <button
          type="button"
          className="rounded-full bg-coral px-4 py-1.5 text-sm font-semibold text-ink active:scale-[0.98]"
          onClick={() => {
            void updateServiceWorker(true)
          }}
        >
          Update
        </button>
      </div>
    </div>
  )
}
