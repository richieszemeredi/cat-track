import { format, isValid, parse, startOfDay } from 'date-fns'
import { useState, type SubmitEvent } from 'react'
import {
  addLitterBox,
  awaitOrQueued,
  deleteLitterBox,
  updateLitterBox,
  type LitterBox,
  type LitterKind,
} from '../lib/db'
import {
  DEFAULT_BAGS_PER_SWAP,
  DEFAULT_LITTER_CHANGE_EVERY_WEEKS,
  MAX_BAGS_PER_SWAP,
  weeksLabel,
} from '../lib/litter'
import { bagsLabel } from '../lib/stock'

const FIELD_CLASS = 'field mt-1'

const DATE_FORMAT = 'yyyy-MM-dd'

// Twelve weeks covers every litter on the shelf; a box already saved with a
// longer interval keeps it (see the extra option below), the rules allow 52.
const INTERVAL_CHOICES = Array.from({ length: 12 }, (_, i) => i + 1)

const BAGS_CHOICES = Array.from({ length: MAX_BAGS_PER_SWAP }, (_, i) => i + 1)

function todayStr(): string {
  return format(new Date(), DATE_FORMAT)
}

/**
 * The kinds a box may take: every active one, plus the box's own kind if it
 * has since been archived — so editing the box doesn't quietly move it.
 */
function litterChoices(
  litters: readonly LitterKind[],
  current: string | null | undefined,
): LitterKind[] {
  return litters.filter((l) => !l.archived || l.id === current)
}

/**
 * Add a litter box, or (with `existing`) fix its location and last-changed
 * date — the way back when a clean-out went untracked. Offline-friendly:
 * 'queued' counts as success.
 */
export function LitterBoxForm({
  hid,
  uid,
  litters,
  existing,
  onDone,
}: {
  hid: string
  uid: string
  /** The household's litter kinds, archived included. */
  litters: readonly LitterKind[]
  existing?: LitterBox
  onDone?: () => void
}) {
  const [location, setLocation] = useState(existing?.location ?? '')
  const [dateStr, setDateStr] = useState(
    existing === undefined ? todayStr() : format(existing.lastChangedAt, DATE_FORMAT),
  )
  const [everyWeeks, setEveryWeeks] = useState(
    existing?.changeEveryWeeks ?? DEFAULT_LITTER_CHANGE_EVERY_WEEKS,
  )
  const [bagsPerSwap, setBagsPerSwap] = useState(existing?.bagsPerSwap ?? DEFAULT_BAGS_PER_SWAP)
  // null until a kind is picked by hand: the default follows the catalog,
  // which may still be loading when the form opens.
  const [pickedLitterId, setPickedLitterId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const choices = litterChoices(litters, existing?.litterId)
  const fallbackLitterId =
    choices.find((l) => l.id === existing?.litterId)?.id ?? choices[0]?.id ?? null
  const litterId = pickedLitterId ?? fallbackLitterId

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    const trimmed = location.trim()
    if (trimmed === '') {
      setError('Say where this box lives.')
      return
    }
    // Local time — new Date('yyyy-MM-dd') lands on UTC midnight and shows the
    // previous day in western timezones.
    const lastChangedAt = startOfDay(parse(dateStr, DATE_FORMAT, new Date()))
    if (!isValid(lastChangedAt)) {
      setError('Pick a valid date.')
      return
    }

    setBusy(true)
    const input = {
      location: trimmed,
      lastChangedAt,
      changeEveryWeeks: everyWeeks,
      bagsPerSwap,
      // With no kinds to pick from, a new box takes none (its swaps then
      // count no bags) and a saved one keeps whatever it had.
      litterId: choices.length === 0 ? (existing?.litterId ?? null) : litterId,
    }
    awaitOrQueued(
      existing === undefined
        ? addLitterBox(hid, uid, input)
        : updateLitterBox(hid, existing.id, input),
    )
      .then(() => {
        if (existing === undefined) {
          setLocation('')
          setDateStr(todayStr())
          setEveryWeeks(DEFAULT_LITTER_CHANGE_EVERY_WEEKS)
          setBagsPerSwap(DEFAULT_BAGS_PER_SWAP)
          setPickedLitterId(null)
        }
        onDone?.()
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not save the litter box.')
      })
      .finally(() => {
        setBusy(false)
      })
  }

  const handleDelete = () => {
    if (existing === undefined) return
    if (!window.confirm(`Delete the ${existing.location} litter box?`)) return
    setError(null)
    setBusy(true)
    awaitOrQueued(deleteLitterBox(hid, existing.id))
      .then(() => {
        onDone?.()
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not delete the litter box.')
      })
      .finally(() => {
        setBusy(false)
      })
  }

  return (
    // noValidate + stacked fields, as in WeighForm: styled messages instead of
    // native bubbles, and a native date picker is too wide to share a row.
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="text-sm font-semibold">
        Location
        <input
          type="text"
          data-testid="litter-location"
          maxLength={60}
          value={location}
          placeholder="e.g. Bathroom"
          onChange={(event) => {
            setLocation(event.target.value)
          }}
          className={FIELD_CLASS}
        />
      </label>
      <label className="text-sm font-semibold">
        Last fully cleaned
        <input
          type="date"
          data-testid="litter-date"
          required
          value={dateStr}
          max={todayStr()}
          onChange={(event) => {
            setDateStr(event.target.value)
          }}
          className={FIELD_CLASS}
        />
      </label>
      <label className="text-sm font-semibold">
        Full clean every
        <select
          data-testid="litter-interval"
          value={everyWeeks}
          onChange={(event) => {
            setEveryWeeks(Number(event.target.value))
          }}
          className={FIELD_CLASS}
        >
          {(INTERVAL_CHOICES.includes(everyWeeks)
            ? INTERVAL_CHOICES
            : [...INTERVAL_CHOICES, everyWeeks]
          ).map((weeks) => (
            <option key={weeks} value={weeks}>
              {weeksLabel(weeks)}
            </option>
          ))}
        </select>
      </label>
      {choices.length === 0 ? (
        <p data-testid="litter-kind-none" className="text-sm text-ink-soft">
          Add a litter on Supplies to count its bags.
        </p>
      ) : (
        <label className="text-sm font-semibold">
          Litter
          <select
            data-testid="litter-kind"
            value={litterId ?? ''}
            onChange={(event) => {
              setPickedLitterId(event.target.value)
            }}
            className={FIELD_CLASS}
          >
            {choices.map((litter) => (
              <option key={litter.id} value={litter.id}>
                {litter.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="text-sm font-semibold">
        Bags per full swap
        <select
          data-testid="litter-bags-per-swap"
          value={bagsPerSwap}
          onChange={(event) => {
            setBagsPerSwap(Number(event.target.value))
          }}
          className={FIELD_CLASS}
        >
          {BAGS_CHOICES.map((bags) => (
            <option key={bags} value={bags}>
              {bagsLabel(bags)}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" data-testid="litter-save" disabled={busy} className="btn-primary">
        {existing === undefined ? 'Add litter box' : 'Save changes'}
      </button>
      {existing === undefined ? null : (
        <button type="button" disabled={busy} onClick={handleDelete} className="btn-secondary">
          Delete litter box
        </button>
      )}
      {error === null ? null : (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </form>
  )
}
