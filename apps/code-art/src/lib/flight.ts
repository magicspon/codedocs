import { Vector3 } from 'three'

/**
 * The arithmetic of a camera flight: where to stand to look at something, and
 * where the camera is part way there. Kept apart from the hook that drives it
 * so the path can be tested without a canvas.
 */

/** Where the camera stands and what it looks at. */
export interface Shot {
  readonly target: Vector3
  readonly position: Vector3
}

/** Slow out, fast through the middle, slow in: a camera that glides rather than lurches. */
export function easeInOut(t: number): number {
  const c = Math.min(1, Math.max(0, t))
  return c < 0.5 ? 4 * c * c * c : 1 - (-2 * c + 2) ** 3 / 2
}

/**
 * A shot of `target` from `distance` away, raised `elevation` radians above
 * the horizon. It keeps the compass bearing the camera already has, so the
 * view closes in on the thing rather than swinging round to a fixed side.
 */
export function approach(
  from: Shot,
  target: Vector3,
  distance: number,
  elevation: number,
): Shot {
  const bearing = from.position.clone().sub(from.target).setY(0)
  // Looking straight down there is no bearing to keep; any side will do.
  if (bearing.lengthSq() < 1e-8) bearing.set(0, 0, 1)
  bearing.normalize().multiplyScalar(Math.cos(elevation))
  bearing.y = Math.sin(elevation)
  return {
    target: target.clone(),
    position: target.clone().add(bearing.multiplyScalar(distance)),
  }
}

/**
 * The camera `t` of the way from `a` to `b`, eased. `lift` bows the path
 * upward by that share of the distance travelled, so a flight over a city
 * climbs above the towers instead of cutting through them.
 */
export function along(
  a: Shot,
  b: Shot,
  t: number,
  lift: number,
  out: { target: Vector3; position: Vector3 },
): void {
  const e = easeInOut(t)
  out.target.lerpVectors(a.target, b.target, e)
  out.position.lerpVectors(a.position, b.position, e)
  out.position.y +=
    a.position.distanceTo(b.position) * lift * Math.sin(Math.PI * e)
}

/**
 * Where to fly when the pick changes, and the view to return to after. Home is
 * where the first pick left from; picking another file keeps it, and clearing
 * the pick spends it on the way back. Clearing with no home goes nowhere.
 */
export function route(
  pick: number | null,
  from: Shot,
  home: Shot | null,
  aim: (file: number, from: Shot) => Shot,
): { to: Shot | null; home: Shot | null } {
  if (pick === null) return { to: home, home: null }
  return { to: aim(pick, from), home: home ?? from }
}
