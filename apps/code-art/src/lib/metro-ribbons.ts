import type { Rgb } from './terrain-field.ts'
import { RoadKind, type Road } from './metro-roads.ts'

/**
 * The roads as one strip of triangles, laid a hair above the ground. Each
 * vertex carries where it is along and across its road, so the shader can
 * paint kerbs, lane markings and traffic without any textures.
 */
export interface Ribbons {
  readonly positions: Float32Array
  /** `[along, across]` per vertex: world units from the road's start, and `-1` to `1` kerb to kerb. */
  readonly uvs: Float32Array
  /** `[width, up, down, seed]` per vertex: see `Road`. */
  readonly info: Float32Array
  /**
   * `[length, towards, away]` per vertex: the road's length, and how hard
   * traffic queues at the junction each lane drives towards (see `jamsOf`).
   */
  readonly jams: Float32Array
  readonly tints: Float32Array
  readonly index: Uint32Array
}

/**
 * How high each sort of road rides above the ground: wider roads on top, so
 * a street meeting an avenue runs under it rather than flickering through.
 */
const LIFT: Record<RoadKind, number> = {
  [RoadKind.ring]: 0.09,
  [RoadKind.avenue]: 0.06,
  [RoadKind.street]: 0.035,
}

/** How far a lane's calls queue at a junction, for a lane `0`–`1` busy: only busy lanes jam. */
const JAM = 4

/**
 * How hard each lane of `road` queues where it meets a junction: the lane
 * to the root at the road's start, the lane away at its end. A busy lane
 * queues, a quiet one flows. A ring road has no ends to queue at; a
 * street's far end is a dead end, not a junction.
 */
export function jamsOf(road: Road): [towards: number, away: number] {
  if (road.kind === RoadKind.ring) return [0, 0]
  const towards = JAM * road.up * road.up
  return [
    towards,
    road.kind === RoadKind.street ? 0 : JAM * road.down * road.down,
  ]
}

/** A road's length in world units, from its unit points on a planet of `radius`. */
function lengthOf(p: Float32Array, radius: number): number {
  let total = 0
  for (let s = 3; s < p.length; s += 3)
    total +=
      Math.hypot(
        p[s]! - p[s - 3]!,
        p[s + 1]! - p[s - 2]!,
        p[s + 2]! - p[s - 1]!,
      ) * radius
  return total
}

/** Lays every road out as a strip, tinted by `tintOf` the road's angle round the pole. */
export function ribbonsOf(
  roads: readonly Road[],
  radius: number,
  tintOf: (angle: number) => Rgb,
): Ribbons {
  let points = 0
  for (const road of roads) points += road.points.length / 3
  const positions = new Float32Array(points * 6)
  const uvs = new Float32Array(points * 4)
  const info = new Float32Array(points * 8)
  const jams = new Float32Array(points * 6)
  const tints = new Float32Array(points * 6)
  const index: number[] = []
  let v = 0
  roads.forEach((road, r) => {
    const p = road.points
    const n = p.length / 3
    // Roads of a sort still overlap one another; a sliver more lift each keeps them apart.
    const lifted = radius + LIFT[road.kind] + (r % 5) * 0.004
    const tint =
      road.kind === RoadKind.ring
        ? ([1, 0.25, 0.75] as Rgb)
        : tintOf(road.angle)
    const span = lengthOf(p, radius)
    const [towards, away] = jamsOf(road)
    let along = 0
    for (let s = 0; s < n; s++) {
      const a = Math.max(0, s - 1) * 3
      const b = Math.min(n - 1, s + 1) * 3
      const px = p[s * 3]!
      const py = p[s * 3 + 1]!
      const pz = p[s * 3 + 2]!
      // Across the road: square to the ground and to the way it runs.
      const tx = p[b]! - p[a]!
      const ty = p[b + 1]! - p[a + 1]!
      const tz = p[b + 2]! - p[a + 2]!
      let sx = py * tz - pz * ty
      let sy = pz * tx - px * tz
      let sz = px * ty - py * tx
      const sl = Math.hypot(sx, sy, sz) || 1
      const half = road.width / 2 / radius
      sx = (sx / sl) * half
      sy = (sy / sl) * half
      sz = (sz / sl) * half
      if (s > 0) {
        const q = (s - 1) * 3
        along += Math.hypot(px - p[q]!, py - p[q + 1]!, pz - p[q + 2]!) * radius
      }
      for (const side of [-1, 1]) {
        const x = px + sx * side
        const y = py + sy * side
        const z = pz + sz * side
        const l = Math.hypot(x, y, z) / lifted
        positions.set([x / l, y / l, z / l], v * 3)
        uvs.set([along, side], v * 2)
        info.set([road.width, road.up, road.down, (r * 0.618034) % 1], v * 4)
        jams.set([span, towards, away], v * 3)
        tints.set(tint, v * 3)
        v++
      }
      if (s > 0) {
        const k = v - 4
        index.push(k, k + 2, k + 1, k + 1, k + 2, k + 3)
      }
    }
  })
  return { positions, uvs, info, jams, tints, index: new Uint32Array(index) }
}
