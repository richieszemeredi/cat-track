export function ErrorCard({
  title = 'Something went wrong',
  error,
  onRetry,
}: {
  title?: string
  error?: unknown
  onRetry?: () => void
}) {
  const message = error instanceof Error ? error.message : undefined
  return (
    <div className="surface m-4 flex flex-col items-start gap-3 p-5">
      <h2 className="font-semibold">{title}</h2>
      {message === undefined ? null : (
        <p className="text-sm break-words text-ink-soft">{message}</p>
      )}
      {onRetry === undefined ? null : (
        <button type="button" onClick={onRetry} className="btn-secondary">
          Try again
        </button>
      )}
    </div>
  )
}
