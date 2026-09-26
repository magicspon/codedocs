import { Color } from 'three'
import { gaussian } from './rng.ts'

/** The disc's hot inner edge and cool rim. */
const HOT = new Color('#ffb35c')
const COOL = new Color('#c8300a')
/** How far out the disc runs, against its inner edge. */
const WIDTH = 1.6

/** A disc star: where it sits against its hole, its colour and its size. */
export interface DiscStar {
  readonly offset: readonly [number, number, number]
  readonly color: Color
  readonly size: number
}

/** A tilt for one hole's disc, so the holes in a galaxy do not all lie flat alike. */
export interface Tilt {
  readonly x: number
  readonly z: number
}

/** Draws a disc's tilt: up to about 35° either way on each axis. */
export function tiltOf(random: () => number): Tilt {
  return { x: (random() - 0.5) * 1.2, z: (random() - 0.5) * 1.2 }
}

/**
 * One star of a black hole's accretion disc: a symbol of a test file, swept
 * into a thin tilted ring round an empty middle. Stars crowd the inner edge,
 * where they burn bright orange, and thin and redden towards the rim. `inner` is
 * the edge of the dark; `dim` scales the whole disc, as rank dims the crowded core.
 */
export function discStar(
  random: () => number,
  inner: number,
  tilt: Tilt,
  dim: number,
): DiscStar {
  // Squared, so stars pile up at the inner edge.
  const out = random() ** 2
  const r = inner * (1 + out * WIDTH)
  const angle = random() * Math.PI * 2
  const x = Math.cos(angle) * r
  const y = gaussian(random) * r * 0.025
  const z = Math.sin(angle) * r
  // Tip the flat disc about x, then about z.
  const [cx, sx] = [Math.cos(tilt.x), Math.sin(tilt.x)]
  const [cz, sz] = [Math.cos(tilt.z), Math.sin(tilt.z)]
  const y1 = y * cx - z * sx
  const z1 = y * sx + z * cx
  const color = new Color()
    .lerpColors(HOT, COOL, out)
    .multiplyScalar((0.35 + random() * 0.35) * (1.4 - out) * dim)
  return {
    offset: [x * cz - y1 * sz, x * sz + y1 * cz, z1],
    color,
    size: 0.06 + random() * 0.1,
  }
}
