import type { Link } from './atlas.ts'
import { hash, rng } from './rng.ts'
import type { RadialTree } from './terrain-tree.ts'

/**
 * Calls as rivers. A call from one file to another is routed along the
 * directory tree: up from the caller to the folder both files share, then
 * down to the callee. Calls that share a stretch of the tree add up on it,
 * so the rivers join into trunks where folders lean on each other and thin
 * into streams towards single files, like a delta.
 */

/** The calls running along one tree edge, from a node to its parent. */
export interface EdgeFlow {
  /** Calls running from the child towards the root. */
  readonly up: number
  /** Calls running from the root side down to the child. */
  readonly down: number
}

/** One river: a tree edge, as a path on the ground. */
export interface River {
  /** The child end's node; the edge runs to its parent. */
  readonly node: number
  /** Ground points `[x, z]`, in the direction the water runs. */
  readonly path: readonly (readonly [number, number])[]
  /** Calls it carries both ways, `0`–`1` against the busiest river; `0` is a dry bed. */
  readonly flow: number
  /** Whether it ends (or starts) at a file, rather than joining folders. */
  readonly spring: boolean
}

/** Ground distance between points along a river. */
const STEP = 0.6

/**
 * Adds up the calls on every tree edge, keyed by the edge's child node.
 * Calls within one file never leave it and are skipped.
 */
export function edgeFlows(
  tree: RadialTree,
  calls: readonly Link[],
): EdgeFlow[] {
  const up = tree.nodes.map(() => 0)
  const down = tree.nodes.map(() => 0)
  const { nodes } = tree
  for (const [from, to, weight] of calls) {
    let a = tree.fileNode[from]
    let b = tree.fileNode[to]
    if (a === undefined || b === undefined || a === b) continue
    // Climb the deeper end until both stand at the folder they share.
    while (a !== b) {
      if (nodes[a]!.depth >= nodes[b]!.depth) {
        up[a]! += weight
        a = nodes[a]!.parent
      } else {
        down[b]! += weight
        b = nodes[b]!.parent
      }
    }
  }
  return up.map((u, i) => ({ up: u, down: down[i]! }))
}

/**
 * The path of the edge from `node` to its parent, curving in polar steps so it
 * sweeps round the centre instead of cutting straight across, and wandering a
 * little so it reads as water, not wire.
 */
function edgePath(tree: RadialTree, node: number): [number, number][] {
  const child = tree.nodes[node]!
  const parent = tree.nodes[child.parent]!
  // The root has no angle of its own; its rivers leave it straight.
  const a0 = parent.parent === -1 ? child.angle : parent.angle
  const r0 = parent.radius
  const midR = (r0 + child.radius) / 2
  const length = Math.abs(child.radius - r0) + Math.abs(child.angle - a0) * midR
  const steps = Math.max(4, Math.ceil(length / STEP))
  const random = rng(hash(`river:${node}`))
  const phase = random() * Math.PI * 2
  const wander = Math.min(0.6, length * 0.05) * (0.5 + random())
  const out: [number, number][] = []
  for (let s = 0; s <= steps; s++) {
    const t = s / steps
    const r = r0 + (child.radius - r0) * t
    // Ease the angle so the river leaves its parent heading outward.
    const eased = t * t * (3 - 2 * t)
    const angle = a0 + (child.angle - a0) * eased
    const bend = Math.sin(t * Math.PI) * Math.sin(t * 7 + phase) * wander
    // The wander is sideways, across the direction the river runs.
    out.push([
      Math.cos(angle) * r - Math.sin(angle) * bend,
      Math.sin(angle) * r + Math.cos(angle) * bend,
    ])
  }
  return out
}

/**
 * Every tree edge, as a river running the way most of its calls run. An edge
 * no call uses is a dry bed, `flow` `0`: drawn faintly, so the whole tree
 * shows as veins, but never carved. `flow` is scaled by the square root, so
 * the trunk does not drown every stream feeding it.
 */
export function riversOf(
  tree: RadialTree,
  flows: readonly EdgeFlow[],
): River[] {
  let busiest = 0
  for (const f of flows) busiest = Math.max(busiest, f.up + f.down)
  const out: River[] = []
  flows.forEach((f, node) => {
    const total = f.up + f.down
    if (tree.nodes[node]!.parent === -1) return
    const path = edgePath(tree, node)
    // Drawn from the parent outwards; flip it when the calls run inwards.
    if (f.up > f.down) path.reverse()
    out.push({
      node,
      path,
      flow: busiest === 0 ? 0 : Math.sqrt(total / busiest),
      spring: tree.nodes[node]!.file !== -1,
    })
  })
  return out
}
