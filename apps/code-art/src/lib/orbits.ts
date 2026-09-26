import { isTest, KINDS, type FileDatum } from './atlas.ts'
import { FIRST_RING, keplerSpeed, MAX_PER_RING } from './kepler.ts'
import { zonesOf, zonesReach, type Member } from './planet-zones.ts'
import { gaussian, hash, rng } from './rng.ts'
import { byKind, type SymbolTree } from './symbol-tree.ts'

/**
 * A picked file as a solar system: the file is the star, its top-level
 * symbols are the planets, and what each symbol declares inside it are that
 * planet's moons. The planets fall into zones by kind (see `planet-zones.ts`);
 * a moon system, or a black hole's disc, keeps one orbit per kind, always in
 * `KINDS` order outward, and a crowded orbit thickens into a belt.
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

/**
 * How a ring's bodies lie: on one line, which a track is drawn for; spread
 * into a belt; or scattered over a shell round the star.
 */
export type RingForm = 'orbit' | 'belt' | 'cloud'

/** One orbit: one planet of its own, or a crowd of one kind. */
export interface Ring {
  /** Index into `KINDS`. */
  readonly kind: number
  readonly form: RingForm
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
  /**
   * On a black hole's disc, how hot the ring burns: `0` at the inner edge, `1`
   * at the rim. `null` on an ordinary ring, whose bodies are lit, not glowing.
   */
  readonly heat: number | null
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

const RING_GAP = 0.5
/** A disc's plane, off the system's: tipped enough to read as a disc, not a line. */
const DISC_TILT = 0.35
/** A disc swirls faster than a solar system turns. */
const DISC_SPIN = 2.5

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
  disc = false,
): System {
  const random = rng(hash(seed))
  const rings: Ring[] = []
  const filled = members.filter((m) => m.length > 0).length
  // One bearing for every ring of a disc, so they all lie in its plane; drawn
  // only for a disc, so every other system keeps the layout it always had.
  const discNode = disc ? random() * Math.PI * 2 : 0
  members.forEach((symbols, kind) => {
    const count = symbols.length
    if (count <= 0) return
    const radius = (FIRST_RING + rings.length * RING_GAP) * scale
    const shown = Math.min(count, MAX_PER_RING)
    // A belt widens with its crowd, but never into the next orbit.
    // A disc's belts spread till they meet, so its rings merge into one sheet.
    const width = disc
      ? RING_GAP * 0.4 * scale
      : Math.min(RING_GAP * 0.35, Math.sqrt(shown) * 0.012) * scale
    const offset = random() * Math.PI * 2
    const tilt = gaussian(random) * 0.12
    const node = random() * Math.PI * 2
    rings.push({
      kind,
      form: 'orbit',
      radius,
      tilt: disc ? DISC_TILT : tilt,
      node: disc ? discNode : node,
      speed: keplerSpeed(radius, scale) * (disc ? DISC_SPIN : 1),
      size: (SIZES[kind] ?? 0.05) * scale * sizing,
      count,
      heat: disc ? rings.length / Math.max(1, filled - 1) : null,
      planets: Array.from({ length: shown }, (_, k) => ({
        // Evenly spaced, then nudged, so a few planets do not bunch up.
        phase: offset + ((k + random() * 0.6) / shown) * Math.PI * 2,
        drift: gaussian(random) * width,
        // A disc is a thin sheet; a belt is a little thicker.
        lift: gaussian(random) * width * (disc ? 0.06 : 0.3),
        symbol: symbols[k]!,
      })),
    })
  })
  const reach = rings.at(-1)?.radius ?? FIRST_RING * scale
  return { rings, reach }
}

/**
 * `file`'s planets by kind, each with how many symbols it declares. With its
 * symbol tree, only top-level symbols are planets; without one (names not
 * exported, or not loaded) every symbol is, counted from the atlas, unnamed
 * and bare.
 */
function membersOf(file: FileDatum, tree: SymbolTree | null): Member[][] {
  if (!tree)
    return KINDS.map((_, kind) =>
      Array.from({ length: file.kinds[kind] ?? 0 }, () => ({
        symbol: -1,
        children: 0,
      })),
    )
  return byKind(tree.symbols, tree.roots).map((list) =>
    list.map((symbol) => ({
      symbol,
      children: tree.children[symbol]?.length ?? 0,
    })),
  )
}

/**
 * Lays out `file`'s planets, the same way every time for the same path. A
 * test file is a black hole, and its symbols are its accretion disc.
 */
export function orbitsOf(file: FileDatum, tree: SymbolTree | null): System {
  const members = membersOf(file, tree)
  if (isTest(file))
    return ringsOf(
      members.map((list) => list.map((m) => m.symbol)),
      file.path,
      1,
      1,
      true,
    )
  return zonesOf(members, file.path)
}

/**
 * The `reach` `orbitsOf(file, null)` would give, without laying out a
 * planet.
 */
export function reachOf(file: FileDatum): number {
  if (!isTest(file)) return zonesReach(membersOf(file, null))
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
