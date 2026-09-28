import { Color } from 'three'
import type { FileDatum } from './atlas.ts'
import { galaxyPalette } from './galaxy-palette.ts'
import { mostCalled } from './most-called.ts'
import { apronOf, type Apron } from './terrain-apron.ts'
import { hash } from './rng.ts'
import type { Series } from './series.ts'
import {
  heightAt,
  terrainField,
  type Field,
  type Rgb,
} from './terrain-field.ts'
import { edgeFlows, riversOf, type River } from './terrain-rivers.ts'
import { strataOf, type Strata } from './terrain-strata.ts'
import { radialTree, type RadialTree } from './terrain-tree.ts'

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
  /** Bands of symbol kinds up each peak. */
  readonly strata: Strata
  /** Flat open ground round the terrain, out past the fog. */
  readonly apron: Apron
  /** River segments, draped on the ground, with distance along the flow and its weight. */
  readonly water: {
    readonly positions: Float32Array
    readonly along: Float32Array
    readonly flow: Float32Array
  }
  /**
   * The most-called files, most called first: ripples close in on each.
   * `spots` packs `[x, z, share]` per hub, `share` being `0`–`1` against the
   * most-called file.
   */
  readonly hubs: {
    readonly files: readonly number[]
    readonly spots: Float32Array
  }
}

/** Triangles with per-vertex colours. */
export interface Mesh {
  readonly positions: Float32Array
  readonly colors: Float32Array
  readonly index: Uint32Array
}

/** Disc radius, in world units; everything else scales from it. */
export const TERRAIN_RADIUS = 50
/** How many files ripples close in on; the shader loops over this many. */
export const HUBS = 12
/**
 * How far the open ground reaches, in terrain radii. The fog is thick by four
 * radii from the camera, and the camera stays within two of the centre.
 */
const APRON_REACH = 8

/**
 * The ground's colour, by angle round the centre: the key hue and fan come
 * from the galaxy's palette, so a repository's terrain and galaxy share their
 * colours. Neighbouring folders sit at neighbouring angles, so each range
 * takes its own band of the wheel and blends into the next. The fan is held
 * wide enough that the ranges always part. The metro tints its districts the
 * same way.
 */
export function groundColors(
  name: string,
  files: readonly FileDatum[],
): (angle: number) => Rgb {
  const palette = galaxyPalette(name, files)
  const spread = Math.max(200, palette.spread)
  return (angle) => {
    const turn = angle / (Math.PI * 2)
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

function hubsOf(
  tree: RadialTree,
  files: readonly FileDatum[],
): TerrainLayout['hubs'] {
  const picked = mostCalled(files, HUBS)
  const most = Math.log1p(picked[0]?.[1] ?? 1)
  const spots = new Float32Array(picked.length * 3)
  picked.forEach(([file, calls], n) => {
    const node = tree.nodes[tree.fileNode[file]!]!
    spots.set([node.x, node.z, Math.log1p(calls) / most], n * 3)
  })
  return { files: picked.map(([i]) => i), spots }
}

/** Lays out a series as terrain, from its merged files: each file at its largest. */
export function terrainLayout(series: Series, size?: number): TerrainLayout {
  const { files, calls, name } = series.merged
  const tree = radialTree(files, TERRAIN_RADIUS)
  const rivers = riversOf(tree, edgeFlows(tree, calls))
  const ground = groundColors(name, files)
  const field = terrainField({
    tree,
    files,
    rivers,
    colorOf: (node) => ground(node.angle),
    seed: hash(name),
    size,
  })
  const surface = surfaceOf(field)
  return {
    tree,
    field,
    rivers,
    surface,
    strata: strataOf(field, files),
    apron: apronOf(field, TERRAIN_RADIUS * APRON_REACH),
    water: waterOf(field, rivers),
    hubs: hubsOf(tree, files),
  }
}
