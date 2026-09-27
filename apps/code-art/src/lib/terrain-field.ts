import { isTest, symbolCount, type FileDatum } from './atlas.ts'
import { ridged, valueNoise } from './terrain-noise.ts'
import type { River } from './terrain-rivers.ts'
import type { RadialTree, TreeNode } from './terrain-tree.ts'

/**
 * The terrain as a square grid of heights. Each file raises a peak as tall as
 * its symbol count, so a folder of busy files becomes a range; each test file
 * sinks a small lake instead. Rivers of calls are then carved into the rock,
 * deeper where they carry more.
 */
export interface Field {
  /** Vertices along each side. */
  readonly size: number
  /** Half the width of the square, centred on the origin. */
  readonly extent: number
  /** The tallest a peak may stand; heights are mostly within `±peak`. */
  readonly peak: number
  /** Per vertex, row by row along x, then down z. */
  readonly heights: Float32Array
  /** Per vertex, RGB: the colour of the files that raised it, blended by how much each did. */
  readonly colors: Float32Array
  /** Per vertex, `0`–`1`: how much river runs here. */
  readonly wet: Float32Array
  /** Per vertex, the file whose peak it stands on, or `-1` for open ground. */
  readonly owner: Int32Array
}

/** Colours are plain RGB triples, so the field stays free of three.js. */
export type Rgb = readonly [number, number, number]

/** The ground no file claims: a deep blue-grey, so its grid lines still show. */
const GROUND: Rgb = [0.1, 0.12, 0.2]

interface Grid {
  readonly size: number
  readonly extent: number
  readonly cell: number
}

/** Calls `visit` with every vertex within `reach` of `(x, z)` and its distance squared. */
function around(
  grid: Grid,
  x: number,
  z: number,
  reach: number,
  visit: (v: number, d2: number) => void,
): void {
  const { size, extent, cell } = grid
  const toIndex = (w: number): number => (w + extent) / cell
  const i0 = Math.max(0, Math.floor(toIndex(x - reach)))
  const i1 = Math.min(size - 1, Math.ceil(toIndex(x + reach)))
  const j0 = Math.max(0, Math.floor(toIndex(z - reach)))
  const j1 = Math.min(size - 1, Math.ceil(toIndex(z + reach)))
  const r2 = reach * reach
  for (let j = j0; j <= j1; j++) {
    const dz = j * cell - extent - z
    for (let i = i0; i <= i1; i++) {
      const dx = i * cell - extent - x
      const d2 = dx * dx + dz * dz
      if (d2 <= r2) visit(j * size + i, d2)
    }
  }
}

/** Options for `terrainField`. */
export interface FieldOptions {
  readonly tree: RadialTree
  readonly files: readonly FileDatum[]
  readonly rivers: readonly River[]
  /** The colour of the ground a node raises. */
  readonly colorOf: (node: TreeNode) => Rgb
  /** Seeds the rock, so each repository has its own crags. */
  readonly seed: number
  /** Vertices along each side. */
  readonly size?: number
}

