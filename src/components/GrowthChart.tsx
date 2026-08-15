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
import { growthBand, roundKg, WEEKS_LABEL_CUTOFF } from '../lib/catmath'
import { type Cat, type WeightEntry } from '../lib/schemas'

// Average month length in days — keeps entry ages on a smooth numeric axis.
const DAYS_PER_MONTH = 30.44
const WEEKS_PER_MONTH = DAYS_PER_MONTH / 7

interface ChartPoint {
  /** Age on the x axis, in the chart's current unit (weeks or months). */
  age: number
  band: [number, number]
  /** Weigh-in at this exact age; null everywhere else (Tooltip filters nulls). */
  kg: number | null
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

/**
 * Kitten growth chart: the expected weight band from growthBand() as a pale
 * coral wash, with the actual weigh-ins as a solid coral line on top. One
 * hue, two weights — reference vs. reality — instead of two competing
 * colours that each had to be learned.
 *
 * Both series share ONE dataset. They used to be separate (the Line carried
 * its own `data`), which meant a touch could only ever land on a weigh-in —
 * the expected range was untouchable. With a shared x axis every touch hits a
 * band sample, and the weigh-in value joins the tooltip where one exists.
 *
 * The axis is in weeks while the cat is under 6 months (weeks are the unit
 * kitten growth is actually discussed in) and in months afterwards, and only
 * spans the cat's own age plus a little headroom — a fixed 0-13 month axis
 * squeezed a 12-week kitten into the left quarter of the chart.
 */
export function GrowthChart({ cat, entries }: { cat: Cat; entries: WeightEntry[] }) {
  const ageMonths = Math.max(0, differenceInDays(new Date(), cat.birthDate)) / DAYS_PER_MONTH
  const useWeeks = ageMonths * WEEKS_PER_MONTH < WEEKS_LABEL_CUTOFF
  const unit = useWeeks ? 'w' : 'mo'
  const toAxis = (months: number) => (useWeeks ? months * WEEKS_PER_MONTH : months)

  // Headroom so the newest point is never glued to the right edge.
  const maxMonths = Math.max(useWeeks ? 1 : 3, ageMonths + (useWeeks ? 0.5 : 1))
  const maxAxis = toAxis(maxMonths)

  // One sample per half-week (weeks view) or half-month (months view), plus an
  // exact sample at every weigh-in so the line lands on its real age.
  const stepMonths = useWeeks ? 0.5 / WEEKS_PER_MONTH : 0.5
  const kgByAxisAge = new Map<number, number>()
  for (const entry of entries) {
    const months = Math.max(0, differenceInDays(entry.date, cat.birthDate)) / DAYS_PER_MONTH
    kgByAxisAge.set(toAxis(months), roundKg(entry.weightKg))
  }

  const ages = new Set<number>(kgByAxisAge.keys())
  for (let months = 0; months <= maxMonths + 1e-9; months += stepMonths) {
    ages.add(toAxis(months))
  }

  const data: ChartPoint[] = [...ages]
    .sort((a, b) => a - b)
    .map((age) => {
      const months = useWeeks ? age / WEEKS_PER_MONTH : age
      const { lowKg, highKg } = growthBand(months, cat.idealWeightKg)
      return {
        age,
        band: [roundKg(lowKg), roundKg(highKg)],
        kg: kgByAxisAge.get(age) ?? null,
      }
    })

  // ~6 ticks whatever the span, rounded to a friendly interval.
  const rawStep = maxAxis / 6
  const niceSteps = useWeeks ? [1, 2, 4, 8, 13] : [1, 2, 3, 6, 12]
  const tickStep = niceSteps.find((step) => step >= rawStep) ?? niceSteps[niceSteps.length - 1] ?? 1
  const ticks: number[] = []
  for (let tick = 0; tick <= maxAxis; tick += tickStep) ticks.push(tick)

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="#e3d3c6" vertical={false} />
            <XAxis
              dataKey="age"
              type="number"
              domain={[0, maxAxis]}
              ticks={ticks}
              tickFormatter={(value: number) => `${String(Math.round(value))}${unit}`}
              tick={{ fontSize: 12, fill: '#8a7168' }}
              stroke="#e3d3c6"
            />
            {/* width 44 wrapped "1.65 kg" onto two lines on a 375pt screen. */}
            <YAxis
              unit=" kg"
              width={58}
              tick={{ fontSize: 12, fill: '#8a7168' }}
              stroke="#e3d3c6"
            />
            <Tooltip
              formatter={formatKgValue}
              labelFormatter={(label: unknown) =>
                typeof label === 'number'
                  ? `${String(Math.round(label))} ${useWeeks ? 'weeks' : 'months'} old`
                  : ''
              }
            />
            <Area
              dataKey="band"
              name="Expected range"
              stroke="none"
              fill="#ffe7dc"
              fillOpacity={1}
              isAnimationActive={false}
              activeDot={false}
            />
            <Line
              dataKey="kg"
              name="Actual"
              type="monotone"
              stroke="#e0522f"
              strokeWidth={2.5}
              dot={{ r: 4 }}
              connectNulls
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
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-soft">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-coral-deep" />
          actual
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-3 w-4 rounded-sm bg-coral-soft" />
          expected range
        </span>
        <span>tap for values</span>
      </p>
    </div>
  )
}
