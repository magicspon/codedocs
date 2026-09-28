import type { Placement } from './metro-relax.ts'
import { cross, tangents, type Vec3 } from './metro-sphere.ts'

/**
 * Each building's own axes where it stands: `x` along its width, square to
 * the road it faces; `y` straight up out of the planet; `z` along its depth.
 * The drawing builds its matrices from these, and the buggy bumps into the
 * same boxes, so what you see is what you hit.
 */
export interface Frames {
  /** Unit `[x, y, z]` per building. */
  readonly x: Float32Array
  readonly y: Float32Array
  readonly z: Float32Array
}

/** Axes for every placed building. */
export function framesOf(place: Placement): Frames {
  const n = place.heading.length
  const frames = {
    x: new Float32Array(n * 3),
    y: new Float32Array(n * 3),
    z: new Float32Array(n * 3),
  }
  for (let i = 0; i < n; i++) {
    const f = place.foot
    const l = Math.hypot(f[i * 3]!, f[i * 3 + 1]!, f[i * 3 + 2]!)
    const up: Vec3 = [f[i * 3]! / l, f[i * 3 + 1]! / l, f[i * 3 + 2]! / l]
    const [east, north] = tangents(up)
    const c = Math.cos(place.heading[i]!)
    const s = Math.sin(place.heading[i]!)
    const x: Vec3 = [
      east[0] * c + north[0] * s,
      east[1] * c + north[1] * s,
      east[2] * c + north[2] * s,
    ]
    frames.x.set(x, i * 3)
    frames.y.set(up, i * 3)
    // Right-handed: x across, y up, z = x × y.
    frames.z.set(cross(x, up), i * 3)
  }
  return frames
}
