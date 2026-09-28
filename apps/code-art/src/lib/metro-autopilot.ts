import { Vector3 } from 'three'
import type { Buggy } from './buggy.ts'
import type { Stick } from './craft.ts'
import { highwayOf, type Highway } from './metro-highway.ts'
import type { RoadIndex } from './metro-road-index.ts'
import type { Road } from './metro-roads.ts'

/**
 * Drives the buggy along the roads by itself. It makes for the nearest ring
 * road, the pink highway, turning off only where a road leads nearer to
 * one, and once on the ring it never leaves: round and round the planet. It
 * keeps to the right-hand lane and steers for a point a little way ahead,
 * slowing into bends. It only ever works the same stick the keys do.
 */

/** Where the autopilot is: which point of which road it follows, and which way. */
export interface Pilot {
  /** Index into the road index's points. */
  at: number
  dir: 1 | -1
  /** Seconds spent pushing against something without moving. */
  stuck: number
  /** Seconds left backing away from it. */
  backing: number
}

/** Seconds pushing without moving before it backs off, and how long it backs off for. */
const STUCK = 1.2
const BACK_OFF = 1.2

/** Farther than this from its road and it looks for the nearest one again. */
const LOST = 14
/** Points ahead to steer for, about twelve world units. */
const LOOK = 8
/** The cruising speed on a straight, in world units a second: about 72 km/h. */
const CRUISE = 20
/** How much nearer a ring road counts when finding a road again. */
const RING_PULL = 6

const at = new Vector3()
const next = new Vector3()
const tangent = new Vector3()
const up = new Vector3()
const side = new Vector3()
const aim = new Vector3()
const head = new Vector3()
const tail = new Vector3()

/** Sets `out` to point `k` of the index. */
function point(index: RoadIndex, k: number, out: Vector3): Vector3 {
  return out.fromArray(index.points, k * 3)
}

/** The first and last point of the road point `k` is on. */
function ends(index: RoadIndex, k: number): [number, number] {
  const r = index.road[k]!
  return [index.first[r]!, index.first[r]! + index.length[r]! - 1]
}

/** Whether the road through point `k` closes on itself, as a ring road does. */
function loops(index: RoadIndex, k: number): boolean {
  const [lo, hi] = ends(index, k)
  return point(index, lo, head).distanceTo(point(index, hi, tail)) < 1
}

/**
 * The point `n` steps on from `k` heading `dir`: round the join on a loop
 * (whose last point repeats its first), else `-1` off the road's end.
 */
function step(index: RoadIndex, k: number, dir: number, n: number): number {
  const [lo, hi] = ends(index, k)
  const to = k + dir * n
  if (to >= lo && to <= hi) return to
  if (!loops(index, k)) return -1
  const span = hi - lo
  return lo + ((((to - lo) % span) + span) % span)
}

/** Sets `out` to the unit way the road runs at point `k`, heading `dir`. */
function runAt(
  index: RoadIndex,
  k: number,
  dir: number,
  out: Vector3,
): Vector3 {
  const [lo, hi] = ends(index, k)
  const ahead = step(index, k, 1, 1)
  const behind = step(index, k, -1, 1)
  point(index, ahead === -1 ? hi : ahead, out)
  point(index, behind === -1 ? lo : behind, next)
  return out.sub(next).normalize().multiplyScalar(dir)
}

/** Which way to take road point `k` on: towards its turning, or on a ring, the way that follows `heading`. */
function wayOn(
  index: RoadIndex,
  highway: Highway,
  k: number,
  heading: Vector3,
): 1 | -1 {
  const leave = highway.leave[index.road[k]!]!
  if (leave !== -1 && leave !== k) return leave > k ? 1 : -1
  return runAt(index, k, 1, tangent).dot(heading) >= 0 ? 1 : -1
}

