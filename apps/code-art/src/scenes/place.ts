import { Vector3 } from 'three'
import type { Planet, Ring } from '../lib/orbits.ts'

const X = new Vector3(1, 0, 0)
const Y = new Vector3(0, 1, 0)

/** Where planet `p` sits on `ring`, before the ring turns. */
export function placeOf(ring: Ring, p: Planet): [number, number, number] {
  const r = ring.radius + p.drift
  return [Math.cos(p.phase) * r, p.lift, Math.sin(p.phase) * r]
}

/**
 * Where planet `p` is at `time`, in the frame its ring is drawn in, written
 * to `out`. The same chain `Orbit` nests: spin, then tilt, then the ring's
 * bearing. Rings turn by the clock, so this matches what is on screen.
 */
export function bodyAt(
  ring: Ring,
  p: Planet,
  time: number,
  out: Vector3,
): Vector3 {
  return out
    .set(...placeOf(ring, p))
    .applyAxisAngle(Y, -ring.speed * time)
    .applyAxisAngle(X, ring.tilt)
    .applyAxisAngle(Y, ring.node)
}
