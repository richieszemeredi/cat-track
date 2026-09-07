import { LEAD_MINUTES } from '../lib/reminders'
// A top-level `import type` rather than the inline `{ type X }` used elsewhere:
// verbatimModuleSyntax keeps the inline form's statement, so naming a type from
// use-reminders would drag in db.ts → firebase.ts and initialize Firebase for
// real. This card calls nothing, and its test should need no Firebase config.
import type { RemindersState } from '../lib/use-reminders'

/**
 * The reminder switch, as a device setting rather than anything shared — and
 * one that states its limitation plainly, because a reminder you believe in
 * but never receive is worse than no reminder at all.
 *
 * Presentational: the state arrives as props so every branch below can be
 * rendered in a test, which is the only place several of them are reachable
 * (a browser hands out one permission and no more).
 */
export function RemindersCard({ enabled, permission, installed, enable, disable }: RemindersState) {
  const on = enabled && permission === 'granted'

  return (
    <section className="flex flex-col gap-3">
      <h2 className="section-label gutter">Feeding reminders</h2>

      <div className="surface flex flex-col items-start gap-3 p-4">
        <p className="text-sm text-ink-soft">
          A notification {LEAD_MINUTES} minutes before each planned meal, and another when it’s due.
          Bowls already ticked off stay quiet.
        </p>

        {permission === 'unsupported' ? (
          <p className="text-sm">
            {installed
              ? 'This browser can’t show notifications.'
              : 'Add CatTrack to your Home Screen first — iOS only allows notifications from an installed app.'}
          </p>
        ) : permission === 'denied' ? (
          // Deliberately not "iOS Settings": the same screen is opened in
          // desktop Chrome, where that instruction leads nowhere.
          <p className="text-sm">
            Notifications are blocked for CatTrack. Turn them back on in your device settings.
          </p>
        ) : on ? (
          <button type="button" onClick={disable} className="btn-secondary">
            Turn off reminders
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              void enable()
            }}
            className="btn-primary"
          >
            Turn on reminders
          </button>
        )}

        <p className="text-xs text-ink-soft">
          Only while CatTrack is open on this phone — it can’t wake in the background to notify you.
        </p>
      </div>
    </section>
  )
}
