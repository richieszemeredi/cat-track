import { format, isValid, parse } from 'date-fns'
import { useState, type SubmitEvent } from 'react'
import { LIFE_STAGE_LABELS, LIFE_STAGES } from '../lib/catmath'
import { awaitOrQueued, createCat, updateCat, type Cat, type CatInput } from '../lib/db'
import { lifeStageSchema, sexSchema, type LifeStage, type Sex } from '../lib/schemas'

const FIELD = 'mt-1 w-full rounded-xl border border-coral-soft bg-white px-3 py-2'

/**
 * Create/edit form for the cat profile. Create mode when `existing` is
 * omitted; edit mode patches the existing cat. Writes go through
 * awaitOrQueued so offline saves still count as success.
 */
export function CatForm({
  hid,
  uid,
  existing,
  onDone,
}: {
  hid: string
  uid: string
  existing?: Cat
  onDone?: () => void
}) {
  const [name, setName] = useState(existing?.name ?? '')
  const [birthDate, setBirthDate] = useState(
    existing ? format(existing.birthDate, 'yyyy-MM-dd') : '',
  )
  const [breed, setBreed] = useState(existing?.breed ?? '')
  const [sex, setSex] = useState<Sex>(existing?.sex ?? 'unknown')
  const [neutered, setNeutered] = useState(existing?.neutered ?? false)
  const [neuterDate, setNeuterDate] = useState(
    existing?.neuterDate ? format(existing.neuterDate, 'yyyy-MM-dd') : '',
  )
  const [idealWeight, setIdealWeight] = useState(
    existing?.idealWeightKg != null ? String(existing.idealWeightKg) : '',
  )
  const [lifeStage, setLifeStage] = useState<LifeStage | null>(existing?.lifeStage ?? null)
  const [merOverride, setMerOverride] = useState(
    existing?.merMultiplierOverride != null ? String(existing.merMultiplierOverride) : '',
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const today = format(new Date(), 'yyyy-MM-dd')

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setFlash(null)

    const trimmedName = name.trim()
    if (trimmedName.length === 0 || trimmedName.length > 50) {
      setError('Please give your cat a name (up to 50 characters).')
      return
    }
    const parsedBirth = parse(birthDate, 'yyyy-MM-dd', new Date())
    if (!isValid(parsedBirth)) {
      setError('Please pick a birth date.')
      return
    }
    if (parsedBirth.getTime() > Date.now()) {
      setError('The birth date cannot be in the future.')
      return
    }
    let parsedNeuter: Date | null = null
    if (neutered && neuterDate !== '') {
      const candidate = parse(neuterDate, 'yyyy-MM-dd', new Date())
      if (!isValid(candidate)) {
        setError('The neuter date looks off — please re-pick it.')
        return
      }
      parsedNeuter = candidate
    }
    const ideal = idealWeight.trim() === '' ? null : Number.parseFloat(idealWeight)
    if (ideal !== null && (!Number.isFinite(ideal) || ideal < 0.1 || ideal > 30)) {
      setError('Ideal weight should be between 0.1 and 30 kg.')
      return
    }
    const merValue = merOverride.trim() === '' ? null : Number.parseFloat(merOverride)
    if (merValue !== null && (!Number.isFinite(merValue) || merValue < 0.1 || merValue > 5)) {
      setError('The MER multiplier should be between 0.1 and 5.')
      return
    }

    const input: CatInput = {
      name: trimmedName,
      birthDate: parsedBirth,
      breed: breed.trim() === '' ? null : breed.trim(),
      sex,
      neutered,
      neuterDate: neutered ? parsedNeuter : null,
      idealWeightKg: ideal,
      lifeStage,
      merMultiplierOverride: merValue,
    }

    setBusy(true)
    const write = existing ? updateCat(hid, existing.id, input) : createCat(hid, uid, input)
    awaitOrQueued(write)
      .then((result) => {
        setFlash(result === 'queued' ? 'Saved! Will sync when back online 📶' : 'Profile saved! 🎉')
        if (!existing) {
          setName('')
          setBirthDate('')
          setBreed('')
          setSex('unknown')
          setNeutered(false)
          setNeuterDate('')
          setIdealWeight('')
          setLifeStage(null)
          setMerOverride('')
        }
        onDone?.()
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not save the profile.')
      })
      .finally(() => {
        setBusy(false)
      })
  }

  return (
    // noValidate: component validation shows styled messages — a native
    // bubble on a field hidden inside the collapsed Advanced section would
    // block submit with zero visible feedback.
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="font-semibold">
        Name
        <input
          type="text"
          value={name}
          required
          maxLength={50}
          data-testid="cat-name"
          onChange={(event) => {
            setName(event.target.value)
          }}
          className={FIELD}
        />
      </label>

      <label className="font-semibold">
        Birth date
        <input
          type="date"
          value={birthDate}
          required
          max={today}
          data-testid="cat-birthdate"
          onChange={(event) => {
            setBirthDate(event.target.value)
          }}
          className={FIELD}
        />
      </label>

      <label className="font-semibold">
        Breed <span className="font-normal text-ink-soft">(optional)</span>
        <input
          type="text"
          value={breed}
          maxLength={60}
          onChange={(event) => {
            setBreed(event.target.value)
          }}
          className={FIELD}
        />
      </label>

      <label className="font-semibold">
        Sex
        <select
          value={sex}
          data-testid="cat-sex"
          onChange={(event) => {
            const parsed = sexSchema.safeParse(event.target.value)
            setSex(parsed.success ? parsed.data : 'unknown')
          }}
          className={FIELD}
        >
          <option value="female">Female</option>
          <option value="male">Male</option>
          <option value="unknown">Unknown</option>
        </select>
      </label>

      <label className="flex items-center gap-2 font-semibold">
        <input
          type="checkbox"
          checked={neutered}
          data-testid="cat-neutered"
          onChange={(event) => {
            setNeutered(event.target.checked)
          }}
          className="h-5 w-5 rounded accent-coral"
        />
        Neutered / spayed
      </label>

      {neutered ? (
        <label className="font-semibold">
          Neuter date <span className="font-normal text-ink-soft">(optional)</span>
          <input
            type="date"
            value={neuterDate}
            max={today}
            onChange={(event) => {
              setNeuterDate(event.target.value)
            }}
            className={FIELD}
          />
        </label>
      ) : null}

      <details className="rounded-xl border border-coral-soft bg-white p-3">
        <summary className="cursor-pointer font-semibold text-ink-soft">
          Advanced (vet settings)
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <label className="font-semibold">
            Ideal weight (kg) <span className="font-normal text-ink-soft">(optional)</span>
            <input
              type="number"
              value={idealWeight}
              min={0.1}
              max={30}
              step={0.1}
              inputMode="decimal"
              onChange={(event) => {
                setIdealWeight(event.target.value)
              }}
              className={FIELD}
            />
          </label>

          <label className="font-semibold">
            Life stage
            <select
              value={lifeStage ?? ''}
              onChange={(event) => {
                const parsed = lifeStageSchema.safeParse(event.target.value)
                setLifeStage(parsed.success ? parsed.data : null)
              }}
              className={FIELD}
            >
              <option value="">Auto (from age)</option>
              {LIFE_STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {LIFE_STAGE_LABELS[stage]}
                </option>
              ))}
            </select>
          </label>

          <label className="font-semibold">
            MER multiplier override <span className="font-normal text-ink-soft">(optional)</span>
            <input
              type="number"
              value={merOverride}
              min={0.1}
              max={5}
              step={0.1}
              inputMode="decimal"
              onChange={(event) => {
                setMerOverride(event.target.value)
              }}
              className={FIELD}
            />
          </label>

          <p className="text-xs text-ink-soft">Estimates only — always confirm with your vet.</p>
        </div>
      </details>

      <button
        type="submit"
        disabled={busy}
        data-testid="cat-save"
        className="rounded-full bg-coral px-6 py-3 font-extrabold text-ink shadow-squishy active:scale-95 disabled:opacity-60"
      >
        Save profile <span aria-hidden="true">💾</span>
      </button>

      {flash === null ? null : <p className="text-sm font-semibold text-mint-deep">{flash}</p>}
      {error === null ? null : (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </form>
  )
}
