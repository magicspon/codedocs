import { Vector3 } from 'three'
import { steer, type Craft, type Stick } from './craft.ts'
import { easeInOut } from './flight.ts'

/**
 * The craft flying itself to a picked star: out along a smooth path to a
 * point a little above the star's system, turning to face the star as it
 * goes, and stopping there. Any flying key takes the controls back.
 */

/** One trip: where it left from, where it stops, and the star it faces. */
export interface Trip {
  readonly from: Vector3
  readonly to: Vector3
  readonly star: Vector3
  readonly seconds: number
  t: number
}

/** Radians above the star's plane the craft stops at, so it looks down on the rings. */
const ELEVATION = 0.35
/** Units per second, roughly; a trip never takes less than a camera flight, nor too long. */
const PACE = 20
const SHORTEST = 1.6
const LONGEST = 6
/** How quickly the nose comes round to the star, per second. */
const TURN = 3

/**
 * A trip from the craft to `distance` from `star`, on the side the craft
 * comes from, so it closes in rather than swinging round.
 */
export function plan(craft: Craft, star: Vector3, distance: number): Trip {
  const side = craft.position.clone().sub(star).setY(0)
  // Straight above or below the star, any side will do.
  if (side.lengthSq() < 1e-8) side.set(0, 0, 1)
  side.normalize().multiplyScalar(Math.cos(ELEVATION))
  side.y = Math.sin(ELEVATION)
  const to = star.clone().addScaledVector(side, distance)
  const length = craft.position.distanceTo(to)
  return {
    from: craft.position.clone(),
    to,
    star: star.clone(),
    seconds: Math.min(LONGEST, Math.max(SHORTEST, length / PACE)),
    t: 0,
  }
}

/** Whether the reader has a flying key down, which ends a trip. */
export function grabbed(stick: Stick): boolean {
  return stick.thrust !== 0 || stick.turn !== 0 || stick.climb !== 0
}

const toward = new Vector3()

/**
 * Moves the craft `dt` seconds along `trip`, turning its nose towards the
 * star; returns whether it has arrived. The craft is still when it stops.
 */
export function travel(craft: Craft, trip: Trip, dt: number): boolean {
  trip.t = Math.min(1, trip.t + dt / trip.seconds)
  craft.position.lerpVectors(trip.from, trip.to, easeInOut(trip.t))
  craft.velocity.set(0, 0, 0)
  toward.copy(trip.star).sub(craft.position)
  if (toward.lengthSq() > 1e-8) {
    toward.normalize()
    const yaw = Math.atan2(-toward.x, -toward.z)
    const pitch = Math.asin(Math.min(1, Math.max(-1, toward.y)))
    const k = Math.min(1, dt * TURN)
    // The short way round, so the nose never spins a full turn.
    const dy = Math.atan2(Math.sin(yaw - craft.yaw), Math.cos(yaw - craft.yaw))
    craft.yaw += dy * k
    craft.pitch += (pitch - craft.pitch) * k
    // Banks into the turn it is making, as under the keys.
    craft.turn = Math.max(-1, Math.min(1, -dy))
  }
  if (trip.t >= 1) craft.turn = 0
  return trip.t >= 1
}

/**
 * Moves the craft one frame: along `trip` while there is one and the reader
 * has not taken the controls, and by the keys otherwise, held to `limit()`.
 * Returns the trip still under way, or `null`.
 */
export function pilot(
  craft: Craft,
  trip: Trip | null,
  stick: Stick,
  dt: number,
  limit: () => number,
): Trip | null {
  const going = trip && !grabbed(stick) ? trip : null
  if (going) return travel(craft, going, dt) ? null : going
  steer(craft, stick, dt, limit())
  return null
}
