import { GROUND, type Field } from './terrain-field.ts'

/**
 * Open ground round the terrain, flat at sea level, reaching far past where
 * the fog swallows it, so the view never finds an edge. It is a square frame
 * whose hole is the terrain's own square: the terrain's rim settles to sea
 * level, so the two meet flush. It carries every attribute the surface
 * shader reads, so it is drawn with the same material and the grid runs on
 * unbroken.
 */
export interface Apron {
  readonly positions: Float32Array
  readonly colors: Float32Array
  readonly index: Uint32Array
  readonly wet: Float32Array
  readonly strataLow: Float32Array
  readonly strataHigh: Float32Array
  readonly rise: Float32Array
}

/** Builds the apron out to `reach`, half the outer square's width. */
export function apronOf(field: Field, reach: number): Apron {
  const inner = field.extent
  // Inner corners 0–3, then outer corners 4–7, both round the square in order.
  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const
  const positions = new Float32Array(8 * 3)
  for (const [ring, half] of [
    [0, inner],
    [1, reach],
  ] as const)
    corners.forEach(([x, z], c) =>
      positions.set([x * half, 0, z * half], (ring * 4 + c) * 3),
    )
  // One quad per side, joining an inner edge to its outer edge, wound to face up.
  const index = new Uint32Array(4 * 6)
  for (let s = 0; s < 4; s++) {
    const a = s
    const b = (s + 1) % 4
    index.set([a, b, a + 4, b, b + 4, a + 4], s * 6)
  }
  const colors = new Float32Array(8 * 3)
  for (let v = 0; v < 8; v++) colors.set(GROUND, v * 3)
  return {
    positions,
    colors,
    index,
    wet: new Float32Array(8),
    strataLow: new Float32Array(8 * 4),
    strataHigh: new Float32Array(8 * 4),
    // Off any peak, so the shader lays no strata here.
    rise: new Float32Array(8).fill(-1),
  }
}
