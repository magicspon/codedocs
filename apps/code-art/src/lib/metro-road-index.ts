import { SpaceHash } from './metro-hash.ts'
import type { Road } from './metro-roads.ts'

/**
 * Every road's middle line as world points, with which road each belongs to,
 * hashed for "which roads are near here?". The autopilot steers by it and the
 * minimap draws from it.
 */
export interface RoadIndex {
  /** World `[x, y, z]` per point, road after road. */
  readonly points: Float32Array
  /** Per point, the index of its road in the layout's `roads`. */
  readonly road: Int32Array
  /** Per road, the index of its first point in `points`. */
  readonly first: Int32Array
  /** Per road, how many points it has. */
  readonly length: Int32Array
  readonly hash: SpaceHash
  /** The hash's cell: a query finds every point within this of it. */
  readonly cell: number
}

/** Indexes `roads` on a planet of `radius`, hashed in cells of `cell` world units. */
export function roadIndexOf(
  roads: readonly Road[],
  radius: number,
  cell: number,
): RoadIndex {
  let total = 0
  for (const road of roads) total += road.points.length / 3
  const points = new Float32Array(total * 3)
  const owner = new Int32Array(total)
  const first = new Int32Array(roads.length)
  const length = new Int32Array(roads.length)
  const hash = new SpaceHash(cell)
  let k = 0
  roads.forEach((road, r) => {
    first[r] = k
    length[r] = road.points.length / 3
    for (let s = 0; s < length[r]!; s++, k++) {
      const x = road.points[s * 3]! * radius
      const y = road.points[s * 3 + 1]! * radius
      const z = road.points[s * 3 + 2]! * radius
      points.set([x, y, z], k * 3)
      owner[k] = r
      hash.insert(k, x, y, z)
    }
  })
  return { points, road: owner, first, length, hash, cell }
}
