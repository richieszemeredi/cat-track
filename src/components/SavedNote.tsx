import { AnimatePresence, m } from 'motion/react'
import { type ReactNode } from 'react'
import { fade } from '../lib/motion'

/**
 * The line a form shows once an entry is on its way ("Saved!", "Logged!").
 * It fades in and back out instead of blinking, which matters most for the
 * ones that clear themselves on a timer: the eye is usually back on the bowl
 * by then, and a pop at the edge of vision reads as something going wrong.
 *
 * Opacity only, never a coloured surface — success stays a TEXT signal
 * (`text-positive` in the caller's className). While leaving, the note keeps
 * the text it last showed, so a caller can clear its message state at once.
 */
export function SavedNote({
  show,
  className,
  role,
  children,
}: {
  show: boolean
  className: string
  role?: 'status'
  children: ReactNode
}) {
  return (
    <AnimatePresence>
      {show ? (
        <m.p
          key="saved-note"
          role={role}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={fade}
          className={className}
        >
          {children}
        </m.p>
      ) : null}
    </AnimatePresence>
  )
}
