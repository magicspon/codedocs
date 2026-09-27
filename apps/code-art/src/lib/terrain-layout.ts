import { Color } from 'three'
import { isTest, type FileDatum } from './atlas.ts'
import { galaxyPalette } from './galaxy-palette.ts'
import { hash } from './rng.ts'
import type { Series } from './series.ts'
import {
  heightAt,
  terrainField,
  type Field,
  type Rgb,
} from './terrain-field.ts'
import { edgeFlows, riversOf, type River } from './terrain-rivers.ts'
import { radialTree, type RadialTree, type TreeNode } from './terrain-tree.ts'

/**
 * Everything the terrain scene draws, as flat buffers. Pure, so it is tested
 * without a GPU; the scene only hands these to three.js.
 */
export interface TerrainLayout {
  readonly tree: RadialTree
  readonly field: Field
  readonly rivers: readonly River[]
  /** The surface grid: positions, colours, wetness and triangle indexes. */
  readonly surface: Mesh & { readonly wet: Float32Array }
  /** The slab's four sides, hanging from the surface's rim to the floor. */
  readonly skirt: Mesh & {
    readonly drop: Float32Array
    readonly along: Float32Array
  }
  /** River segments, draped on the ground, with distance along the flow and its weight. */
  readonly water: {
    readonly positions: Float32Array
    readonly along: Float32Array
    readonly flow: Float32Array
  }
  /** Beacons over the most-called files: a mast and a light at its tip. */
  readonly beacons: {
    readonly files: readonly number[]
    readonly masts: Float32Array
    readonly tips: Float32Array
    readonly sizes: Float32Array
  }
  /** Where the root stands: every river meets here. */
  readonly root: readonly [number, number, number]
}

/** Triangles with per-vertex colours. */
export interface Mesh {
  readonly positions: Float32Array
  readonly colors: Float32Array
  readonly index: Uint32Array
}

/** Disc radius, in world units; everything else scales from it. */
export const TERRAIN_RADIUS = 50
/** How many files get a beacon. */
const BEACONS = 12
/** The floor the slab's sides hang down to, below the lowest ground. */
const FLOOR = -0.35

/**
 * The ground's colour, by angle round the centre: the key hue and fan come
 * from the galaxy's palette, so a repository's terrain and galaxy share their
 * colours. Neighbouring folders sit at neighbouring angles, so each range
 * takes its own band of the wheel and blends into the next. The fan is held
 * wide enough that the ranges always part.
 */
function groundColors(
  name: string,
  files: readonly FileDatum[],
): (node: TreeNode) => Rgb {
  const palette = galaxyPalette(name, files)
  const spread = Math.max(200, palette.spread)
  return (node) => {
    const turn = node.angle / (Math.PI * 2)
    const hue = (palette.hue + spread * (turn - 0.5) + 360) % 360
    const c = new Color().setHSL(hue / 360, 0.85, 0.6)
    return [c.r, c.g, c.b]
  }
}

function surfaceOf(field: Field): TerrainLayout['surface'] {
  const { size, extent, heights } = field
  const cell = (extent * 2) / (size - 1)
  const positions = new Float32Array(size * size * 3)
  for (let v = 0; v < size * size; v++) {
    positions[v * 3] = (v % size) * cell - extent
    positions[v * 3 + 1] = heights[v]!
    positions[v * 3 + 2] = Math.floor(v / size) * cell - extent
  }
  const index = new Uint32Array((size - 1) * (size - 1) * 6)
  let k = 0
  for (let j = 0; j < size - 1; j++)
    for (let i = 0; i < size - 1; i++) {
      const a = j * size + i
      index.set([a, a + size, a + 1, a + 1, a + size, a + size + 1], k)
      k += 6
    }
  return { positions, colors: field.colors, wet: field.wet, index }
}

/** The rim's vertices, once round the square, in order. */
function rimOf(size: number): number[] {
  const out: number[] = []
  for (let i = 0; i < size - 1; i++) out.push(i)
  for (let j = 0; j < size - 1; j++) out.push(j * size + size - 1)
  for (let i = size - 1; i > 0; i--) out.push((size - 1) * size + i)
  for (let j = size - 1; j > 0; j--) out.push(j * size)
  out.push(0)
  return out
}

