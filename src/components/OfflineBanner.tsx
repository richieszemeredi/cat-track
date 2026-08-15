import { useOnline } from '../lib/use-online'

export function OfflineBanner() {
  const online = useOnline()
  if (online) return null
  return (
    <div
      role="status"
      className="mx-auto max-w-lg bg-sand px-4 py-1.5 text-center text-sm font-medium text-ink"
    >
      Offline — entries are saved and will sync
    </div>
  )
}
