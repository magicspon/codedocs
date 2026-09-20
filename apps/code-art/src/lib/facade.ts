import { Color } from 'three'
import { symbolCount, type FileDatum } from './atlas.ts'
import { KIND_COLORS } from './palette.ts'

/**
 * What a building's facade is made of. A tower is not a plain box: its windows
 * are lit by how much of the file the rest of the codebase reaches, their
 * colour comes from the kind of symbol the file mostly holds, and its
 * silhouette steps back once for each extra kind it declares.
 */
export interface Facade {
  /** Share of windows lit, in `[0, 1]`. */
  readonly lit: number
  /** What its lit windows glow. */
  readonly lamp: Color
  /** Scatters the lit windows; a building always draws the same ones. */
  readonly seed: number
  /** Setbacks stacked on the shaft. `0` is a plain slab. */
  readonly tiers: number
}

/** A building's windows are never all out: someone left the stairwell on. */
const STAIRWELL = 0.06

/**
 * Traffic per symbol at which half the windows are lit. Real repositories run
 * a median of about 3 in a well-resolved index and under 1 in one full of
 * unresolved calls, so 1.5 puts a typical city between half-lit and dim.
 */
const BUSY = 1.5

/** A plain window lamp, before the file's own symbols tint it. */
const LAMP = new Color('#ffdca8')

/** No tower steps back more than this, however many kinds it declares. */
const MAX_TIERS = 3

/** The top share of a building's height given over to its setbacks. */
export const TIER_SHARE = 0.32

/**
 * How lit a file's windows are: the calls and references touching it, per
 * symbol, saturating so a hub does not blind the street. A file nothing
 * reaches keeps only its stairwell light.
 */
export function litOf(file: FileDatum): number {
  const symbols = symbolCount(file)
  if (symbols === 0) return STAIRWELL
  const traffic =
    (file.callsIn + file.callsOut + file.callsSelf + file.refsIn) / symbols
  return STAIRWELL + (1 - STAIRWELL) * (traffic / (traffic + BUSY))
}

/** Window light tinted by the kind of symbol the file mostly declares. */
export function lampOf(file: FileDatum): Color {
  let best = 0
  file.kinds.forEach((n, k) => {
    if (n > (file.kinds[best] ?? 0)) best = k
  })
  return LAMP.clone().lerp(KIND_COLORS[best] ?? LAMP, 0.4)
}

/**
 * Setbacks: one per kind of symbol the file declares beyond the first, so a
 * file mixing classes, types and enums is a stepped tower and a file of plain
 * functions is a slab. `slender` is the building's height over its widest
 * side; a squat plot has no room to step.
 */
export function tiersOf(file: FileDatum, slender: number): number {
  const kinds = file.kinds.filter((n) => n > 0).length
  return Math.max(0, Math.min(kinds - 1, MAX_TIERS, Math.floor(slender)))
}

/** The whole facade of one file's building. */
export function facadeOf(
  file: FileDatum,
  slender: number,
  seed: number,
): Facade {
  return {
    lit: litOf(file),
    lamp: lampOf(file),
    seed,
    tiers: tiersOf(file, slender),
  }
}
