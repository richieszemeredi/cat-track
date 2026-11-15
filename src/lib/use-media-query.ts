import { useSyncExternalStore } from 'react'

/**
 * Whether a CSS media query matches, kept live as the window resizes (Split
 * View, Stage Manager, a desktop window being dragged). For the rare layout
 * that CSS alone can't express — a section that moves between columns, not
 * just a column that reflows. Without matchMedia (jsdom) it reads as false,
 * i.e. the phone layout.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== 'function') return () => undefined
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => {
        list.removeEventListener('change', onChange)
      }
    },
    () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
  )
}
