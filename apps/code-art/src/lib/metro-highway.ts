import { Vector3 } from 'three'
import type { RoadIndex } from './metro-road-index.ts'
import { RoadKind, type Road } from './metro-roads.ts'

/**
 * The way from any road to the nearest ring road, the pink highway, counted
 * in turnings. The autopilot follows it: down each road to the point where
 * it meets a road one turning nearer, across, and on until it is on a ring.
 */
export interface Highway {
  /** Per road, turnings to a ring road: `0` on one, `-1` when none leads there. */
  readonly hops: Int32Array
  /** Per road, the point on it to turn off at; `-1` on a ring or a dead end. */
  readonly leave: Int32Array
  /** Per road, the point on the next road that turning lands on. */
  readonly land: Int32Array
}

/** How close two roads' middles must pass to count as joined. */
const JOIN = 3
/** A road's end reaches further, since it stops short of the road it meets. */
const END_JOIN = 10

const a = new Vector3()
const b = new Vector3()
const cache = new WeakMap<RoadIndex, Highway>()

/** Where two roads join: the point on each, and how far apart they are. */
interface Join {
  k: number
  j: number
  d: number
}

/**
 * The closest join between each pair of roads that meet, keyed by the lower
 * road then the higher. Every point asks its hash cells; a road's two ends
 * reach further than the rest.
 */
function joinsOf(index: RoadIndex): Map<number, Map<number, Join>> {
  const joins = new Map<number, Map<number, Join>>()
  const count = index.road.length
  for (let k = 0; k < count; k++) {
    const r = index.road[k]!
    const end =
      k === index.first[r] || k === index.first[r]! + index.length[r]! - 1
    const reach = end ? END_JOIN : JOIN
    a.fromArray(index.points, k * 3)
    index.hash.near(a.x, a.y, a.z, (j) => {
      const s = index.road[j]!
      if (s <= r) return
      const d = b.fromArray(index.points, j * 3).distanceTo(a)
      if (d > reach) return
      let row = joins.get(r)
      if (!row) joins.set(r, (row = new Map()))
      const was = row.get(s)
      if (!was || d < was.d) row.set(s, { k, j, d })
    })
  }
  return joins
}

/** The highway for `roads`, worked out once per road index. */
export function highwayOf(index: RoadIndex, roads: readonly Road[]): Highway {
  const known = cache.get(index)
  if (known) return known
  const n = roads.length
  const hops = new Int32Array(n).fill(-1)
  const leave = new Int32Array(n).fill(-1)
  const land = new Int32Array(n).fill(-1)
  // Each join both ways round: road, the road it meets, and where on each.
  const next: { s: number; k: number; j: number }[][] = roads.map(() => [])
  for (const [r, row] of joinsOf(index))
    for (const [s, { k, j }] of row) {
      next[r]!.push({ s, k, j })
      next[s]!.push({ s: r, k: j, j: k })
    }
  // Out from the rings a turning at a time, so each road learns its nearest.
  const queue: number[] = []
  roads.forEach((road, r) => {
    if (road.kind !== RoadKind.ring) return
    hops[r] = 0
    queue.push(r)
  })
  for (let q = 0; q < queue.length; q++) {
    const s = queue[q]!
    for (const { s: r, k, j } of next[s]!) {
      if (hops[r] !== -1) continue
      hops[r] = hops[s]! + 1
      // `k` is on `s` and `j` on `r`: leave `r` at `j`, landing on `s` at `k`.
      leave[r] = j
      land[r] = k
      queue.push(r)
    }
  }
  const out = { hops, leave, land }
  cache.set(index, out)
  return out
}
