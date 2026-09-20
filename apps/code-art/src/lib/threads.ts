import type { Color } from 'three'
import type { Link } from './atlas.ts'
import type { Life } from './series.ts'

/** Line segment pairs, one per link, each carrying the frames it lives in. */
export interface Threads {
  readonly positions: Float32Array
  readonly colors: Float32Array
  readonly births: Float32Array
  readonly deaths: Float32Array
}

/**
 * Joins linked files with straight lines, brightest for the heaviest link.
 * `ends` gives the colours at the two ends; they are scaled by `brightness`
 * of the link's weight, so a thin link stays faint.
 */
export function threads(
  links: readonly Link[],
  lives: readonly Life[],
  centres: readonly (readonly [number, number, number])[],
  ends: (from: number, to: number) => readonly [Color, Color],
  brightness: (share: number) => number,
): Threads {
  const heaviest = Math.log1p(links[0]?.[2] ?? 1)
  const out = {
    positions: new Float32Array(links.length * 6),
    colors: new Float32Array(links.length * 6),
    births: new Float32Array(links.length * 2),
    deaths: new Float32Array(links.length * 2),
  }
  links.forEach(([from, to, weight], i) => {
    out.positions.set([...centres[from]!, ...centres[to]!], i * 6)
    const [birth, death] = lives[i]!
    out.births.set([birth, birth], i * 2)
    out.deaths.set([death, death], i * 2)
    const k = brightness(Math.log1p(weight) / heaviest)
    const [a, c] = ends(from, to)
    out.colors.set(
      [a.r * k, a.g * k, a.b * k, c.r * k, c.g * k, c.b * k],
      i * 6,
    )
  })
  return out
}
