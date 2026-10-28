import { AnimatePresence, m } from 'motion/react'
import { fade } from '../lib/motion'
import { useOnline } from '../lib/use-online'

export function OfflineBanner() {
  const online = useOnline()
  return (
    // initial={false}: an app that boots offline shows the banner already in
    // place — it is only a CHANGE in connectivity that should move the page.
    <AnimatePresence initial={false}>
      {online ? null : (
        // The banner sits in the flow and pushes the page down, so it opens and
        // closes its height rather than popping: on a train, connectivity can
        // flip while a finger is on its way to a button. A wrapper does the
        // collapsing, since the banner's own padding would outlast height 0,
        // and clips the text on the way.
        <m.div
          key="offline-banner"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={fade}
          className="overflow-hidden"
        >
          <div
            role="status"
            className="bg-sand px-4 py-1.5 text-center text-sm font-medium text-ink"
          >
            Offline — entries are saved and will sync
          </div>
        </m.div>
      )}
    </AnimatePresence>
  )
}