/** The nearest road point within `reach` of `from`, a ring road's counting nearer; `null` for none. */
function pick(
  index: RoadIndex,
  highway: Highway,
  from: Vector3,
  heading: Vector3,
): Pilot | null {
  let best = -1
  let score = Infinity
  index.hash.near(from.x, from.y, from.z, (k) => {
    const d = point(index, k, at).distanceTo(from)
    if (d > LOST) return
    const align = Math.abs(runAt(index, k, 1, tangent).dot(heading))
    const ring = highway.hops[index.road[k]!] === 0 ? RING_PULL : 0
    const s = d - 6 * align - ring
    if (s >= score) return
    score = s
    best = k
  })
  if (best === -1) return null
  return {
    at: best,
    dir: wayOn(index, highway, best, heading),
    stuck: 0,
    backing: 0,
  }
}

/**
 * Moves the pilot to the road point nearest the buggy, on along its road,
 * but no further than `stop`, the turning, so it cannot overshoot it.
 */
function advance(
  index: RoadIndex,
  pilot: Pilot,
  from: Vector3,
  stop: number,
): void {
  for (let n = 0; n < 50 && pilot.at !== stop; n++) {
    const k = step(index, pilot.at, pilot.dir, 1)
    if (k === -1) break
    if (
      point(index, k, next).distanceTo(from) >
      point(index, pilot.at, at).distanceTo(from)
    )
      break
    pilot.at = k
  }
}

/**
 * Keeps the pilot heading for the ring: at its road's turning it crosses to
 * the next road; at a dead end with no way to the ring, it turns round.
 */
function route(index: RoadIndex, highway: Highway, pilot: Pilot): Pilot {
  const r = index.road[pilot.at]!
  const leave = highway.leave[r]!
  if (leave !== -1 && Math.abs(leave - pilot.at) <= 1) {
    runAt(index, pilot.at, pilot.dir, aim)
    const land = highway.land[r]!
    return { ...pilot, at: land, dir: wayOn(index, highway, land, aim) }
  }
  if (leave !== -1) return { ...pilot, dir: leave > pilot.at ? 1 : -1 }
  if (step(index, pilot.at, pilot.dir, LOOK) === -1)
    return { ...pilot, dir: pilot.dir === 1 ? -1 : 1 }
  return pilot
}

/**
 * The stick for `dt` seconds from now, and the pilot to use next frame
 * (`null` while no road is near). Wedged against something, it backs off
 * for a moment, steering the other way, then carries on.
 */
export function autopilot(
  index: RoadIndex,
  roads: readonly Road[],
  buggy: Buggy,
  pilot: Pilot | null,
  dt: number,
): { stick: Stick; pilot: Pilot | null } {
  const { position, forward, velocity } = buggy
  const highway = highwayOf(index, roads)
  let p = pilot
  if (!p || point(index, p.at, at).distanceTo(position) > LOST)
    p = pick(index, highway, position, forward)
  if (!p)
    return {
      stick: { thrust: 0, turn: 0, climb: 0, boost: false },
      pilot: null,
    }
  advance(index, p, position, highway.leave[index.road[p.at]!]!)
  p = route(index, highway, p)

  // The point to steer for: a way down the road, over in the right-hand lane.
  const ahead = step(index, p.at, p.dir, LOOK)
  const k = ahead === -1 ? ends(index, p.at)[p.dir === 1 ? 1 : 0] : ahead
  up.copy(position).normalize()
  runAt(index, k, p.dir, tangent)
  side.crossVectors(tangent, up)
  const width = roads[index.road[k]!]!.width
  point(index, k, aim)
    .addScaledVector(side, width * 0.25)
    .sub(position)

  const right = side.crossVectors(forward, up)
  const angle = Math.atan2(aim.dot(right), aim.dot(forward))
  const speed = velocity.dot(forward)
  const want = CRUISE * (1 - Math.min(0.7, Math.abs(angle)))
  const turn = Math.max(-1, Math.min(1, angle * 2.5))
  const thrust = speed < want ? 1 : speed > want + 5 ? -1 : 0
  if (p.backing > 0) {
    p.backing -= dt
    return {
      stick: { thrust: -1, turn: -turn, climb: 0, boost: false },
      pilot: p,
    }
  }
  p.stuck = thrust > 0 && Math.abs(speed) < 1 ? p.stuck + dt : 0
  if (p.stuck > STUCK) {
    p.stuck = 0
    p.backing = BACK_OFF
  }
  return { stick: { thrust, turn, climb: 0, boost: false }, pilot: p }
}
