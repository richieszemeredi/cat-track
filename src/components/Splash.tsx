export function Splash({ message = 'Warming up…' }: { message?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3">
      <span
        aria-hidden="true"
        className="animate-pulse text-4xl leading-none motion-reduce:animate-none"
      >
        🐾
      </span>
      <p className="text-sm text-ink-soft">{message}</p>
    </div>
  )
}
