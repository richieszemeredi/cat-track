export function ErrorCard({
  title = 'Something went sideways',
  error,
  onRetry,
}: {
  title?: string
  error?: unknown
  onRetry?: () => void
}) {
  const message = error instanceof Error ? error.message : undefined
  return (
    <div className="m-4 flex flex-col items-center gap-3 rounded-squishy bg-white p-6 text-center shadow-squishy">
      <span aria-hidden="true" className="text-4xl">
        🙀
      </span>
      <h2 className="text-lg font-extrabold">{title}</h2>
      {message === undefined ? null : (
        <p className="text-sm break-words text-ink-soft">{message}</p>
      )}
      {onRetry === undefined ? null : (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full bg-coral px-5 py-2 font-bold text-white active:scale-95"
        >
          Try again
        </button>
      )}
    </div>
  )
}
