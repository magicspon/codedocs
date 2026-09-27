import { Color } from 'three'
import type { FileDatum } from './atlas.ts'
import { hueOf } from './hue.ts'
import { KIND_COLORS } from './palette.ts'
import { hash } from './rng.ts'
import { DUST_INKS, NEBULA_INKS, pickInks } from './sky-inks.ts'

/**
 * Each galaxy's own colours, worked out from the dataset rather than drawn at
 * random, so one repository always looks the same and two never look alike.
 *
 * - **Key hue** comes from the name, the same hue its landing card glows in.
 * - **Spread** comes from the mix of symbol kinds: a codebase that is mostly
 *   one kind gets a tight, near-single-hue palette; an even mix of functions,
 *   types and classes fans its arms across more of the wheel.
 * - **Haze and dust** take a few astrophotography inks each, picked by name.
 */
export interface GalaxyPalette {
  /** The key hue, in degrees. */
  readonly hue: number
  /** How wide the arms fan round the key hue, in degrees. */
  readonly spread: number
  /** Tint for spiral arm `arm`. */
  arm(arm: number): Color
  /** Tint for a halo file in tsconfig project `project` (`-1` for none). */
  halo(project: number): Color
  /** `KIND_COLORS`, leant a little towards the key hue. */
  readonly kinds: readonly Color[]
  /** Nebula colour for the file at `path`, already dimmed for additive puffs. */
  nebula(path: string): Color
  /** Dust colour for the lane from file `from` to file `to`. */
  grain(from: number, to: number): Color
}

/** The narrowest and widest the arms may fan, in degrees. */
const MIN_SPREAD = 50
const MAX_SPREAD = 220
/** How far kind colours lean to the key hue; past this the kind stops reading. */
const KIND_LEAN = 0.18
/** Inks each galaxy takes for its haze and its dust. */
const NEBULA_PICKS = 4
const DUST_PICKS = 3
/**
 * Channel sum for a nebula puff. Puffs glow additively and stack, so they
 * stay this dim; normalising the sum keeps every ink equally faint.
 */
const NEBULA_GLOW = 0.085

/**
 * How evenly symbols split across kinds: `0` when all are one kind, `1` when
 * every kind is equally common (normalised Shannon entropy).
 */
export function kindEvenness(files: readonly FileDatum[]): number {
  const totals = KIND_COLORS.map(() => 0)
  for (const f of files) f.kinds.forEach((n, k) => (totals[k]! += n))
  const sum = totals.reduce((a, b) => a + b, 0)
  if (sum === 0) return 0
  let entropy = 0
  for (const n of totals) if (n > 0) entropy -= (n / sum) * Math.log(n / sum)
  return entropy / Math.log(totals.length)
}

/** Builds the palette for dataset `name` from its files. */
export function galaxyPalette(
  name: string,
  files: readonly FileDatum[],
): GalaxyPalette {
  const hue = hueOf(name)
  const spread = MIN_SPREAD + (MAX_SPREAD - MIN_SPREAD) * kindEvenness(files)
  // The golden ratio scatters indices across the fan, so neighbouring arms differ.
  const around = (i: number): number =>
    (hue + spread * (((i * 0.618034) % 1) - 0.5) + 360) % 360
  const key = new Color().setHSL(hue / 360, 0.8, 0.7)
  const nebulae = pickInks(
    NEBULA_INKS,
    NEBULA_PICKS,
    hash(`${name}:nebula`),
  ).map((c) => c.clone().multiplyScalar(NEBULA_GLOW / (c.r + c.g + c.b)))
  const grains = pickInks(DUST_INKS, DUST_PICKS, hash(`${name}:dust`))
  return {
    hue,
    spread,
    arm: (arm) => new Color().setHSL(around(arm) / 360, 0.55, 0.7),
    halo: (project) =>
      project < 0
        ? new Color().setHSL(0, 0, 0.36)
        : new Color().setHSL(around(project) / 360, 0.2, 0.6),
    kinds: KIND_COLORS.map((c) => c.clone().lerp(key, KIND_LEAN)),
    // Picked by path, so a file's haze keeps its colour however the data is ordered.
    nebula: (path) => nebulae[hash(path) % nebulae.length]!,
    grain: (from, to) =>
      grains[((Math.imul(from, 31) + to) >>> 0) % grains.length]!,
  }
}
