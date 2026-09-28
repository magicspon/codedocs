/**
 * Small vector sums on the metro's planet, on plain numbers so the layout can
 * run and be tested without three.js. A point on the planet is kept as a unit
 * direction from its centre; the scene scales it by the radius.
 */

/** A 3D vector as `[x, y, z]`. */
export type Vec3 = [number, number, number]

/** `v` scaled to length 1; the zero vector comes back as straight up. */
export function unit(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2])
  return l < 1e-12 ? [0, 1, 0] : [v[0] / l, v[1] / l, v[2] / l]
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}

/** `a + b * s`. */
export function add(a: Vec3, b: Vec3, s = 1): Vec3 {
  return [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s]
}

/** The angle between two unit directions, in radians. */
export function arc(a: Vec3, b: Vec3): number {
  return Math.acos(Math.min(1, Math.max(-1, dot(a, b))))
}

/**
 * The share of the planet's area a cap from the north pole covers, as a
 * disc radius: `0` is the pole, `1` the whole sphere. Equal-area, so ground
 * evenly filled on the disc stays evenly filled on the planet.
 */
export function fromDisc(angle: number, share: number): Vec3 {
  const cos = 1 - 2 * Math.min(1, Math.max(0, share))
  const sin = Math.sqrt(Math.max(0, 1 - cos * cos))
  return [Math.cos(angle) * sin, cos, Math.sin(angle) * sin]
}

/**
 * Two ground directions at `n`, square to it and to each other: `east` then
 * `north`. Near the poles east is taken from the x axis instead, so the pair
 * never collapses.
 */
export function tangents(n: Vec3): [Vec3, Vec3] {
  const pole: Vec3 = Math.abs(n[1]) > 0.999 ? [1, 0, 0] : [0, 1, 0]
  const east = unit(cross(pole, n))
  return [east, cross(n, east)]
}

/** Spherical interpolation between unit directions. */
export function slerp(a: Vec3, b: Vec3, t: number): Vec3 {
  const theta = arc(a, b)
  if (theta < 1e-6) return a
  const s = Math.sin(theta)
  const wa = Math.sin((1 - t) * theta) / s
  const wb = Math.sin(t * theta) / s
  return unit([
    a[0] * wa + b[0] * wb,
    a[1] * wa + b[1] * wb,
    a[2] * wa + b[2] * wb,
  ])
}
