import { differenceInDays } from 'date-fns'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ageInMonths, growthBand, roundKg } from '../lib/catmath'
import { type Cat, type WeightEntry } from '../lib/schemas'

// Average month length in days — keeps entry ages on a smooth numeric axis.
const DAYS_PER_MONTH = 30.44

interface BandPoint {
  ageM: number
  band: [number, number]
}

interface ActualPoint {
  ageM: number
  kg: number
}

/** Tooltip values: the band series yields [low, high]; the line yields a number. */
function formatKgValue(value: unknown): string {
  if (Array.isArray(value)) {
    const parts = value
      .filter((v): v is number => typeof v === 'number')
      .map((v) => String(roundKg(v)))
    return `${parts.join(' – ')} kg`
  }
  if (typeof value === 'number') return `${String(roundKg(value))} kg`
  return ''
}

function formatAgeLabel(label: unknown): string {
  if (typeof label !== 'number') return ''
  return `${String(Math.round(label * 10) / 10)} mo old`
}

/**
 * Kitten growth chart: expected weight band (mint area) from growthBand()
 * with the actual weigh-ins drawn on top (coral line). X axis is age in
 * months so the curve stays meaningful however sparse the entries are.
 */
export function GrowthChart({ cat, entries }: { cat: Cat; entries: WeightEntry[] }) {
  const maxAge = Math.max(13, ageInMonths(cat.birthDate, new Date()) + 1)

  const bandData: BandPoint[] = []
  for (let ageM = 0; ageM <= maxAge; ageM += 0.5) {
    const { lowKg, highKg } = growthBand(ageM, cat.idealWeightKg)
    bandData.push({ ageM, band: [roundKg(lowKg), roundKg(highKg)] })
  }

  const ticks: number[] = []
  for (let tick = 0; tick <= maxAge; tick += 2) ticks.push(tick)

  const actualData: ActualPoint[] = entries.map((entry) => ({
    ageM: Math.max(0, differenceInDays(entry.date, cat.birthDate)) / DAYS_PER_MONTH,
    kg: roundKg(entry.weightKg),
  }))

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={bandData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="ageM"
              type="number"
              domain={[0, maxAge]}
              ticks={ticks}
              tickFormatter={(value: number) => `${String(Math.round(value))}mo`}
              tick={{ fontSize: 12 }}
            />
            <YAxis unit=" kg" width={44} tick={{ fontSize: 12 }} />
            <Tooltip formatter={formatKgValue} labelFormatter={formatAgeLabel} />
            <Area
              dataKey="band"
              name="Expected range"
              stroke="none"
              fill="#dff5ea"
              fillOpacity={0.9}
              isAnimationActive={false}
            />
            <Line
              data={actualData}
              dataKey="kg"
              name="Actual"
              type="monotone"
              stroke="#ff7a59"
              strokeWidth={3}
              dot={{ r: 4 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
        {entries.length === 0 ? (
          <p className="absolute inset-0 flex items-center justify-center text-center text-sm font-semibold text-ink-soft">
            Log a weigh-in to see progress
          </p>
        ) : null}
      </div>
      <p className="text-xs text-ink-soft">
        <span aria-hidden="true" className="text-coral">
          ●
        </span>{' '}
        actual{' · '}
        <span aria-hidden="true" className="text-mint">
          ●
        </span>{' '}
        expected range
      </p>
    </div>
  )
}
