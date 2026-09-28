import { blocksOf, groundOf, type Blocks } from './metro-buildings.ts'
import { hashOf, type SpaceHash } from './metro-hash.ts'
import { GAP, relax, type Placement } from './metro-relax.ts'
import { roadCallsOf, type RoadCall } from './metro-road-calls.ts'
import { roadIndexOf, type RoadIndex } from './metro-road-index.ts'
import { roadsOf, type Road } from './metro-roads.ts'
import { sitesOf } from './metro-sites.ts'
import { unit, type Vec3 } from './metro-sphere.ts'
import {
  beaconsOf,
  lanesOf,
  type Beacons,
  type Lanes,
} from './metro-traffic.ts'
import type { Series } from './series.ts'

/**
 * The whole metro, laid out: a planet sized to the repository, a building
 * per file, roads from the folder tree, and traffic from the calls. Pure, so
 * it is tested without a GPU; the scene only hands it to three.js.
 */
export interface MetroLayout {
  readonly radius: number
  /** Per file, its angle round the pole on the folder tree's disc: the district's colour. */
  readonly angles: Float32Array
  readonly blocks: Blocks
  readonly place: Placement
  readonly roads: readonly Road[]
  /** The roads' middle lines as world points, for the autopilot and the minimap. */
  readonly roadIndex: RoadIndex
  /** Per road, the heaviest calls riding it, so its traffic can be named. */
  readonly roadCalls: readonly (readonly RoadCall[])[]
  readonly lanes: Lanes
  readonly beacons: Beacons
  /** The buildings' feet, for "what is near here?". */
  readonly near: SpaceHash
  /** The widest a building reaches from its middle; a query near a point must look this far. */
  readonly widest: number
  /** Where the buggy starts: the root's plaza at the north pole, facing down the busiest avenue. */
  readonly start: { readonly at: Vec3; readonly facing: Vec3 }
}

/** How far down the first avenue the buggy starts, in road points. */
const START_IN = 8

/**
 * A little way down the busiest avenue out of the root, facing along it, so
 * the first thing ahead is road; the pole itself, facing any way, if there
 * is no avenue.
 */
function startOf(roads: readonly Road[]): MetroLayout['start'] {
  // Avenues out of the root start at the pole; the busiest is the way in.
  let best: Road | null = null
  for (const road of roads) {
    if (road.points[1]! < 0.9999) continue
    if (!best || road.up + road.down > best.up + best.down) best = road
  }
  if (!best) return { at: [0, 1, 0], facing: [0, 0, 1] }
  const p = best.points
  const k = Math.min(p.length / 3 - 2, START_IN)
  const point = (i: number): Vec3 => [p[i * 3]!, p[i * 3 + 1]!, p[i * 3 + 2]!]
  const at = point(k)
  const next = point(k + 1)
  return {
    at,
    facing: unit([next[0] - at[0], next[1] - at[1], next[2] - at[2]]),
  }
}

/** `blocks` with each footprint cut to its `fit`; heights stay as they were. */
function squeezed(blocks: Blocks, fit: Float32Array): Blocks {
  const cut = (a: Float32Array): Float32Array => a.map((v, i) => v * fit[i]!)
  return {
    ...blocks,
    width: cut(blocks.width),
    depth: cut(blocks.depth),
    reach: cut(blocks.reach),
  }
}

/** Lays out a series as a metro, from its merged files: each file at its largest. */
export function metroLayout(series: Series): MetroLayout {
  const { files, calls, fallow } = series.merged
  const full = blocksOf(files, fallow?.deadCode ?? false)
  const sites = sitesOf(files, groundOf(full, GAP))
  const roads = roadsOf(sites, calls)
  const place = relax(sites, full, roads)
  const blocks = squeezed(full, place.fit)
  let widest = 0
  for (let i = 0; i < blocks.count; i++)
    widest = Math.max(widest, blocks.reach[i]!)
  return {
    radius: sites.radius,
    angles: Float32Array.from(
      sites.tree.fileNode,
      (n) => sites.tree.nodes[n]!.angle,
    ),
    blocks,
    place,
    roads,
    roadIndex: roadIndexOf(roads, sites.radius, 20),
    roadCalls: roadCallsOf(sites.tree, calls, roads),
    lanes: lanesOf(calls, blocks, place, sites.radius),
    beacons: beaconsOf(files, blocks, place),
    near: hashOf(place.foot, blocks.count, Math.max(8, widest * 2)),
    widest,
    start: startOf(roads),
  }
}
