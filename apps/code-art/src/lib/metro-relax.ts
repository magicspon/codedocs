import type { Blocks } from './metro-buildings.ts'
import { SpaceHash } from './metro-hash.ts'
import type { Road } from './metro-roads.ts'
import type { Sites } from './metro-sites.ts'
import { add, tangents, unit, type Vec3 } from './metro-sphere.ts'

/**
 * Settles the buildings into the city. Each starts where the folder tree put
 * its file, then, over a few rounds, neighbours that overlap push apart and
 * any building standing in a road is shoved to the kerb. Last, each turns to
 * face the nearest road, so the streets are lined rather than littered.
 */

/** Rounds of pushing; enough for a crowded folder to spread into a block. */
const ROUNDS = 10
/** Rounds at the end that only clear the roads. */
const CLEARING = 5
/** The alley kept between neighbours, in world units. */
export const GAP = 1.4
/** The pavement kept between a building and the road. */
const KERB = 0.8
/** How far off a road a building still turns to face it. */
const FACING = 5

/** Every building's place: where it stands, and which way it faces. */
export interface Placement {
  /** World position of each building's foot, `[x, y, z]` per file. */
  readonly foot: Float32Array
  /** Radians from east towards north, in the ground's own frame at the foot. */
  readonly heading: Float32Array
  /**
   * Per building, the share of its footprint it keeps: `1` for most, less
   * for one caught between roads too close to fit it, so it stands slimmer
   * rather than in the traffic.
   */
  readonly fit: Float32Array
}

/** Every road's middle line, as world points with the road's half-width and direction. */
interface Kerbs {
  readonly points: Float32Array
  readonly half: Float32Array
  readonly along: Float32Array
  readonly hash: SpaceHash
}

function kerbsOf(roads: readonly Road[], radius: number, cell: number): Kerbs {
  let total = 0
  for (const road of roads) total += road.points.length / 3
  const points = new Float32Array(total * 3)
  const along = new Float32Array(total * 3)
  const half = new Float32Array(total)
  const hash = new SpaceHash(cell)
  let k = 0
  for (const road of roads) {
    const p = road.points
    const n = p.length / 3
    for (let s = 0; s < n; s++, k++) {
      const a = Math.max(0, s - 1) * 3
      const b = Math.min(n - 1, s + 1) * 3
      for (let c = 0; c < 3; c++) {
        points[k * 3 + c] = p[s * 3 + c]! * radius
        along[k * 3 + c] = p[b + c]! - p[a + c]!
      }
      half[k] = road.width / 2
      hash.insert(k, points[k * 3]!, points[k * 3 + 1]!, points[k * 3 + 2]!)
    }
  }
  return { points, half, along, hash }
}

/** Sets `out` to how far building `i` must move to stand clear of its overlapping neighbours. */
function apart(
  hash: SpaceHash,
  foot: Float32Array,
  blocks: Blocks,
  i: number,
  out: Float32Array,
): void {
  const x = foot[i * 3]!
  const y = foot[i * 3 + 1]!
  const z = foot[i * 3 + 2]!
  const r = blocks.reach[i]!
  out.fill(0)
  hash.near(x, y, z, (j) => {
    if (j === i) return
    const dx = x - foot[j * 3]!
    const dy = y - foot[j * 3 + 1]!
    const dz = z - foot[j * 3 + 2]!
    const d = Math.hypot(dx, dy, dz)
    const want = r + blocks.reach[j]! + GAP
    if (d >= want) return
    // Two on the very same spot part along a direction of their own.
    if (d < 1e-6) {
      out[0]! += Math.cos(i) * (want / 2)
      out[2]! += Math.sin(i) * (want / 2)
      return
    }
    const s = (want - d) / 2 / d
    out[0]! += dx * s
    out[1]! += dy * s
    out[2]! += dz * s
  })
}

/**
 * Sets `out` to how far a building of reach `r` at `(x, y, z)` must move to
 * clear the road that bites deepest; a road's many points must not add up.
 */
