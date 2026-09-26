import { KINDS, type FileDatum } from './atlas.ts'
import { gaussian, hash, rng } from './rng.ts'
import { byKind, type SymbolTree } from './symbol-tree.ts'

/**
 * A picked file as a solar system: the file is the star, its top-level
 * symbols are the planets, and what each symbol declares inside it are that
 * planet's moons. Each kind of symbol keeps its own orbit, always in `KINDS`
 * order outward, so functions are always inside classes and a reader learns
 * the rings once. A crowded orbit thickens into a belt.
 */

/** One planet on its ring. */
export interface Planet {
  /** Where on the ring it starts, in radians. */
  readonly phase: number
  /** How far off the ring's line it sits, across and up: the belt's thickness. */
  readonly drift: number
  readonly lift: number
  /** Its index in the file's `FileSymbols`, or `-1` when the names are not known. */
  readonly symbol: number
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
  /** How many symbols of this kind circle here, drawn or not. */
  readonly count: number
  readonly planets: readonly Planet[]
}

/** A file's whole system, or one symbol's moons. */
export interface System {
  readonly rings: readonly Ring[]
  /** The outermost ring's radius: how far a camera stands back to see it all. */
  readonly reach: number
}

/** How far back a camera stands from a system, in radii of its outermost ring. */
export const SYSTEM_VIEW = 3.4

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

/**
 * A moon system's scale against the body it circles: its first ring lies
 * three body radii out, clear of the surface.
 */
const MOON_SCALE = 3 / FIRST_RING
/** Moons drawn larger than the rings' scale alone makes them, or they vanish. */
const MOON_SIZE = 1.6

/**
 * Lays out one ring per kind. `members` lists each kind's symbols; `seed`
 * keeps the layout the same every time; `scale` shrinks radii and sizes
 * together, so a moon system is a planet system in miniature.
 */
function ringsOf(
  members: readonly (readonly number[])[],
  seed: string,
  scale: number,
  sizing: number,
): System {
  const random = rng(hash(seed))
  const rings: Ring[] = []
  members.forEach((symbols, kind) => {
    const count = symbols.length
    if (count <= 0) return
    const radius = (FIRST_RING + rings.length * RING_GAP) * scale
    const shown = Math.min(count, MAX_PER_RING)
    // A belt widens with its crowd, but never into the next orbit.
    const width = Math.min(RING_GAP * 0.35, Math.sqrt(shown) * 0.012) * scale
    const offset = random() * Math.PI * 2
    rings.push({
      kind,
      radius,
      tilt: gaussian(random) * 0.12,
      node: random() * Math.PI * 2,
      // Kepler's ratio against the innermost radius, so it holds at any scale.
      speed:
        ((Math.PI * 2) / INNER_PERIOD) * ((FIRST_RING * scale) / radius) ** 1.5,
      size: (SIZES[kind] ?? 0.05) * scale * sizing,
      count,
      planets: Array.from({ length: shown }, (_, k) => ({
        // Evenly spaced, then nudged, so a few planets do not bunch up.
        phase: offset + ((k + random() * 0.6) / shown) * Math.PI * 2,
        drift: gaussian(random) * width,
        lift: gaussian(random) * width * 0.3,
        symbol: symbols[k]!,
      })),
    })
  })
  const reach = rings.at(-1)?.radius ?? FIRST_RING * scale
  return { rings, reach }
}

/**
 * Lays out `file`'s planets, the same way every time for the same path. With
 * its symbol tree, only top-level symbols are planets; without one (names not
 * exported, or not loaded) every symbol is, counted from the atlas.
 */
export function orbitsOf(file: FileDatum, tree: SymbolTree | null): System {
  const members = tree
    ? byKind(tree.symbols, tree.roots)
    : KINDS.map((_, kind) =>
        Array.from({ length: file.kinds[kind] ?? 0 }, () => -1),
      )
  return ringsOf(members, file.path, 1, 1)
}

/**
 * The `reach` `orbitsOf(file, null)` would give, without laying out a
 * planet: one ring per kind the file declares.
 */
export function reachOf(file: FileDatum): number {
  const rings = KINDS.filter((_, kind) => (file.kinds[kind] ?? 0) > 0).length
  return FIRST_RING + Math.max(0, rings - 1) * RING_GAP
}

/** The moons of `symbol`, a body of radius `size`, in the file at `path`. */
export function moonsOf(
  path: string,
  tree: SymbolTree,
  symbol: number,
  size: number,
): System {
  const members = byKind(tree.symbols, tree.children[symbol] ?? [])
  return ringsOf(members, `${path}#${symbol}`, size * MOON_SCALE, MOON_SIZE)
}

/**
 * The systems a focus passes through: the file's planets, then the moons of
 * each focused body in turn. Stops early at a symbol no ring draws.
 */
export function systemsAlong(
  path: string,
  tree: SymbolTree,
  planets: System,
  focus: readonly number[],
): System[] {
  const systems = [planets]
  for (const symbol of focus) {
    const ring = systems
      .at(-1)!
      .rings.find((r) => r.planets.some((p) => p.symbol === symbol))
    if (!ring) break
    systems.push(moonsOf(path, tree, symbol, ring.size))
  }
  return systems
}
