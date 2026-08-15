import { useState, type SubmitEvent } from 'react'
import {
  analysisSumPct,
  kcalPer100gFromAnalysis,
  nfePct,
  roundKcal,
  TYPICAL_ASH_PCT,
  TYPICAL_FIBRE_PCT,
  type FoodAnalysis,
} from '../lib/catmath'
import { addFood, awaitOrQueued, updateFood, type Food } from '../lib/db'
import { DECIMAL_INPUT_PROPS, parseDecimal } from '../lib/numbers'
import { type FoodType } from '../lib/schemas'

const INPUT_CLASS = 'field'

/** The five label fields as typed — empty ash/fibre fall back to a typical value. */
interface AnalysisDraft {
  protein: string
  fat: string
  ash: string
  fibre: string
  moisture: string
}

const EMPTY_DRAFT: AnalysisDraft = { protein: '', fat: '', ash: '', fibre: '', moisture: '' }

function draftFromAnalysis(a: FoodAnalysis): AnalysisDraft {
  return {
    protein: String(a.proteinPct),
    fat: String(a.fatPct),
    ash: String(a.ashPct),
    fibre: String(a.fibrePct),
    moisture: String(a.moisturePct),
  }
}

// Standard label wording, in label order. Ash and fibre are the optional two.
const ANALYSIS_FIELDS: {
  key: keyof AnalysisDraft
  label: string
  placeholder: (type: FoodType) => string
}[] = [
  { key: 'protein', label: 'Protein %', placeholder: (t) => (t === 'wet' ? 'e.g. 11' : 'e.g. 32') },
  { key: 'fat', label: 'Fat %', placeholder: (t) => (t === 'wet' ? 'e.g. 5,5' : 'e.g. 16') },
  {
    key: 'ash',
    label: 'Crude ash % (optional)',
    placeholder: (t) => `${String(TYPICAL_ASH_PCT[t])} if not listed`,
  },
  {
    key: 'fibre',
    label: 'Crude fibre % (optional)',
    placeholder: (t) => `${String(TYPICAL_FIBRE_PCT[t])} if not listed`,
  },
  {
    key: 'moisture',
    label: 'Moisture %',
    placeholder: (t) => (t === 'wet' ? 'e.g. 78' : 'e.g. 8'),
  },
]

interface ResolvedDraft {
  analysis: FoodAnalysis
  /** What the label itself declares — a typo shows up here, not in `analysis`. */
  declaredSumPct: number
  assumedAsh: boolean
  assumedFibre: boolean
}

/**
 * Resolve the draft into the analysis the calculation will use. Protein, fat
 * and moisture are always declared on a label; ash and fibre often are not, so
 * a blank field means "the label is silent" and takes the category default.
 */
function resolveDraft(draft: AnalysisDraft, type: FoodType): ResolvedDraft | null {
  const proteinPct = parseDecimal(draft.protein)
  const fatPct = parseDecimal(draft.fat)
  const moisturePct = parseDecimal(draft.moisture)
  if (proteinPct === null || fatPct === null || moisturePct === null) return null
  const declaredAsh = parseDecimal(draft.ash)
  const declaredFibre = parseDecimal(draft.fibre)
  const ashPct = declaredAsh ?? TYPICAL_ASH_PCT[type]
  const fibrePct = declaredFibre ?? TYPICAL_FIBRE_PCT[type]
  const values = [proteinPct, fatPct, moisturePct, ashPct, fibrePct]
  if (values.some((v) => v < 0 || v > 100)) return null
  return {
    analysis: { proteinPct, fatPct, ashPct, fibrePct, moisturePct },
    // Assumed values must never count towards the typo check: blaming the
    // user's figures for a default they never typed is how a wet label entered
    // while the type still said "Dry" got told its numbers were wrong.
    declaredSumPct: proteinPct + fatPct + moisturePct + (declaredAsh ?? 0) + (declaredFibre ?? 0),
    assumedAsh: declaredAsh === null,
    assumedFibre: declaredFibre === null,
  }
}

