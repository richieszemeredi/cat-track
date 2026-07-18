import { useOnline } from '../lib/use-online'

export function OfflineBanner() {
  const online = useOnline()
  if (online) return null
  return (
    <div
      role="status"
      className="mx-auto max-w-lg rounded-b-2xl bg-butter px-4 py-1.5 text-center text-sm font-semibold text-ink"
    >
      Offline — entries are saved and will sync 🐾
    </div>
  )
}
