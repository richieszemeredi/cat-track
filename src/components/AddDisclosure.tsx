import { useState, type ReactNode } from 'react'

/**
 * The "add one" form of a household-level list (litter boxes, water bowls).
 * Adding is rare, so it is collapsed — a phone would otherwise scroll past
 * the form to reach the next section — except while the list is empty,
 * where the form is the next step. It closes itself after a save.
 */
export function AddDisclosure({
  label,
  testId,
  defaultOpen,
  children,
}: {
  label: string
  testId: string
  defaultOpen: boolean
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <details
      className="surface px-4"
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
