import { useState, type ReactNode } from 'react'

/**
 * The "add one" form of a household-level list (litter boxes, water bowls).
 * Adding is rare, so it is collapsed — a phone would otherwise scroll past
 * the form to reach the next section — except while the list is empty,
 * where the form is the next step. It closes itself after a save.
 * Its own card by default; `className` replaces that for one that lives
 * inside a card already (the last row of Home's litter fold).
 */
export function AddDisclosure({
  label,
  testId,
  defaultOpen,
  className = 'surface px-4',
  children,
}: {
  label: string
  testId: string
  defaultOpen: boolean
  className?: string
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <details
      className={className}
      open={open}
      onToggle={(e) => {
        setOpen(e.currentTarget.open)
      }}
    >
      <summary data-testid={testId} className="disclosure">
        {label}
      </summary>
      <div className="pb-4">
        {children(() => {
          setOpen(false)
        })}
      </div>
    </details>
  )
}
