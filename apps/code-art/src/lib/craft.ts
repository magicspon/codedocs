import { Vector3 } from 'three'

/**
 * The arithmetic of the little spacecraft the camera rides on: how it turns,
 * how fast it may go, and which stars are close enough to show their
 * planets. Kept apart from the scene so it can be tested without a canvas.
 */

/** Where the craft is, how it moves, and which way it points. */
export interface Craft {
  readonly position: Vector3
  readonly velocity: Vector3
  /** Radians round the galaxy's up axis. */
  yaw: number
  /** Radians above the galaxy's plane; held short of straight up or down. */
  pitch: number
  /** How fast it is turning, eased, so the hull can bank into a turn. */
  turn: number
}

/** The keys held down, each `-1`, `0` or `1`. */
export interface Stick {
  /** Forward (W) or back (S). */
  readonly thrust: number
  /** Left (A) or right (D). */
  readonly turn: number
  /** Nose up (E) or down (Q). */
  readonly climb: number
  /** Shift: the limit is raised. */
  readonly boost: boolean
}

/** No keys held. */
export const IDLE: Stick = { thrust: 0, turn: 0, climb: 0, boost: false }

/** Radians per second at full lock. */
const TURN_RATE = 1.4
const CLIMB_RATE = 1
/** Short of straight up, where yaw would spin the view round the nose. */
const MAX_PITCH = 1.35
/** How much of its speed the craft keeps each second with no thrust. */
const DRAG = 1.6
const BOOST = 3

/** A craft at `position`, pointing along `direction`, standing still. */
export function launch(position: Vector3, direction: Vector3): Craft {
  const d = direction.clone().normalize()
  return {
    position: position.clone(),
    velocity: new Vector3(),
    yaw: Math.atan2(-d.x, -d.z),
    pitch: clamp(Math.asin(clamp(d.y, 1)), MAX_PITCH),
    turn: 0,
  }
}

/** The way the craft's nose points, written to `out`. */
export function heading(craft: Craft, out: Vector3): Vector3 {
  const c = Math.cos(craft.pitch)
  return out.set(
    -Math.sin(craft.yaw) * c,
    Math.sin(craft.pitch),
    -Math.cos(craft.yaw) * c,
  )
}

/**
 * The top speed near a star `distance` away: slow among the planets, quick
 * in open space, so the same keys both cross the galaxy and land.
 */
export function speedLimit(distance: number): number {
  return Math.min(24, Math.max(0.6, distance * 0.9))
}

const nose = new Vector3()

/**
 * Moves the craft `dt` seconds on. Thrust pushes along the nose; with no
 * thrust it coasts to a stop. Its speed is held to `limit`, times three
 * under boost.
 */
export function steer(
  craft: Craft,
  stick: Stick,
  dt: number,
  limit: number,
): void {
  craft.turn += (stick.turn - craft.turn) * Math.min(1, dt * 6)
  craft.yaw -= craft.turn * TURN_RATE * dt
  craft.pitch = clamp(craft.pitch + stick.climb * CLIMB_RATE * dt, MAX_PITCH)
  const top = limit * (stick.boost ? BOOST : 1)
  // Reaches top speed in about half a second.
  craft.velocity.addScaledVector(
    heading(craft, nose),
    stick.thrust * top * 2 * dt,
  )
  if (stick.thrust === 0) craft.velocity.multiplyScalar(Math.exp(-DRAG * dt))
  if (craft.velocity.length() > top) craft.velocity.setLength(top)
  craft.position.addScaledVector(craft.velocity, dt)
}

/**
 * The files whose stars are close enough to `at` to show their planets,
 * nearest first, at most `count`. A star shows within `ranges[i]` of it; one
 * already in `shown` keeps its planets a little further out, so a craft
 * idling at the edge does not make them flicker. It also holds its place
 * until a newcomer is clearly nearer, or with wide ranges the nearest few
 * would change hands with every move and never settle long enough to fade in.
 * Only files `keep` passes are considered.
 */
/** A shown star ranks as if this much nearer than it is. */
const HOLD = 0.7

export function nearby(
  anchors: readonly (readonly [number, number, number])[],
  ranges: readonly number[],
  at: Vector3,
  count: number,
  shown: readonly number[],
  keep: (file: number) => boolean = () => true,
): number[] {
  const found: { file: number; d: number }[] = []
  // A set, as every file in the galaxy is checked against it.
  const held = new Set(shown)
  anchors.forEach(([x, y, z], file) => {
    if (!keep(file)) return
    const d = Math.sqrt((x - at.x) ** 2 + (y - at.y) ** 2 + (z - at.z) ** 2)
    const was = held.has(file)
    const range = ranges[file]! * (was ? 1.15 : 1)
    if (d < range) found.push({ file, d: was ? d * HOLD : d })
  })
  return found
    .sort((a, b) => a.d - b.d)
    .slice(0, count)
    .map((f) => f.file)
}

/**
 * Puts the new set of nearby files into `slots`, leaving each one already
 * shown where it was, so its system is not rebuilt. `null` for the same slots.
 */
export function reslot<T>(
  slots: readonly (T | null)[],
  near: readonly T[],
): (T | null)[] | null {
  const next: (T | null)[] = slots.map((f) =>
    f !== null && near.includes(f) ? f : null,
  )
  for (const f of near) if (!next.includes(f)) next[next.indexOf(null)] = f
  return next.every((f, i) => f === slots[i]) ? null : next
}

/** How far into its range `range` a star `d` away is: `0` at the edge to `1` halfway in. */
export function nearness(d: number, range: number): number {
  const t = Math.min(1, Math.max(0, (range - d) / (range * 0.5)))
  return t * t * (3 - 2 * t)
}

/** Seconds a system takes to fade in when it takes a slot. */
const FADE_IN = 1.2
/** Seconds to fade out when it gives one up: quicker, so crossing systems do not crowd. */
const FADE_OUT = 0.4

/**
 * How far a system has faded in, `dt` seconds after it was at `shown`,
 * heading in while `showing` and out otherwise.
 */
export function faded(shown: number, showing: boolean, dt: number): number {
  return showing
    ? Math.min(1, shown + dt / FADE_IN)
    : Math.max(0, shown - dt / FADE_OUT)
}

/**
 * Whether a leaving system is done: faded out, or already out of sight, in
 * which case it need not wait out its fade.
 */
export function spent(leaving: boolean, shown: number, grow: number): boolean {
  return leaving && (shown === 0 || grow === 0)
}

/** The distance from `at` to the nearest of `anchors`. */
export function nearest(
  anchors: readonly (readonly [number, number, number])[],
  at: Vector3,
): number {
  // Compared squared, with one root at the end: this runs every frame.
  let best = Infinity
  for (const [x, y, z] of anchors) {
    const d = (x - at.x) ** 2 + (y - at.y) ** 2 + (z - at.z) ** 2
    if (d < best) best = d
  }
  return Math.sqrt(best)
}

/** `v`, held within `limit` either side of zero. */
function clamp(v: number, limit: number): number {
  return Math.min(limit, Math.max(-limit, v))
}
