import { symbolCount, type FileDatum } from './atlas.ts'
import type { Series } from './series.ts'
import { blur, paint } from './terrain.ts'
import { treemap, type Rect } from './treemap.ts'

/**
 * The landscape's heightfield. Files are hills, as high as their symbols and
 * the calls landing on them; the gaps between directories sit at sea level
 * and flood into channels; unresolved calls dig lakes where the analysis was
 * blind.
 *
 * One elevation grid per frame, all on one scale, so over a timeline the land
 * rises out of the sea rather than being renormalised at every commit.
 */

/** One lighthouse: the file it marks, where it stands, and the grid vertex it stands on. */
export interface Lighthouse {
  readonly file: number
  readonly x: number
  readonly z: number
  readonly vertex: number
}

export interface LandscapeLayout {
  /** Ground positions; `y` is painted from `elevations` at the playhead. */
  readonly positions: Float32Array
  readonly colors: Float32Array
  readonly index: Uint32Array
  /** Per frame, one elevation per grid vertex. */
  readonly elevations: readonly Float32Array[]
  /** File rects on the ground, for mapping a pointer back to a file. */
  readonly rects: readonly Rect[]
  /** The most-called files. */
  readonly lighthouses: readonly Lighthouse[]
  readonly size: number
  readonly waterLevel: number
  readonly peak: number
}

const LIGHTHOUSES = 16
const SIZE = 200

/** The raw, unscaled field for one frame's files. */
function rawField(
  row: readonly (FileDatum | null)[],
  rects: readonly Rect[],
  grid: number,
): Float32Array {
  const cell = SIZE / (grid - 1)
  const field = new Float32Array(grid * grid)
  const splat = (
    cx: number,
    cz: number,
    sigma: number,
    amplitude: number,
  ): void => {
    const reach = sigma * 2.5
    const i0 = Math.max(0, Math.floor((cz - reach + SIZE / 2) / cell))
    const i1 = Math.min(grid - 1, Math.ceil((cz + reach + SIZE / 2) / cell))
    const j0 = Math.max(0, Math.floor((cx - reach + SIZE / 2) / cell))
    const j1 = Math.min(grid - 1, Math.ceil((cx + reach + SIZE / 2) / cell))
    for (let i = i0; i <= i1; i++) {
      const dz = i * cell - SIZE / 2 - cz
      for (let j = j0; j <= j1; j++) {
        const dx = j * cell - SIZE / 2 - cx
        field[i * grid + j]! +=
          amplitude * Math.exp(-(dx * dx + dz * dz) / (2 * sigma * sigma))
      }
    }
  }
  row.forEach((f, k) => {
    if (!f) return
    const r = rects[k]!
    const cx = r.x + r.w / 2
    const cz = r.y + r.h / 2
    const sigma = Math.max(Math.sqrt(r.w * r.h) * 0.32, cell * 1.5)
    splat(
      cx,
      cz,
      sigma,
      Math.sqrt(symbolCount(f)) + 1.5 * Math.log1p(f.callsIn),
    )
    if (f.unresolved > 0)
      splat(cx, cz, sigma * 0.7, -Math.log1p(f.unresolved) * 0.9)
  })
  // Two box-blur passes turn a field of spikes into rolling hills.
  blur(field, grid)
  blur(field, grid)
  return field
}

/** Builds the terrain buffers for one dataset. */
export function landscapeLayout(series: Series): LandscapeLayout {
  const { files } = series.merged
  const grid = files.length > 4000 ? 384 : 256
  const cell = SIZE / (grid - 1)
  const { files: rects } = treemap(
    files.map((f) => f.path),
    files.map((f) => Math.max(f.size, 600)),
    SIZE * 0.92,
    SIZE * 0.006,
  )
  const peak = SIZE * 0.09

  const raw = series.at.map((row) => rawField(row, rects, grid))
  let max = 1e-6
  for (const field of raw) for (const h of field) max = Math.max(max, h)
  const elevations = raw.map((field) =>
    field.map((h, v) => {
      // A square root flattens the few giant files so the rest still have relief.
      const t = Math.sign(h) * Math.sqrt(Math.abs(h) / max)
      const x = (v % grid) * cell - SIZE / 2
      const z = Math.floor(v / grid) * cell - SIZE / 2
      return (
        Math.max(t, -0.05) * peak +
        peak * 0.03 * (Math.sin(x * 0.07) + Math.cos(z * 0.05))
      )
    }),
  )

  const positions = new Float32Array(grid * grid * 3)
  for (let v = 0; v < grid * grid; v++) {
    positions[v * 3] = (v % grid) * cell - SIZE / 2
    positions[v * 3 + 2] = Math.floor(v / grid) * cell - SIZE / 2
  }
  const colors = new Float32Array(grid * grid * 3)
  paint(elevations, elevations.length - 1, peak, positions, colors)

  const index = new Uint32Array((grid - 1) * (grid - 1) * 6)
  let n = 0
  for (let i = 0; i < grid - 1; i++) {
    for (let j = 0; j < grid - 1; j++) {
      const a = i * grid + j
      index.set([a, a + grid, a + 1, a + 1, a + grid, a + grid + 1], n)
      n += 6
    }
  }

  const lighthouses = files
    .map((f, k) => [k, f.callsIn] as const)
    .filter(([, calls]) => calls > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, LIGHTHOUSES)
    .map(([file]): Lighthouse => {
      const r = rects[file]!
      const x = r.x + r.w / 2
      const z = r.y + r.h / 2
      const vertex =
        Math.round((z + SIZE / 2) / cell) * grid +
        Math.round((x + SIZE / 2) / cell)
      return { file, x, z, vertex }
    })

  return {
    positions,
    colors,
    index,
    elevations,
    rects,
    lighthouses,
    size: SIZE,
    waterLevel: peak * 0.085,
    peak,
  }
}

/** The file whose plot contains a ground point, or `null` over water. */
export function fileAt(
  rects: readonly Rect[],
  x: number,
  z: number,
): number | null {
  for (let k = 0; k < rects.length; k++) {
    const r = rects[k]!
    if (x >= r.x && x <= r.x + r.w && z >= r.y && z <= r.y + r.h) return k
  }
  return null
}
