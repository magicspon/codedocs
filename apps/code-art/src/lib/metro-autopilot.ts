import { Vector3 } from 'three'
import type { Buggy } from './buggy.ts'
import type { Stick } from './craft.ts'
import type { RoadIndex } from './metro-road-index.ts'
import type { Road } from './metro-roads.ts'

/**
 * Drives the buggy along the roads by itself: a tour of the city. It picks
 * the road it is on, keeps to the right-hand lane, and steers for a point a
 * little way ahead, slowing into bends. At a crossing it sometimes turns off,
 * and at a road's end it takes whichever road carries on best, or turns
 * round. It only ever works the same stick the keys do.
 */

/** Where the autopilot is: which point of which road it follows, and which way. */
export interface Pilot {
  /** Index into the road index's points. */
  at: number
  dir: 1 | -1
  /** Points to pass before it may turn off again, so it does not dither at a junction. */
  settle: number
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
/** The cruising speed on a straight, in world units a second. */
const CRUISE = 20
/** How often it turns off at a crossing it passes. */
const TURN_OFF = 0.3
/** How close another road must pass to count as a crossing. */
const CROSSING = 3

const at = new Vector3()
const next = new Vector3()
const tangent = new Vector3()
const up = new Vector3()
const side = new Vector3()
const aim = new Vector3()

/** Sets `out` to point `k` of the index. */
function point(index: RoadIndex, k: number, out: Vector3): Vector3 {
  return out.fromArray(index.points, k * 3)
}

/** The first and last point of the road point `k` is on. */
function ends(index: RoadIndex, k: number): [number, number] {
  const r = index.road[k]!
  return [index.first[r]!, index.first[r]! + index.length[r]! - 1]
}

/** Sets `out` to the unit way the road runs at point `k`, heading `dir`. */
function runAt(
  index: RoadIndex,
  k: number,
  dir: number,
  out: Vector3,
): Vector3 {
  const [lo, hi] = ends(index, k)
  point(index, Math.min(hi, k + 1), out)
  point(index, Math.max(lo, k - 1), next)
  return out.sub(next).normalize().multiplyScalar(dir)
}

/**
 * The best road point within `reach` of `from` running along `heading`,
 * skipping road `not`; `null` for none. With `random`, any near one will do,
 * taken the way that best follows `heading`, so the tour wanders.
 */
function pick(
  index: RoadIndex,
  from: Vector3,
  heading: Vector3,
  reach: number,
  not: number,
  random: (() => number) | null,
): Pilot | null {
  let best: Pilot | null = null
  let score = Infinity
  index.hash.near(from.x, from.y, from.z, (k) => {
    if (index.road[k] === not) return
    const d = point(index, k, at).distanceTo(from)
    if (d > reach) return
    const align = runAt(index, k, 1, tangent).dot(heading)
    const s = random ? random() : d - 6 * Math.abs(align)
    if (s >= score) return
    score = s
    // A road met square could be taken either way; a coin decides.
    const way = random && Math.abs(align) < 0.2 ? random() - 0.5 : align
    best = { at: k, dir: way >= 0 ? 1 : -1, settle: 20, stuck: 0, backing: 0 }
  })
  return best
}

/** Moves the pilot to the road point nearest the buggy, on along its road. */
function advance(index: RoadIndex, pilot: Pilot, from: Vector3): boolean {
  const [lo, hi] = ends(index, pilot.at)
  let moved = false
  for (let n = 0; n < 50; n++) {
    const k = pilot.at + pilot.dir
    if (k < lo || k > hi) break
    if (
      point(index, k, next).distanceTo(from) >
      point(index, pilot.at, at).distanceTo(from)
    )
      break
    pilot.at = k
    pilot.settle = Math.max(0, pilot.settle - 1)
    moved = true
  }
  return moved
}

/** At a crossing, now and then, turns off down the other road. */
function turnOff(index: RoadIndex, pilot: Pilot, random: () => number): Pilot {
  if (pilot.settle > 0 || random() > TURN_OFF) return pilot
  point(index, pilot.at, at)
  runAt(index, pilot.at, pilot.dir, aim)
  const other = pick(
    index,
    at.clone(),
    aim.clone(),
    CROSSING,
    index.road[pilot.at]!,
    random,
  )
  return other ?? pilot
}

/** Near a road's end, the road that carries on best from the end, or back the way it came. */
function carryOn(index: RoadIndex, pilot: Pilot, random: () => number): Pilot {
  const [lo, hi] = ends(index, pilot.at)
  const end = pilot.dir === 1 ? hi : lo
  point(index, end, at)
  runAt(index, end, pilot.dir, aim)
  const other = pick(
    index,
    at.clone(),
    aim.clone(),
    10,
    index.road[end]!,
    random,
  )
  return other ?? { ...pilot, dir: pilot.dir === 1 ? -1 : 1, settle: 20 }
}

/**
 * The stick for `dt` seconds from now, and the pilot to use next frame
 * (`null` while no road is near). `random` decides the turnings, so a seeded
 * one makes the tour repeatable. Wedged against something, it backs off for
 * a moment, steering the other way, then carries on.
 */
export function autopilot(
  index: RoadIndex,
  roads: readonly Road[],
  buggy: Buggy,
  pilot: Pilot | null,
  random: () => number,
  dt: number,
): { stick: Stick; pilot: Pilot | null } {
  const { position, forward, velocity } = buggy
  let p = pilot
  if (!p || point(index, p.at, at).distanceTo(position) > LOST)
    p = pick(index, position, forward, LOST, -1, null)
  if (!p)
    return {
      stick: { thrust: 0, turn: 0, climb: 0, boost: false },
      pilot: null,
    }
  if (advance(index, p, position)) p = turnOff(index, p, random)
  const [lo, hi] = ends(index, p.at)
  if (p.at + p.dir * LOOK > hi || p.at + p.dir * LOOK < lo)
    p = carryOn(index, p, random)

  // The point to steer for: a way down the road, over in the right-hand lane.
  const [first, last] = ends(index, p.at)
  const k = Math.min(last, Math.max(first, p.at + p.dir * LOOK))
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
