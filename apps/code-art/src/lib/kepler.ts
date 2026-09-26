/**
 * The measures every orbit layout shares: where the first ring lies, how
 * fast it turns, and how many bodies one ring may draw.
 */

/** The innermost ring's radius, in a system at scale `1`. */
export const FIRST_RING = 1.1
/** Space between one ring and the next, in a system at scale `1`. */
export const RING_GAP = 0.5
/**
 * A moon system's scale against the body it circles: its first ring lies
 * three body radii out, clear of the surface.
 */
export const MOON_SCALE = 3 / FIRST_RING
/** Past this, a ring is a solid belt anyway; more bodies only cost draw time. */
export const MAX_PER_RING = 400
/** Seconds the innermost ring takes to go round once. */
const INNER_PERIOD = 14

/**
 * Radians per second for a ring at `radius`, in a system at `scale`: inner
 * rings run faster, as Kepler said. Taken against the first ring's radius,
 * so the ratio holds at any scale.
 */
export function keplerSpeed(radius: number, scale: number): number {
  return ((Math.PI * 2) / INNER_PERIOD) * ((FIRST_RING * scale) / radius) ** 1.5
}

/**
 * How far a body of radius `size` with `rings` moon orbits reaches from its
 * centre, moons and all: its outermost moon ring plus a margin for the moons
 * on it. A body without moons reaches only its surface.
 */
export function moonReach(size: number, rings: number): number {
  if (rings <= 0) return size
  return (FIRST_RING + (rings - 1) * RING_GAP) * MOON_SCALE * size + size * 0.5
}
