import { PawPrint } from 'lucide-react'

export function Splash({ message = 'Warming up…' }: { message?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3">
      <PawPrint
        aria-hidden="true"
        className="size-9 animate-pulse text-coral-ink motion-reduce:animate-none"
      />
      <p className="text-sm text-ink-soft">{message}</p>
    </div>
  )
}
