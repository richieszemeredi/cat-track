/** A section's placeholder while its data loads. */
export function Skeleton() {
  return <div className="h-16 animate-pulse rounded-squishy bg-sand" />
}

/** A section's one-line failure, in the page's text column. */
export function SectionError({ label }: { label: string }) {
  return (
    <p role="alert" className="gutter text-sm font-semibold text-danger">
      {label}
    </p>
  )
}
