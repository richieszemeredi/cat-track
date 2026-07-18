export function Splash({ message = 'Warming up…' }: { message?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3">
      <span aria-hidden="true" className="animate-bounce text-5xl motion-reduce:animate-none">
        🐱
      </span>
      <p className="font-semibold text-ink-soft">{message}</p>
    </div>
  )
}
