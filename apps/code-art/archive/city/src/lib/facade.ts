import { Color } from 'three'
import { symbolCount, type FileDatum } from './atlas.ts'
import { KIND_COLORS } from './palette.ts'

/**
 * How lit a file reads, which `settlement.ts` uses to decide what share of a
 * settlement's buildings glow, and what colour they lean towards before
 * their own kind tints them.
 */

/** A settlement's windows are never all out: someone left the stairwell on. */
const STAIRWELL = 0.06

/**
 * Traffic per symbol at which half a file's buildings are lit. Real
 * repositories run a median of about 3 in a well-resolved index and under 1
 * in one full of unresolved calls, so 1.5 puts a typical file between
 * half-lit and dim.
 */
const BUSY = 1.5

/** A plain window lamp, before a building's own kind tints it. */
const LAMP = new Color('#ffdca8')

/**
 * How lit a file's buildings are: the calls and references touching it, per
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

/** Window light tinted by the kind of symbol a file mostly declares. */
export function lampOf(file: FileDatum): Color {
  let best = 0
  file.kinds.forEach((n, k) => {
    if (n > (file.kinds[best] ?? 0)) best = k
  })
  return LAMP.clone().lerp(KIND_COLORS[best] ?? LAMP, 0.4)
}