function offRoad(
  kerbs: Kerbs,
  x: number,
  y: number,
  z: number,
  r: number,
  out: Float32Array,
): void {
  let deepest = 0
  out.fill(0)
  kerbs.hash.near(x, y, z, (k) => {
    const dx = x - kerbs.points[k * 3]!
    const dy = y - kerbs.points[k * 3 + 1]!
    const dz = z - kerbs.points[k * 3 + 2]!
    const d = Math.max(Math.sqrt(dx * dx + dy * dy + dz * dz), 1e-6)
    const bite = kerbs.half[k]! + r + KERB - d
    if (bite <= deepest) return
    deepest = bite
    out.set([(dx / d) * bite, (dy / d) * bite, (dz / d) * bite])
  })
}

/** Places every building: pushed apart, off the roads, and turned to face them. */
export function relax(
  sites: Sites,
  blocks: Blocks,
  roads: readonly Road[],
): Placement {
  const { radius } = sites
  const n = blocks.count
  let widest = 0
  for (let i = 0; i < n; i++) widest = Math.max(widest, blocks.reach[i]!)
  const cell = Math.max(8, widest * 2 + GAP)
  // A road need only be looked for as far as the widest road and building
  // reach, and the most a building turns to face a road from.
  let widestRoad = 0
  for (const road of roads) widestRoad = Math.max(widestRoad, road.width / 2)
  const kerbs = kerbsOf(roads, radius, widestRoad + widest + FACING)
  const foot = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const d = sites.plots[i]!
    foot.set([d[0] * radius, d[1] * radius, d[2] * radius], i * 3)
  }

  const push = new Float32Array(3)
  const move = (i: number, apart: number, clear: number): void => {
    const at = i * 3
    const nx = foot[at]! + push[0]! * apart
    const ny = foot[at + 1]! + push[1]! * apart
    const nz = foot[at + 2]! + push[2]! * apart
    offRoad(kerbs, nx, ny, nz, blocks.reach[i]!, push)
    const x = nx + push[0]! * clear
    const y = ny + push[1]! * clear
    const z = nz + push[2]! * clear
    const l = Math.hypot(x, y, z) / radius
    foot.set([x / l, y / l, z / l], at)
  }
  for (let round = 0; round < ROUNDS; round++) {
    const hash = new SpaceHash(cell)
    for (let i = 0; i < n; i++)
      hash.insert(i, foot[i * 3]!, foot[i * 3 + 1]!, foot[i * 3 + 2]!)
    for (let i = 0; i < n; i++) {
      apart(hash, foot, blocks, i, push)
      move(i, 0.6, 0.8)
    }
  }
  // Last, clear the roads outright: a building may lean on its neighbour,
  // but never stand in the traffic.
  for (let round = 0; round < CLEARING; round++)
    for (let i = 0; i < n; i++) {
      push.fill(0)
      move(i, 0, 1)
    }

  resettle(foot, blocks, kerbs, cell, radius)
  return {
    foot,
    heading: headings(foot, blocks, kerbs),
    fit: fits(foot, blocks, kerbs),
  }
}

/** The narrowest a squeezed building's footprint gets, in world units from its middle. */
const THINNEST = 0.8

/** The room round `(x, y, z)` before the nearest kerb, less a little pavement. */
function roomAt(kerbs: Kerbs, x: number, y: number, z: number): number {
  let room = Infinity
  kerbs.hash.near(x, y, z, (k) => {
    const dx = x - kerbs.points[k * 3]!
    const dy = y - kerbs.points[k * 3 + 1]!
    const dz = z - kerbs.points[k * 3 + 2]!
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
    room = Math.min(room, d - kerbs.half[k]! - KERB * 0.5)
  })
  return room
}

/** How much of its footprint each building keeps to stand clear of every road. */
function fits(foot: Float32Array, blocks: Blocks, kerbs: Kerbs): Float32Array {
  const fit = new Float32Array(blocks.count).fill(1)
  for (let i = 0; i < blocks.count; i++) {
    const room = roomAt(kerbs, foot[i * 3]!, foot[i * 3 + 1]!, foot[i * 3 + 2]!)
    const r = blocks.reach[i]!
    if (room < r) fit[i] = Math.max(THINNEST, room) / r
  }
  return fit
}

