import { KINDS, type FileDatum } from './atlas.ts'
import type { Field } from './terrain-field.ts'

/**
 * Strata: each peak is banded from foot to summit by its file's mix of symbol
 * kinds, in `KINDS` order, like layers of rock. A band's thickness is that
 * kind's share of the file's symbols, so a file of mostly functions is mostly
 * one colour, and a file of types and classes shows its layers.
 */
export interface Strata {
  /**
   * Per vertex, 8 numbers: the running share of symbols up to and including
   * each kind, so band `k` spans from entry `k - 1` (or `0`) to entry `k`.
   * Packed as two `vec4` attributes of 4 numbers each.
   */
  readonly lower: Float32Array
  readonly upper: Float32Array
  /** Per vertex, how far up its peak it stands, `0`–`1`; `-1` off any peak. */
  readonly rise: Float32Array
}

/** Running shares of each kind in one file; all `1` for a file with no symbols. */
export function kindBands(file: FileDatum): number[] {
  const total = file.kinds.reduce((a, b) => a + b, 0)
  let run = 0
  return KINDS.map((_, k) => {
    run += file.kinds[k] ?? 0
    return total === 0 ? 1 : run / total
  })
}

/** Bands every vertex by the kinds of the file whose peak it stands on. */
export function strataOf(field: Field, files: readonly FileDatum[]): Strata {
  const count = field.size * field.size
  const lower = new Float32Array(count * 4)
  const upper = new Float32Array(count * 4)
  const rise = new Float32Array(count).fill(-1)
  // Each peak's own summit, so its bands reach the top whatever its height.
  const summit = new Float32Array(files.length)
  for (let v = 0; v < count; v++) {
    const f = field.owner[v]!
    if (f >= 0) summit[f] = Math.max(summit[f]!, field.heights[v]!)
  }
  const bands = files.map(kindBands)
  for (let v = 0; v < count; v++) {
    const f = field.owner[v]!
    if (f < 0 || summit[f]! <= 0) continue
    const b = bands[f]!
    lower.set(b.slice(0, 4), v * 4)
    upper.set(b.slice(4, 8), v * 4)
    rise[v] = Math.max(0, field.heights[v]!) / summit[f]!
  }
  return { lower, upper, rise }
}
