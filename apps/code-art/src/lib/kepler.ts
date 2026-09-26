/**
 * The measures every orbit layout shares: where the first ring lies, how
 * fast it turns, and how many bodies one ring may draw.
 */

/** The innermost ring's radius, in a system at scale `1`. */
export const FIRST_RING = 1.1
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
