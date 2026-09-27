import { Color } from 'three'
import { rng } from './rng.ts'

/**
 * The colours of astrophotography, for haze and dust. Each galaxy takes a few
 * of each (`pickInks`), so no two skies share the same mix.
 */

/**
 * Glowing gas, named for what makes the colour: hydrogen-alpha red, the pink
 * where hydrogen lines blend, doubly ionised oxygen teal, blue reflection
 * nebulae, and the gold, orange and green of mapped-colour (SHO) images.
 */
export const NEBULA_INKS: readonly Color[] = [
  '#ff2a3a', // H-alpha
  '#ff4f9a', // H-alpha with H-beta
  '#1fe0c4', // O III
  '#3a78ff', // reflection
  '#9a4dff', // violet
  '#ffb020', // SHO gold
  '#ff7418', // sulphur orange
  '#6ad85a', // SHO green
  '#3fc8ff', // H-beta cyan
].map((hex) => new Color(hex))

/** Dust lit by starlight: rust, ochre, umber, amber, tan and a dusky red. */
export const DUST_INKS: readonly Color[] = [
  '#b0502a',
  '#c08038',
  '#7a4a30',
  '#d98a2a',
  '#c9a06a',
  '#9a3024',
].map((hex) => new Color(hex))

/**
 * `count` distinct inks from `inks`, chosen by `seed`: the same seed always
 * picks the same ones.
 */
export function pickInks(
  inks: readonly Color[],
  count: number,
  seed: number,
): Color[] {
  const random = rng(seed)
  // A partial Fisher–Yates shuffle, stopped once enough are drawn.
  const pool = [...inks]
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const j = i + Math.floor(random() * (pool.length - i))
    ;[pool[i], pool[j]] = [pool[j]!, pool[i]!]
  }
  return pool.slice(0, count)
}