/** Raises and carves the terrain for a laid-out tree. */
export function terrainField(options: FieldOptions): Field {
  const { tree, files, rivers, seed } = options
  const size = options.size ?? 200
  const extent = tree.radius * 1.15
  const grid: Grid = { size, extent, cell: (extent * 2) / (size - 1) }
  const peak = tree.radius * 0.13
  const count = size * size
  const raised = new Float32Array(count)
  // Cubes of each lift, for a soft maximum: a peak stands at its own file's
  // height, not stacked on its neighbours'.
  const cubed = new Float32Array(count)
  const sunk = new Float32Array(count)
  const strength = new Float32Array(count)
  const colors = new Float32Array(count * 3)
  const weight = new Float32Array(count)
  const owner = new Int32Array(count).fill(-1)

  // Peaks widen as files thin out, so a small repository still fills its disc.
  const spread = Math.min(
    tree.radius * 0.18,
    Math.max(
      grid.cell * 1.2,
      (tree.radius / Math.sqrt(Math.max(1, files.length))) * 1.15,
    ),
  )
  // A loop, not a spread: a big repository has more files than a call takes arguments.
  const most = files.reduce((m, f) => Math.max(m, symbolCount(f)), 1)
  files.forEach((f, i) => {
    const node = tree.nodes[tree.fileNode[i]!]!
    const share = Math.log1p(symbolCount(f)) / Math.log1p(most)
    const test = isTest(f)
    const height = test
      ? -peak * 0.25 * (0.4 + 0.6 * share)
      : peak * (0.12 + 0.88 * share)
    const sigma = spread * (0.75 + 0.5 * share)
    const [r, g, b] = options.colorOf(node)
    around(grid, node.x, node.z, sigma * 3, (v, d2) => {
      const lift = height * Math.exp(-d2 / (2 * sigma * sigma))
      if (test) sunk[v]! += lift
      else {
        raised[v]! += lift
        cubed[v]! += lift * lift * lift
      }
      const w = Math.abs(lift)
      colors[v * 3]! += r * w
      colors[v * 3 + 1]! += g * w
      colors[v * 3 + 2]! += b * w
      weight[v]! += w
      if (w > strength[v]!) {
        strength[v] = w
        owner[v] = i
      }
    })
  })

  // How deep each river cuts, and how wide.
  const carve = new Float32Array(count)
  const wet = new Float32Array(count)
  for (const river of rivers) {
    if (river.flow === 0) continue
    const depth = peak * (0.04 + 0.22 * river.flow) * (river.spring ? 0.5 : 1)
    const width = grid.cell * 1.2 + tree.radius * 0.022 * river.flow
    for (const [x, z] of river.path)
      around(grid, x, z, width * 2, (v, d2) => {
        const fall = Math.exp(-d2 / (width * width))
        carve[v] = Math.max(carve[v]!, depth * fall)
        // Only the busier rivers wet their banks; a stream stays a line.
        wet[v] = Math.max(wet[v]!, river.flow * river.flow * fall)
      })
  }

  const heights = new Float32Array(count)
  const soft = peak * 1.5
  const settle = peak * 0.05
  for (let v = 0; v < count; v++) {
    const x = (v % size) * grid.cell - extent
    const z = Math.floor(v / size) * grid.cell - extent
    // Rock: crags on the slopes, and a gentle roll to the open ground.
    const crag = 0.3 + 1.4 * ridged(x * 0.11, z * 0.11, seed)
    const roll =
      (valueNoise(x * 0.05, z * 0.05, seed ^ 0x9e37) - 0.5) * peak * 0.08
    // Each peak at its own height, on a swell that rises where files crowd,
    // so a busy folder reads as a range without towering over the rest.
    const swell = soft * Math.tanh(raised[v]! / soft) * 0.3
    const rock = (Math.cbrt(cubed[v]!) + swell) * crag
    // The slab's rim settles to a floor, so its sides read as one block.
    const edge = Math.max(Math.abs(x), Math.abs(z)) / extent
    const rim = 1 - smooth(0.88, 1, edge)
    heights[v] = (rock + sunk[v]! + roll) * rim - carve[v]!
    const w = weight[v]!
    for (let c = 0; c < 3; c++)
      colors[v * 3 + c] =
        (colors[v * 3 + c]! + GROUND[c]! * settle) / (w + settle)
    if (strength[v]! < peak * 0.08) owner[v] = -1
  }
  return { size, extent, peak, heights, colors, wet, owner }
}

/** Hermite step from `0` at `a` to `1` at `b`. */
function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** The field's height at any ground point, blended from the four vertices round it. */
export function heightAt(field: Field, x: number, z: number): number {
  const { size, extent } = field
  const cell = (extent * 2) / (size - 1)
  const fx = Math.min(size - 1.001, Math.max(0, (x + extent) / cell))
  const fz = Math.min(size - 1.001, Math.max(0, (z + extent) / cell))
  const i = Math.floor(fx)
  const j = Math.floor(fz)
  const u = fx - i
  const t = fz - j
  const h = field.heights
  const a = h[j * size + i]!
  const b = h[j * size + i + 1]!
  const c = h[(j + 1) * size + i]!
  const d = h[(j + 1) * size + i + 1]!
  return a + (b - a) * u + (c - a) * t + (a - b - c + d) * u * t
}

/** The file whose peak stands nearest ground point `(x, z)`, or `-1`. */
export function ownerAt(field: Field, x: number, z: number): number {
  const { size, extent } = field
  const cell = (extent * 2) / (size - 1)
  const i = Math.round((x + extent) / cell)
  const j = Math.round((z + extent) / cell)
  if (i < 0 || j < 0 || i >= size || j >= size) return -1
  return field.owner[j * size + i]!
}