function skirtOf(
  field: Field,
  surface: TerrainLayout['surface'],
): TerrainLayout['skirt'] {
  const rim = rimOf(field.size)
  const floor = FLOOR * field.peak * 4
  const positions = new Float32Array(rim.length * 6)
  const colors = new Float32Array(rim.length * 6)
  const drop = new Float32Array(rim.length * 2)
  const along = new Float32Array(rim.length * 2)
  const cell = (field.extent * 2) / (field.size - 1)
  rim.forEach((v, n) => {
    for (const [end, y] of [
      [0, surface.positions[v * 3 + 1]!],
      [1, floor],
    ] as const) {
      const at = n * 2 + end
      positions.set(
        [surface.positions[v * 3]!, y, surface.positions[v * 3 + 2]!],
        at * 3,
      )
      colors.set(surface.colors.subarray(v * 3, v * 3 + 3), at * 3)
      drop[at] = end
      along[at] = n * cell
    }
  })
  const index = new Uint32Array((rim.length - 1) * 6)
  for (let n = 0; n < rim.length - 1; n++) {
    const a = n * 2
    index.set([a, a + 1, a + 2, a + 2, a + 1, a + 3], n * 6)
  }
  return { positions, colors, index, drop, along }
}

function waterOf(
  field: Field,
  rivers: readonly River[],
): TerrainLayout['water'] {
  const positions: number[] = []
  const along: number[] = []
  const flow: number[] = []
  const lift = field.peak * 0.015
  for (const river of rivers) {
    let run = 0
    // A per-river head start, so neighbouring rivers do not pulse in step.
    const offset = (hash(`water:${river.node}`) % 1000) / 100
    for (let s = 1; s < river.path.length; s++) {
      const [x0, z0] = river.path[s - 1]!
      const [x1, z1] = river.path[s]!
      const step = Math.hypot(x1 - x0, z1 - z0)
      positions.push(x0, heightAt(field, x0, z0) + lift, z0)
      positions.push(x1, heightAt(field, x1, z1) + lift, z1)
      along.push(run + offset, run + step + offset)
      flow.push(river.flow, river.flow)
      run += step
    }
  }
  return {
    positions: new Float32Array(positions),
    along: new Float32Array(along),
    flow: new Float32Array(flow),
  }
}

function beaconsOf(
  field: Field,
  tree: RadialTree,
  files: readonly FileDatum[],
): TerrainLayout['beacons'] {
  const picked = files
    .map((f, i) => [i, f.callsIn] as const)
    .filter(([i, calls]) => calls > 0 && !isTest(files[i]!))
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, BEACONS)
  const most = Math.log1p(picked[0]?.[1] ?? 1)
  const masts = new Float32Array(picked.length * 6)
  const tips = new Float32Array(picked.length * 3)
  const sizes = new Float32Array(picked.length)
  picked.forEach(([file, calls], n) => {
    const node = tree.nodes[tree.fileNode[file]!]!
    const base = heightAt(field, node.x, node.z)
    const share = Math.log1p(calls) / most
    const top = base + field.peak * (0.35 + 0.9 * share)
    masts.set([node.x, base, node.z, node.x, top, node.z], n * 6)
    tips.set([node.x, top, node.z], n * 3)
    sizes[n] = 0.35 + 0.5 * share
  })
  return { files: picked.map(([i]) => i), masts, tips, sizes }
}

/** Lays out a series as terrain, from its merged files: each file at its largest. */
export function terrainLayout(series: Series, size?: number): TerrainLayout {
  const { files, calls, name } = series.merged
  const tree = radialTree(files, TERRAIN_RADIUS)
  const rivers = riversOf(tree, edgeFlows(tree, calls))
  const field = terrainField({
    tree,
    files,
    rivers,
    colorOf: groundColors(name, files),
    seed: hash(name),
    size,
  })
  const surface = surfaceOf(field)
  return {
    tree,
    field,
    rivers,
    surface,
    skirt: skirtOf(field, surface),
    water: waterOf(field, rivers),
    beacons: beaconsOf(field, tree, files),
    root: [0, heightAt(field, 0, 0), 0],
  }
}
