import { PawMark } from './PawMark'

export function Splash({ message = 'Warming up…' }: { message?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3">
      <PawMark className="h-10 w-10 animate-pulse text-coral motion-reduce:animate-none" />
      <p className="text-sm text-ink-soft">{message}</p>
    </div>
  )
}