/** Rings out from a stranded building to look for a free plot on, in world units past its reach. */
const RINGS = [2, 5, 9, 14, 20, 28]
const SPOKES = 12

/** Plots round `at` for a building of reach `r` on a planet of `radius`, nearest ring first. */
function around(at: Vec3, r: number, radius: number): Vec3[] {
  const [east, north] = tangents(unit(at))
  const out: Vec3[] = []
  for (const ring of RINGS)
    for (let s = 0; s < SPOKES; s++) {
      const a = (s / SPOKES) * Math.PI * 2
      const d = r + ring
      const p = unit(
        add(add(at, east, Math.cos(a) * d), north, Math.sin(a) * d),
      )
      out.push([p[0] * radius, p[1] * radius, p[2] * radius])
    }
  return out
}

/**
 * Moves each building stranded in the roads, with room for less than half
 * its footprint, to the nearest free plot round it: clear of the roads and of
 * its neighbours. One with nowhere better stays, and is slimmed.
 */
function resettle(
  foot: Float32Array,
  blocks: Blocks,
  kerbs: Kerbs,
  cell: number,
  radius: number,
): void {
  const hash = new SpaceHash(cell)
  for (let i = 0; i < blocks.count; i++)
    hash.insert(i, foot[i * 3]!, foot[i * 3 + 1]!, foot[i * 3 + 2]!)
  const free = (i: number, [x, y, z]: Vec3, strict: boolean): boolean => {
    if (roomAt(kerbs, x, y, z) < blocks.reach[i]!) return false
    if (!strict) return true
    let clear = true
    hash.near(x, y, z, (j) => {
      if (j === i || !clear) return
      const d = Math.hypot(
        x - foot[j * 3]!,
        y - foot[j * 3 + 1]!,
        z - foot[j * 3 + 2]!,
      )
      if (d < blocks.reach[i]! + blocks.reach[j]! + GAP * 0.5) clear = false
    })
    return clear
  }
  for (let i = 0; i < blocks.count; i++) {
    const at: Vec3 = [foot[i * 3]!, foot[i * 3 + 1]!, foot[i * 3 + 2]!]
    const r = blocks.reach[i]!
    if (roomAt(kerbs, ...at) >= r * 0.5) continue
    // First a plot clear of roads and neighbours; failing that, one clear of
    // the roads alone: leaning on a neighbour beats standing in the traffic.
    const spots = around(at, r, radius)
    const spot =
      spots.find((p) => free(i, p, true)) ??
      spots.find((p) => free(i, p, false))
    if (!spot) continue
    foot.set(spot, i * 3)
    hash.insert(i, ...spot)
  }
}

/** Turns each building square to its nearest road, or leaves it at a whim of its own. */
function headings(
  foot: Float32Array,
  blocks: Blocks,
  kerbs: Kerbs,
): Float32Array {
  const heading = new Float32Array(blocks.count)
  for (let i = 0; i < blocks.count; i++) {
    const x = foot[i * 3]!
    const y = foot[i * 3 + 1]!
    const z = foot[i * 3 + 2]!
    let best = -1
    let nearest = blocks.reach[i]! + FACING
    kerbs.hash.near(x, y, z, (k) => {
      const d =
        Math.hypot(
          x - kerbs.points[k * 3]!,
          y - kerbs.points[k * 3 + 1]!,
          z - kerbs.points[k * 3 + 2]!,
        ) - kerbs.half[k]!
      if (d < nearest) {
        nearest = d
        best = k
      }
    })
    if (best === -1) {
      heading[i] = blocks.seed[i]! * Math.PI
      continue
    }
    const l = Math.hypot(x, y, z)
    const [east, north] = tangents([x / l, y / l, z / l] as Vec3)
    const a = [
      kerbs.along[best * 3]!,
      kerbs.along[best * 3 + 1]!,
      kerbs.along[best * 3 + 2]!,
    ]
    heading[i] = Math.atan2(
      a[0]! * north[0] + a[1]! * north[1] + a[2]! * north[2],
      a[0]! * east[0] + a[1]! * east[1] + a[2]! * east[2],
    )
  }
  return heading
}