export function FoodForm({
  hid,
  catId,
  uid,
  existing,
  onDone,
}: {
  hid: string
  catId: string
  uid: string
  existing?: Food
  onDone: () => void
}) {
  const [name, setName] = useState(existing?.name ?? '')
  const [brand, setBrand] = useState(existing?.brand ?? '')
  const [type, setType] = useState<FoodType>(existing?.type ?? 'dry')
  const [kcalPerGram, setKcalPerGram] = useState(existing ? String(existing.kcalPerGram) : '')
  const [draft, setDraft] = useState<AnalysisDraft>(
    existing?.analysis ? draftFromAnalysis(existing.analysis) : EMPTY_DRAFT,
  )
  // Non-null only while kcalPerGram is the calculator's own output; typing in
  // the kcal field by hand clears it, so a saved analysis always explains the
  // saved kcal figure.
  const [analysis, setAnalysis] = useState<FoodAnalysis | null>(existing?.analysis ?? null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const kcalNum = parseDecimal(kcalPerGram)
  const kcalValid = kcalNum !== null && kcalNum >= 0.01 && kcalNum <= 10

  const resolved = resolveDraft(draft, type)
  // Only a typo in the declared figures blocks the calculation.
  const overDeclared = resolved !== null && resolved.declaredSumPct > 100.5
  const calculated =
    resolved === null || overDeclared ? null : kcalPer100gFromAnalysis(resolved.analysis)
  // The assumptions squeezing carbohydrate to nothing is a milder problem: the
  // figure is still usable, but the food type is probably wrong.
  const assumptionsCrowded =
    resolved !== null &&
    !overDeclared &&
    (resolved.assumedAsh || resolved.assumedFibre) &&
    analysisSumPct(resolved.analysis) > 100

  function setDraftField(key: keyof AnalysisDraft, value: string): void {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  function useCalculated(): void {
    if (resolved === null || calculated === null) return
    // Two decimals is the resolution the kcal field is stored at anyway.
    setKcalPerGram((Math.round(calculated) / 100).toFixed(2))
    setAnalysis(resolved.analysis)
    setError(null)
  }

  async function submit(): Promise<void> {
    const trimmedName = name.trim()
    if (trimmedName === '') {
      setError('Give the food a name.')
      return
    }
    if (kcalNum === null || !kcalValid) {
      setError('kcal per gram must be between 0.01 and 10.')
      return
    }
    setError(null)
    setSaving(true)
    const trimmedBrand = brand.trim()
    const input = {
      name: trimmedName,
      brand: trimmedBrand === '' ? null : trimmedBrand,
      type,
      kcalPerGram: kcalNum,
      analysis,
    }
    try {
      // 'confirmed' and 'queued' both count as success (offline-first).
      await awaitOrQueued(
        existing ? updateFood(hid, catId, existing.id, input) : addFood(hid, catId, uid, input),
      )
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the food — please try again.')
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
          data-testid="food-name"
          type="text"
          maxLength={80}
          value={name}
          onChange={(e) => {
            setName(e.target.value)
          }}
          className={INPUT_CLASS}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-semibold">
        Brand (optional)
        <input
          type="text"
          maxLength={80}
          value={brand}
          onChange={(e) => {
            setBrand(e.target.value)
          }}
          className={INPUT_CLASS}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-semibold">
        Type
        <select
          data-testid="food-type"
          value={type}
          onChange={(e) => {
            const v = e.target.value
            if (v === 'dry' || v === 'wet' || v === 'treat') setType(v)
          }}
          className={INPUT_CLASS}
        >
          <option value="dry">Dry</option>
          <option value="wet">Wet</option>
          <option value="treat">Treat</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm font-semibold">
        kcal per gram
        <input
          {...DECIMAL_INPUT_PROPS}
          data-testid="food-kcal-per-gram"
          value={kcalPerGram}
          placeholder="e.g. 3,5"
          onChange={(e) => {
            setKcalPerGram(e.target.value)
            // Hand-edited: the stored constituents no longer explain this figure.
            setAnalysis(null)
          }}
          className={INPUT_CLASS}
        />
        <span className="text-xs font-normal text-ink-soft">
          Tip: labels often state kcal per 100 g — divide by 100
        </span>
        {kcalValid ? (
          <span className="text-xs font-semibold text-positive">
            ≈ {String(roundKcal(kcalNum * 100))} kcal per 100 g
          </span>
        ) : null}
      </label>

      <details open={existing?.analysis != null}>
        <summary data-testid="food-analysis-toggle" className="disclosure">
          No kcal on the label?
        </summary>
        <div className="mt-2 flex flex-col gap-2">
          <p className="text-xs text-ink-soft">
            Type the analytical constituents instead and we work the energy out from them.
          </p>

          {ANALYSIS_FIELDS.map((field) => (
            <label key={field.key} className="flex flex-col gap-1 text-sm font-semibold">
              {field.label}
              <input
                {...DECIMAL_INPUT_PROPS}
                data-testid={`food-analysis-${field.key}`}
                value={draft[field.key]}
                placeholder={field.placeholder(type)}
                onChange={(e) => {
                  setDraftField(field.key, e.target.value)
                }}
                className={INPUT_CLASS}
              />
            </label>
          ))}

          {overDeclared ? (
            <p role="alert" className="text-xs font-semibold text-danger">
              Those add up to more than 100% — check the figures.
            </p>
          ) : null}

          {resolved !== null && calculated !== null ? (
            <>
              <p data-testid="food-analysis-result" className="text-sm">
                Carbohydrate {nfePct(resolved.analysis).toFixed(1)}% ·{' '}
                <span className="font-semibold text-positive">
                  {String(roundKcal(calculated))} kcal per 100 g
                </span>
              </p>
              {resolved.assumedAsh || resolved.assumedFibre ? (
                <p className="text-xs text-ink-soft">
                  Assuming {resolved.assumedAsh ? `${String(TYPICAL_ASH_PCT[type])}% ash` : ''}
                  {resolved.assumedAsh && resolved.assumedFibre ? ' and ' : ''}
                  {resolved.assumedFibre ? `${String(TYPICAL_FIBRE_PCT[type])}% fibre` : ''} —
                  typical for {type} food. Fill them in if the label lists them.
                </p>
              ) : null}
              {assumptionsCrowded ? (
                <p
                  data-testid="food-analysis-crowded"
                  className="text-xs font-semibold text-danger"
                >
                  Those assumptions leave no room for carbohydrate — check the Type above, or type
                  ash and fibre from the label.
                </p>
              ) : null}
              <button
                type="button"
                data-testid="food-analysis-apply"
                onClick={useCalculated}
                className="btn-secondary"
              >
                Use {(Math.round(calculated) / 100).toFixed(2)} kcal per gram
              </button>
            </>
          ) : null}

          <p className="text-xs text-ink-soft">Estimates only — always confirm with your vet.</p>
        </div>
      </details>

      {error === null ? null : (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          data-testid="food-save"
          disabled={saving}
          className="btn-primary flex-1"
        >
          {existing ? 'Save changes' : 'Add food'}
        </button>
        <button type="button" onClick={onDone} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  )
}
