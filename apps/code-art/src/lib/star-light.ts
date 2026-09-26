import { visibility, type Life } from './series.ts'

/** Below this, a star is too faint to be worth drawing planets round. */
export const FAINT = 0.1

/**
 * How bright a file's star is drawn, `0` to `1`, as the galaxy's star shader
 * works it out, so its planets can match: gone before the file was written
 * and after it was deleted, sunk to an ember when a search passes it by, and
 * out altogether when isolation hides it.
 *
 * `focus` is the file's focus under the search (`1` searched, `0.6`
 * reached, `0` untouched), and `searching` and `isolating` how far those have
 * eased in, `0` to `1`.
 */
export function starLight(
  life: Life,
  t: number,
  focus: number,
  searching: number,
  isolating: number,
): number {
  const away = searching * (1 - focus)
  const hidden = focus > 0 ? 0 : isolating
  return visibility(life, t) * (1 - 0.94 * away) * (1 - hidden)
}
