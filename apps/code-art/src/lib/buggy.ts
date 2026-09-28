import { Vector3 } from 'three'
import type { Stick } from './craft.ts'

/**
 * The little buggy that drives the metro, as plain arithmetic so it can be
 * tested without a canvas. It rolls on the planet's surface: every step it
 * moves along the ground, then is set back down on the sphere and its
 * heading laid flat again, so "forward" bends round the planet with it.
 *
 * It grips hard at low speed and lets the back step out under boost, so it
 * can be slid round a corner. Buildings are boxes it bounces off.
 */

/** Where the buggy is and how it moves. Mutated in place every frame. */
export interface Buggy {
  /** On the planet's surface, in world units. */
  readonly position: Vector3
  /** Unit, along the ground: the way the nose points. */
  readonly forward: Vector3
  /** Along the ground, in world units per second. */
  readonly velocity: Vector3
  /** The wheels' angle, `-1` full left to `1` full right, eased towards the stick. */
  steer: number
  /** How hard it last hit something, in world units per second; `0` when clear. */
  bump: number
}

/** A building's footprint: its middle on the ground, its two ground axes, and half its width and depth. */
export interface Box {
  readonly middle: Vector3
  readonly x: Vector3
  readonly z: Vector3
  readonly halfX: number
  readonly halfZ: number
}

/** Calls `visit` with every box that might touch a buggy at `at`. */
export type Obstacles = (at: Vector3, visit: (box: Box) => void) => void

/** Top speed, in world units (about metres) per second. */
export const TOP_SPEED = 26
/** Top speed under boost. */
const BOOST_SPEED = 46
const ACCEL = 16
const BOOST_ACCEL = 26
const BRAKE = 38
const REVERSE_SPEED = 8
/** Radians per second at full lock and speed. */
const TURN_RATE = 2.1
/** How fast the buggy slows with nothing pressed, per second. */
const ROLL = 0.8
/** How fast sideways slip is lost, per second: high is grippy. */
const GRIP = 9
const DRIFT_GRIP = 2.2
/** The buggy's own reach from its middle, for bumping into buildings. */
export const BUGGY_REACH = 1.1
/** How much speed into a wall comes back out of it. */
const BOUNCE = 0.3

/** A buggy standing at `at` on a planet of `radius`, nose towards `facing`. */
export function park(at: Vector3, facing: Vector3, radius: number): Buggy {
  const position = at.clone().setLength(radius)
  const up = position.clone().normalize()
  const forward = facing
    .clone()
    .addScaledVector(up, -facing.dot(up))
    .normalize()
  return { position, forward, velocity: new Vector3(), steer: 0, bump: 0 }
}

const up = new Vector3()
const right = new Vector3()
const push = new Vector3()

/** Pushes the buggy out of `box` if it has driven into it. */
function bounce(buggy: Buggy, box: Box): void {
  push.subVectors(buggy.position, box.middle)
  const lx = push.dot(box.x)
  const lz = push.dot(box.z)
  const cx = Math.min(box.halfX, Math.max(-box.halfX, lx))
  const cz = Math.min(box.halfZ, Math.max(-box.halfZ, lz))
  let dx = lx - cx
  let dz = lz - cz
  let dist = Math.hypot(dx, dz)
  if (dist >= BUGGY_REACH) return
  if (dist < 1e-6) {
    // Inside: out through the nearest side.
    const outX = box.halfX - Math.abs(lx)
    const outZ = box.halfZ - Math.abs(lz)
    if (outX < outZ) dx = Math.sign(lx) || 1
    else dz = Math.sign(lz) || 1
    dist = -(outX < outZ ? outX : outZ)
    const l = Math.hypot(dx, dz)
    dx /= l
    dz /= l
  } else {
    dx /= dist
    dz /= dist
  }
  push.copy(box.x).multiplyScalar(dx).addScaledVector(box.z, dz)
  buggy.position.addScaledVector(push, BUGGY_REACH - dist)
  const into = buggy.velocity.dot(push)
  if (into < 0) {
    buggy.velocity.addScaledVector(push, -into * (1 + BOUNCE))
    buggy.bump = Math.max(buggy.bump, -into)
  }
}

/** Push along the nose: forward, braking, or reversing once stopped. */
function accelOf(stick: Stick, speed: number): number {
  const top = stick.boost ? BOOST_SPEED : TOP_SPEED
  if (stick.thrust > 0)
    return speed < top ? (stick.boost ? BOOST_ACCEL : ACCEL) : 0
  if (stick.thrust === 0) return 0
  if (speed > 0.5) return -BRAKE
  return speed > -REVERSE_SPEED ? -ACCEL * 0.6 : 0
}

/** Speeds up, grips and slows the buggy for `dt` seconds under `stick`. */
function throttle(buggy: Buggy, stick: Stick, dt: number): void {
  const { forward, velocity } = buggy
  velocity.addScaledVector(forward, accelOf(stick, velocity.dot(forward)) * dt)
  // Sideways slip bleeds away; under boost, slowly enough to slide.
  const grip = stick.boost ? DRIFT_GRIP : GRIP
  velocity.addScaledVector(right, -velocity.dot(right) * Math.min(1, dt * grip))
  // Coasting slows; over the limit, as after a boost, slows harder.
  const over = velocity.length() > (stick.boost ? BOOST_SPEED : TOP_SPEED) + 0.5
  if (stick.thrust === 0 || over)
    velocity.multiplyScalar(Math.exp(-dt * (over ? 1.2 : ROLL)))
}

/** Lays the nose and the velocity flat on the ground at the buggy's new place, keeping its speed. */
function settle(buggy: Buggy): void {
  const { position, forward, velocity } = buggy
  up.copy(position).normalize()
  forward.addScaledVector(up, -forward.dot(up)).normalize()
  const v = velocity.length()
  velocity.addScaledVector(up, -velocity.dot(up))
  if (v > 1e-6 && velocity.lengthSq() > 1e-12) velocity.setLength(v)
}

/** Moves `buggy` on by `dt` seconds under `stick`, on a planet of `radius`. */
export function drive(
  buggy: Buggy,
  stick: Stick,
  dt: number,
  radius: number,
  obstacles: Obstacles,
): void {
  const { position, forward, velocity } = buggy
  up.copy(position).normalize()
  right.crossVectors(forward, up)
  buggy.steer += (stick.turn - buggy.steer) * Math.min(1, dt * 7)
  const speed = velocity.dot(forward)
  throttle(buggy, stick, dt)

  // No turning on the spot; reversing turns the other way, as a car does.
  const roll = Math.min(1, Math.abs(speed) / 5) * Math.sign(speed)
  const calm = 1 - 0.4 * Math.min(1, Math.abs(speed) / BOOST_SPEED)
  forward.applyAxisAngle(up, -buggy.steer * TURN_RATE * roll * calm * dt)

  position.addScaledVector(velocity, dt).setLength(radius)
  buggy.bump = 0
  obstacles(position, (box) => bounce(buggy, box))
  position.setLength(radius)
  settle(buggy)
}
