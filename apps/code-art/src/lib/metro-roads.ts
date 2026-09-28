import type { Link } from './atlas.ts'
import { arcPath, ringPath, STEP, streetPath } from './metro-paths.ts'
import { REACH, type Sites } from './metro-sites.ts'
import { add, unit, type Vec3 } from './metro-sphere.ts'
import { edgeFlows } from './terrain-rivers.ts'

/**
 * The metro's roads, from the folder tree and where its files were built:
 *
 * - **Streets**: one per folder, down the middle of its own buildings, so a
 *   folder is a street and its files line it.
 * - **Avenues** join each folder's street to its subfolders' streets, so
 *   the tree can be driven from the root at the north pole out to any file.
 * - **Ring roads** loop the planet at a few latitudes, wandering north and
 *   south, so a driver can get round without doubling back.
 *
 * Calls ride the avenues and streets as traffic, routed up and down the tree
 * as the terrain routes its rivers: one lane carries the calls heading for
 * the root, the other those heading away.
 */

/** Which sort of road; wider sorts ride over narrower ones. */
export const RoadKind = { ring: 0, avenue: 1, street: 2 } as const
export type RoadKind = (typeof RoadKind)[keyof typeof RoadKind]

/** One road, as a line of points down its middle. */
export interface Road {
  readonly kind: RoadKind
  /** Kerb to kerb, in world units. */
  readonly width: number
  /** Unit directions from the planet's centre, `[x, y, z]` per point. */
  readonly points: Float32Array
  /** Calls running towards the root, `0`–`1` against the busiest lane. */
  readonly up: number
  /** Calls running away from the root, likewise. */
  readonly down: number
  /** Radians round the pole on the folder tree's disc: the district's colour. */
  readonly angle: number
  /**
   * The folder tree node it serves: an avenue's subfolder, or a street's
   * folder; `-1` for a ring road, which serves no one folder.
   */
  readonly node: number
}

const STREET_WIDTH = 3.4
const RING_WIDTH = 6.5
/** Ground between ring roads, in world units. */
const RING_SPACING = 150
/**
 * The share of the planet the avenues and streets may pave. Every folder
 * wanting its own roads would pave a big repository over, so the biggest
 * folders get theirs first and the smallest do without.
 */
const PAVED = 0.22

/**
 * Where each folder's roads meet: the middle of its own buildings, or, for a
 * folder holding only folders, the middle of its subfolders' hubs. The root
 * is the north pole, where the drive starts.
 */
function hubsOf(sites: Sites): Vec3[] {
  const { nodes } = sites.tree
  const sums: Vec3[] = nodes.map(() => [0, 0, 0])
  const own = nodes.map(() => 0)
  const kids: Vec3[] = nodes.map(() => [0, 0, 0])
  nodes.forEach((node) => {
    if (node.file === -1 || node.parent === -1) return
    sums[node.parent] = add(sums[node.parent]!, sites.plots[node.file]!)
    own[node.parent]!++
  })
  const hubs: Vec3[] = nodes.map(() => [0, 1, 0])
  // Children come after parents, so walking back finds every child's hub first.
  for (let i = nodes.length - 1; i > 0; i--) {
    const node = nodes[i]!
    if (node.file !== -1) continue
    hubs[i] = own[i]! > 0 ? unit(sums[i]!) : unit(kids[i]!)
    kids[node.parent] = add(kids[node.parent]!, hubs[i]!)
  }
  return hubs
}

/** Files below each tree node, counting its own. */
function descendants(sites: Sites): number[] {
  const { nodes } = sites.tree
  const count = nodes.map((n) => (n.file === -1 ? 0 : 1))
  for (let i = nodes.length - 1; i > 0; i--)
    count[nodes[i]!.parent]! += count[i]!
  return count
}

/** A road a folder could have, and how much it matters. */
interface Wanted {
  readonly files: number
  readonly depth: number
  readonly make: () => Road | null
}

/** Every road on the planet: ring roads, then avenues and streets, biggest folder first. */
export function roadsOf(sites: Sites, calls: readonly Link[]): Road[] {
  const { tree, radius, plots } = sites
  const { nodes } = tree
  const flows = edgeFlows(tree, calls)
  let busiest = 1
  for (const f of flows) busiest = Math.max(busiest, f.up, f.down)
  const lane = (n: number): number => Math.log1p(n) / Math.log1p(busiest)
  const below = descendants(sites)
  const hubs = hubsOf(sites)
  const roads: Road[] = []

  const rings = Math.max(1, Math.round((Math.PI * radius) / RING_SPACING) - 1)
  for (let k = 1; k <= rings; k++)
    roads.push({
      kind: RoadKind.ring,
      width: RING_WIDTH,
      points: ringPath((k / (rings + 1)) * REACH, radius, 14, `ring:${k}`),
      up: 0.5,
      down: 0.5,
      angle: 0,
      node: -1,
    })

  const wanted: Wanted[] = []
  const own = new Map<number, number[]>()
  nodes.forEach((node, i) => {
    if (node.file !== -1) {
      const list = own.get(node.parent)
      if (list) list.push(i)
      else own.set(node.parent, [i])
      return
    }
    if (node.parent === -1) return
    wanted.push({
      files: below[i]!,
      depth: node.depth,
      make: () => {
        const points = arcPath(
          hubs[node.parent]!,
          hubs[i]!,
          radius,
          45,
          `avenue:${i}`,
        )
        return (
          points && {
            kind: RoadKind.avenue,
            width: Math.min(8, 3.8 + 0.6 * Math.log2(1 + below[i]!)),
            points,
            up: lane(flows[i]!.up),
            down: lane(flows[i]!.down),
            angle: node.angle,
            node: i,
          }
        )
      },
    })
  })
  for (const [folder, files] of own) {
    wanted.push({
      files: files.length,
      depth: nodes[folder]!.depth + 0.5,
      make: () => {
        const points = streetPath(
          files.map((k) => plots[nodes[k]!.file]!),
          radius,
        )
        let up = 0
        let down = 0
        for (const k of files) {
          up += flows[k]!.up
          down += flows[k]!.down
        }
        return (
          points && {
            kind: RoadKind.street,
            width: STREET_WIDTH,
            points,
            up: lane(up),
            down: lane(down),
            angle: nodes[folder]!.angle,
            node: folder,
          }
        )
      },
    })
  }

  // A parent holds at least its children's files, so its roads are paved first.
  wanted.sort((a, b) => b.files - a.files || a.depth - b.depth)
  let budget = PAVED * 4 * Math.PI * radius * radius
  for (const want of wanted) {
    const road = want.make()
    if (!road) continue
    const area = (road.points.length / 3) * STEP * road.width
    if (area > budget) continue
    budget -= area
    roads.push(road)
  }
  return roads
}
