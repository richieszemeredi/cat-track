import { ageLabelLong } from '../lib/catmath'
import { type Cat } from '../lib/db'

/**
 * "1 year 1 month old", kept on one line: after a long name the label wraps
 * before the age, never through it ("1 year 1 / month old").
 */
export function CatAge({ cat, now }: { cat: Cat; now: Date }) {
  return (
    <span data-testid="cat-age" className="whitespace-nowrap">
      {ageLabelLong(cat.birthDate, now)}
    </span>
  )
}
