import { useId, useState, type SubmitEvent } from 'react'
import { addLitter, awaitOrQueued, updateLitter, type LitterKind } from '../lib/db'
import { DECIMAL_INPUT_PROPS, parseDecimal } from '../lib/numbers'
import { LITTER_BAG_UNITS, type LitterBagUnit } from '../lib/schemas'

const INPUT_CLASS = 'field'

// The rules' caps: a bag size is descriptive, but still a sane number, and
// one stock event records at most this many bags.
const BAG_SIZE_MAX = 1000
const OPENING_BAGS_MAX = 1000

/** A whole number typed on the numeric keypad; null when empty or not one. */
function parseWholeNumber(raw: string): number | null {
  const trimmed = raw.trim()
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null
}

/**
 * Add a kind of litter to the household's catalog, or (with `existing`) fix
 * its name and bag size. The bag size only describes the kind ("10 L bags");
 * its stock is counted in bags. On add, "Bags in stock" writes the opening
 * count in the same batch. Offline-friendly: 'queued' counts as success.
 */
export function LitterForm({
  hid,
  uid,
  existing,
  onDone,
}: {
  hid: string
  uid: string
  existing?: LitterKind
  onDone: () => void
}) {
  const [name, setName] = useState(existing?.name ?? '')
  const [bagSize, setBagSize] = useState(existing?.bagSize == null ? '' : String(existing.bagSize))
  // Litter is mostly sold by volume, so a new kind starts on litres.
  const [bagUnit, setBagUnit] = useState<LitterBagUnit>(existing?.bagUnit ?? 'L')
  const [openingBags, setOpeningBags] = useState('')
  // Two forms can be open at once (adding one kind while editing another).
  const ids = useId()
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(): Promise<void> {
    const trimmedName = name.trim()
    if (trimmedName === '') {
      setError('Give the litter a name.')
      return
    }
    const size = parseDecimal(bagSize)
    if (bagSize.trim() !== '' && (size === null || size <= 0 || size > BAG_SIZE_MAX)) {
      setError(`Bag size must be more than 0 and at most ${String(BAG_SIZE_MAX)}.`)
      return
    }
    const opening = existing ? null : parseWholeNumber(openingBags)
    if (
      !existing &&
      openingBags.trim() !== '' &&
      (opening === null || opening > OPENING_BAGS_MAX)
    ) {
      setError('Bags in stock must be a whole number.')
      return
    }
    setError(null)
    setSaving(true)
    // A unit with no size says nothing, so neither is stored.
    const input = { name: trimmedName, bagSize: size, bagUnit: size === null ? null : bagUnit }
    try {
      // 'confirmed' and 'queued' both count as success (offline-first).
      await awaitOrQueued(
        existing ? updateLitter(hid, existing.id, input) : addLitter(hid, uid, input, opening),
      )
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the litter — please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      noValidate
      onSubmit={(e: SubmitEvent<HTMLFormElement>) => {
        e.preventDefault()
        void submit()
      }}
      className="flex flex-col gap-3 rounded-xl border border-sand bg-cream p-3"
    >
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Name
        <input
          data-testid="litter-kind-name"
          type="text"
          maxLength={80}
          value={name}
          placeholder="e.g. Clumping"
          onChange={(e) => {
            setName(e.target.value)
          }}
          className={INPUT_CLASS}
        />
      </label>

      {/* Labelled by id rather than by wrapping, as in FoodForm: the unit
      buttons beside the field would otherwise join its accessible name. */}
      <div className="flex flex-col gap-1 text-sm font-semibold">
        <label htmlFor={`${ids}-size`}>Bag size (optional)</label>
        <div className="flex items-center gap-2">
          <input
            {...DECIMAL_INPUT_PROPS}
            id={`${ids}-size`}
            data-testid="litter-kind-bag-size"
            value={bagSize}
            placeholder={bagUnit === 'kg' ? 'e.g. 5' : 'e.g. 10'}
            onChange={(e) => {
              setBagSize(e.target.value)
            }}
            className={`${INPUT_CLASS} max-w-32 tabular-nums`}
          />
          <div role="group" aria-label="Bag size unit" className="flex flex-1 gap-2">
            {LITTER_BAG_UNITS.map((u) => {
              const selected = u === bagUnit
              return (
                <button
                  key={u}
                  type="button"
                  data-testid={`litter-kind-unit-${u}`}
                  aria-pressed={selected}
                  onClick={() => {
                    setBagUnit(u)
                  }}
                  className={`min-h-11 flex-1 rounded-full text-sm font-semibold active:scale-[0.98] ${
                    selected ? 'bg-coral text-on-coral' : 'border border-sand-deep bg-surface'
                  }`}
                >
                  {u}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {existing ? null : (
        <div className="flex flex-col gap-1 text-sm font-semibold">
          <label htmlFor={`${ids}-opening`}>Bags in stock (optional)</label>
          <span className="flex items-center gap-2">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              id={`${ids}-opening`}
              aria-describedby={`${ids}-opening-hint`}
              data-testid="litter-kind-opening-bags"
              value={openingBags}
              onChange={(e) => {
                setOpeningBags(e.target.value)
              }}
              className={`${INPUT_CLASS} max-w-32 tabular-nums`}
            />
            <span aria-hidden="true" className="font-normal text-ink-soft">
              bags
            </span>
          </span>
          <span id={`${ids}-opening-hint`} className="text-xs font-normal text-ink-soft">
            Leave empty to not track this one.
          </span>
        </div>
      )}

      {error === null ? null : (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          data-testid="litter-kind-save"
          disabled={saving}
          className="btn-primary flex-1"
        >
          {existing ? 'Save changes' : 'Add litter'}
        </button>
        <button type="button" onClick={onDone} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  )
}
