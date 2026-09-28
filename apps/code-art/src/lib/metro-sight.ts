import type { Vector3 } from 'three'
import type { MetroLayout } from './metro-layout.ts'

/** How far ahead a building can be and still be named. */
const RANGE = 60
/** Points along the line of sight where the hash is asked what is near. */
const PROBES = [4, 14, 26, 40, 54]

/**
 * The building the driver is looking at: the nearest one close to the line
 * of sight, within `RANGE` ahead, or `null`. Buildings to the side of the
 * line count as further away the further off it they stand, so the one
 * straight ahead wins over a nearer one at the edge of view.
 */
export function lookingAt(
  layout: MetroLayout,
  at: Vector3,
  sight: Vector3,
  up: Vector3,
): number | null {
  const { near, place, blocks } = layout
  // Sight laid flat on the ground; a look straight up names nothing.
  const fx = sight.x - up.x * sight.dot(up)
  const fy = sight.y - up.y * sight.dot(up)
  const fz = sight.z - up.z * sight.dot(up)
  const fl = Math.hypot(fx, fy, fz)
  if (fl < 0.2) return null
  let best: number | null = null
  let score = Infinity
  for (const d of PROBES) {
    const px = at.x + (fx / fl) * d
    const py = at.y + (fy / fl) * d
    const pz = at.z + (fz / fl) * d
    near.near(px, py, pz, (i) => {
      const rx = place.foot[i * 3]! - at.x
      const ry = place.foot[i * 3 + 1]! - at.y
      const rz = place.foot[i * 3 + 2]! - at.z
      const ahead = (rx * fx + ry * fy + rz * fz) / fl
      if (ahead <= 0 || ahead > RANGE) return
      const off =
        Math.sqrt(Math.max(0, rx * rx + ry * ry + rz * rz - ahead * ahead)) -
        blocks.reach[i]!
      if (off > 3) return
      const s = ahead + Math.max(0, off) * 8
      if (s < score) {
        score = s
        best = i
      }
    })
  }
  return best
}
