import { KINDS, type FileDatum } from './atlas.ts'
import { gaussian, hash, rng } from './rng.ts'

/**
 * A picked file as a solar system: the file is the star, its symbols are the
 * planets. Each kind of symbol keeps its own orbit, always in `KINDS` order
 * from the star outward, so functions are always inside classes and a reader
 * learns the rings once. A crowded orbit thickens into a belt.
 */

/** One planet on its ring. */
export interface Planet {
  /** Where on the ring it starts, in radians. */
  readonly phase: number
  /** How far off the ring's line it sits, across and up: the belt's thickness. */
  readonly drift: number
  readonly lift: number
}

/** One orbit: every symbol of one kind. */
export interface Ring {
  /** Index into `KINDS`. */
  readonly kind: number
  readonly radius: number
  /** Tilt off the system's plane, and the bearing it tilts on, in radians. */
  readonly tilt: number
  readonly node: number
  /** Radians per second; inner rings run faster, as Kepler said. */
  readonly speed: number
  /** How big each planet on the ring is. */
  readonly size: number
  /** How many symbols of this kind the file really has, drawn or not. */
  readonly count: number
  readonly planets: readonly Planet[]
}

/** A file's whole system. */
export interface System {
  readonly rings: readonly Ring[]
  /** The outermost ring's radius: how far a camera stands back to see it all. */
  readonly reach: number
}

/** Past this, a ring is a solid belt anyway; more planets only cost draw time. */
const MAX_PER_RING = 400
const FIRST_RING = 1.1
const RING_GAP = 0.5
/** Seconds the innermost ring takes to go round once. */
const INNER_PERIOD = 14

/** Planet radius per kind: classes and namespaces are the giants. */
const SIZES: readonly number[] = [
  0.055, // function
  0.1, // class
  0.07, // interface
  0.05, // typeAlias
  0.065, // enum
  0.04, // variable
  0.045, // method
  0.11, // namespace
]

/** Lays out `file`'s symbols as planets, the same way every time for the same path. */
export function orbitsOf(file: FileDatum): System {
  const random = rng(hash(file.path))
  const rings: Ring[] = []
  KINDS.forEach((_, kind) => {
    const count = file.kinds[kind] ?? 0
    if (count <= 0) return
    const radius = FIRST_RING + rings.length * RING_GAP
    const shown = Math.min(count, MAX_PER_RING)
    // A belt widens with its crowd, but never into the next orbit.
    const width = Math.min(RING_GAP * 0.35, Math.sqrt(shown) * 0.012)
    const offset = random() * Math.PI * 2
    rings.push({
      kind,
      radius,
      tilt: gaussian(random) * 0.12,
      node: random() * Math.PI * 2,
      speed: ((Math.PI * 2) / INNER_PERIOD) * (FIRST_RING / radius) ** 1.5,
      size: SIZES[kind] ?? 0.05,
      count,
      planets: Array.from({ length: shown }, (_, k) => ({
        // Evenly spaced, then nudged, so a few planets do not bunch up.
        phase: offset + ((k + random() * 0.6) / shown) * Math.PI * 2,
        drift: gaussian(random) * width,
        lift: gaussian(random) * width * 0.3,
      })),
    })
  })
  const reach = rings.at(-1)?.radius ?? FIRST_RING
  return { rings, reach }
}
