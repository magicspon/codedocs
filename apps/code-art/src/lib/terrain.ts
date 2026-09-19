import { Color } from 'three'

/**
 * Grid operations the landscape needs: smoothing a raw field, colouring by
 * height, and painting the terrain at a point in history.
 */

/** Height bands, low to high: seabed, shallows, sand, meadow, forest, rock, snow. */
const BANDS: readonly (readonly [number, Color])[] = [
  [0.0, new Color('#0b1d3a')],
  [0.07, new Color('#1f5f7a')],
  [0.1, new Color('#d8c89a')],
  [0.16, new Color('#6fae5a')],
  [0.38, new Color('#2f6b3c')],
  [0.62, new Color('#7a6f66')],
  [0.85, new Color('#f4f6fb')],
]

/** The colour for a height, as a fraction of the peak. */
function band(t: number, out: Color): Color {
  for (let i = 1; i < BANDS.length; i++) {
    const [top, hi] = BANDS[i]!
    const [bottom, lo] = BANDS[i - 1]!
    if (t <= top) return out.lerpColors(lo, hi, (t - bottom) / (top - bottom))
  }
  return out.copy(BANDS[BANDS.length - 1]![1])
}

/** A 3×3 box blur, in place. */
export function blur(field: Float32Array, grid: number): void {
  const copy = field.slice()
  for (let i = 1; i < grid - 1; i++) {
    for (let j = 1; j < grid - 1; j++) {
      let sum = 0
      for (let di = -1; di <= 1; di++)
        for (let dj = -1; dj <= 1; dj++) sum += copy[(i + di) * grid + j + dj]!
      field[i * grid + j] = sum / 9
    }
  }
}

/** One elevation per frame, blended at fractional frame `t`. */
export function elevationAt(
  frames: readonly Float32Array[],
  vertex: number,
  t: number,
): number {
  const f0 = Math.min(Math.floor(t), frames.length - 1)
  const f1 = Math.min(f0 + 1, frames.length - 1)
  const e0 = frames[f0]![vertex]!
  return e0 + (frames[f1]![vertex]! - e0) * (t - f0)
}

const scratch = new Color()

/** Writes the terrain at fractional frame `t` into the mesh's position and colour buffers. */
export function paint(
  frames: readonly Float32Array[],
  t: number,
  peak: number,
  positions: Float32Array,
  colors: Float32Array,
): void {
  const vertices = frames[0]!.length
  for (let v = 0; v < vertices; v++) {
    const y = elevationAt(frames, v, t)
    positions[v * 3 + 1] = y
    band(Math.max(0, y / peak), scratch)
    colors[v * 3] = scratch.r
    colors[v * 3 + 1] = scratch.g
    colors[v * 3 + 2] = scratch.b
  }
}
