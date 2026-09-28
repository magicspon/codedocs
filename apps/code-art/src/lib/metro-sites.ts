import type { FileDatum } from './atlas.ts'
import type { Vec3 } from './metro-sphere.ts'
import { deal, type Warp } from './metro-warp.ts'
import { radialTree, type RadialTree } from './terrain-tree.ts'

/**
 * Where everything stands on the metro's planet, before the roads push the
 * buildings apart. The folder tree is laid out as the terrain lays it out, on
 * a disc, then wrapped round the planet: the repository root at the north
 * pole, each folder fanning south from its parent.
 */

/**
 * The share of the planet the buildings' ground covers. Round plots pack at
 * best about nine tenths full, and roads take a fifth of what is left.
 */
const FILL = 0.55
/** The smallest planet: a handful of files still gets a world to drive round. */
const MIN_RADIUS = 70
/**
 * How much of the planet the city covers, from the north pole. The rest is a
 * small cap round the south pole, which the equal-area wrap would otherwise
 * crush the deepest files into.
 */
export const REACH = 0.97

/** The folder tree, wrapped round the planet. */
export interface Sites {
  readonly tree: RadialTree
  readonly radius: number
  /** Per tree node, its unit direction from the planet's centre. */
  readonly nodes: readonly Vec3[]
  /** Per tree node, the share of the planet between it and the north pole. */
  readonly shares: readonly number[]
  /** Per file, its plot: a unit direction, spread evenly over the city. */
  readonly plots: readonly Vec3[]
  /** Disc to planet, bent the way the plots were dealt, for drawing roads between nodes. */
  readonly warp: Warp
}

/** The planet's radius for buildings wanting `ground` square world units between them. */
function planetRadius(ground: number): number {
  return Math.max(MIN_RADIUS, Math.sqrt(ground / FILL / (4 * Math.PI)))
}

/**
 * A map from disc radius to the share of the planet within it, by rank: the
 * n-th file out from the root gets the n-th share of the ground. The tree
 * packs its outer rings more tightly than its inner ones; ranking evens that
 * out, so the city is as dense at the equator as by the pole.
 */
function evenOut(tree: RadialTree): (r: number) => number {
  const radii = tree.fileNode
    .map((n) => tree.nodes[n]!.radius)
    .sort((a, b) => a - b)
  const n = radii.length
  if (n === 0) return (r) => (r / Math.max(tree.radius, 1e-9)) * REACH
  return (r) => {
    // The first ranked radius at or past `r`, then a blend to the one before.
    let lo = 0
    let hi = n
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (radii[mid]! < r) lo = mid + 1
      else hi = mid
    }
    const below = lo === 0 ? 0 : radii[lo - 1]!
    const above = lo === n ? tree.radius : radii[lo]!
    const t = above > below ? (r - below) / (above - below) : 0
    return (Math.min(n, lo + t) / n) * REACH
  }
}

/** Wraps `files`' folder tree round a planet with room for `ground` square world units of plots. */
export function sitesOf(files: readonly FileDatum[], ground: number): Sites {
  const tree = radialTree(files, 1)
  const share = evenOut(tree)
  const shares = tree.nodes.map((node) => share(node.radius))
  const radius = planetRadius(ground)
  // Bands about one plot deep, so a band's files sit in a single rank.
  const spacing = Math.sqrt(
    (4 * Math.PI * radius * radius * REACH) / Math.max(1, files.length),
  )
  const bands = Math.max(2, Math.round((Math.PI * radius) / spacing))
  const { plots, warp } = deal(
    tree.fileNode.map((n) => tree.nodes[n]!.angle),
    tree.fileNode.map((n) => shares[n]!),
    bands,
    REACH,
  )
  return {
    tree,
    radius,
    nodes: tree.nodes.map((node, i) => warp(node.angle, shares[i]!)),
    shares,
    plots,
    warp,
  }
}
