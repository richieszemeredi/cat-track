import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * registerType is 'prompt': a new version waits until the user opts in, so an
 * update never yanks the page out from under a half-typed entry.
 */
export function UpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-20 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-squishy border border-coral-soft bg-white p-3 shadow-squishy"
    >
      <span className="text-sm font-semibold">
        <span aria-hidden="true">✨</span> A new version is ready
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded-full px-3 py-1.5 text-sm font-bold text-ink-soft"
          onClick={() => {
            setNeedRefresh(false)
          }}
        >
          Later
        </button>
        <button
          type="button"
          className="rounded-full bg-coral px-4 py-1.5 text-sm font-bold text-white active:scale-95"
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
