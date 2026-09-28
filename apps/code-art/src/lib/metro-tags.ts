import type { Vector3 } from 'three'
import type { MetroLayout } from './metro-layout.ts'
import { RoadKind } from './metro-roads.ts'

/**
 * Which roads' traffic to name: the few nearest the buggy that carry calls.
 * Naming every car on the planet would bury the city in labels.
 */

/** How many roads round the buggy get named traffic. */
const ROADS = 2
/** How far from the buggy a road can be and still be named; no more than the road index's cell. */
const REACH = 20

/** The roads nearest `at` with calls to name, nearest first. */
export function taggedRoads(layout: MetroLayout, at: Vector3): number[] {
  const { points, road, hash } = layout.roadIndex
  const nearest = new Map<number, number>()
  hash.near(at.x, at.y, at.z, (k) => {
    const r = road[k]!
    if (layout.roads[r]!.kind === RoadKind.ring) return
    if (layout.roadCalls[r]!.length === 0) return
    const d = Math.hypot(
      points[k * 3]! - at.x,
      points[k * 3 + 1]! - at.y,
      points[k * 3 + 2]! - at.z,
    )
    if (d > REACH) return
    if (d < (nearest.get(r) ?? Infinity)) nearest.set(r, d)
  })
  return [...nearest]
    .sort((a, b) => a[1] - b[1])
    .slice(0, ROADS)
    .map(([r]) => r)
}

/** How many sky lanes get named, and how far off their highest point may be. */
const LANES = 3
const LANE_REACH = 160

/** Whether the planet of `radius` stands between `from` and `to`. */
export function hidden(from: Vector3, to: Vector3, radius: number): boolean {
  // The point on the line between them nearest the planet's centre.
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dz = to.z - from.z
  const t = Math.min(
    1,
    Math.max(
      0,
      -(from.x * dx + from.y * dy + from.z * dz) /
        (dx * dx + dy * dy + dz * dz || 1),
    ),
  )
  return (
    Math.hypot(from.x + dx * t, from.y + dy * t, from.z + dz * t) < radius - 0.5
  )
}

/** The sky lanes whose highest point is nearest `eye` and in plain view, nearest first. */
export function taggedLanes(layout: MetroLayout, eye: Vector3): number[] {
  const { apex } = layout.lanes
  const found: [number, number][] = []
  const top = eye.clone()
  for (let l = 0; l * 3 < apex.length; l++) {
    top.fromArray(apex, l * 3)
    const d = top.distanceTo(eye)
    if (d > LANE_REACH || hidden(eye, top, layout.radius)) continue
    found.push([l, d])
  }
  return found
    .sort((a, b) => a[1] - b[1])
    .slice(0, LANES)
    .map(([l]) => l)
}
