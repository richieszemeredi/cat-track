import { m, useIsPresent } from 'motion/react'
import { type ReactNode } from 'react'
import { fade, glide } from '../lib/motion'

/**
 * One row of a list whose rows come and go while it is on screen: a weigh-in
 * saved, a box removed, a feeding arriving live from the other phone. Render
 * it as the keyed child of an `<AnimatePresence initial={false}>` inside the
 * `<ul>` — `initial={false}` so opening a screen does not grow every row in,
 * only what changes after.
 *
 * A row opens and closes its own height rather than sliding over its
 * neighbours, so the card grows and shrinks with it and nothing ever sits
 * outside it mid-flight. That is also why the row carries no padding of its
 * own: a height of 0 cannot hide padding, so the padded content goes in a
 * child. `layout="position"` slides a row that changes places (the litter
 * glance re-sorts when a box is replaced); `order` is its index, so only a
 * real move animates — not every re-render where something above the list
 * happened to change height.
 *
 * `data-leaving` is for the hairlines in index.css: a `divide-y` list would
 * otherwise slide the leaving row's divider into the card's own border.
 */
export function ListRow({ order, children }: { order: number; children: ReactNode }) {
  const isPresent = useIsPresent()
  return (
    <m.li
      layout="position"
      layoutDependency={order}
      // Clipped only while the height moves; settled, a focus ring or a
      // row's negative-margin × must not be shaved off.
      initial={{ height: 0, opacity: 0, overflow: 'clip' }}
      animate={{ height: 'auto', opacity: 1, transitionEnd: { overflow: 'visible' } }}
      exit={{ height: 0, opacity: 0, overflow: 'clip' }}
      transition={{ default: glide, opacity: fade }}
      data-leaving={isPresent ? undefined : ''}
    >
      {children}
    </m.li>
  )
}

/**
 * ListRow for a stack spaced by a flex `gap` instead of hairlines (the plan
 * history). A collapsed row would still hold its gap open, so it also pulls
 * the next one up by exactly that much: `gap` must match the parent's.
 */
export function StackRow({
  order,
  gap,
  children,
}: {
  order: number
  gap: string
  children: ReactNode
}) {
  const collapsed = { height: 0, opacity: 0, marginBottom: `-${gap}`, overflow: 'clip' }
  return (
    <m.div
      layout="position"
      layoutDependency={order}
      initial={collapsed}
      animate={{
        height: 'auto',
        opacity: 1,
        marginBottom: '0rem',
        transitionEnd: { overflow: 'visible' },
      }}
      exit={collapsed}
      transition={{ default: glide, opacity: fade }}
    >
      {children}
    </m.div>
  )
}
