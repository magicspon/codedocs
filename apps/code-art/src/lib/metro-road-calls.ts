import type { Link } from './atlas.ts'
import { RoadKind, type Road } from './metro-roads.ts'
import type { RadialTree } from './terrain-tree.ts'

/**
 * Which calls ride each road, so the traffic can be named. A call is routed
 * as the roads' traffic is: up the folder tree from the caller to the folder
 * both files share, then down to the callee. An avenue carries the calls
 * crossing its folder's edge of the tree; a street carries the calls into
 * and out of its folder's own files.
 */

/** How fast the road traffic drives, in world units (metres) a second: about 47 km/h. */
export const TRAFFIC_PACE = 13

/** One call on a road: which file calls which, how often, and which way it drives. */
export interface RoadCall {
  readonly from: number
  readonly to: number
  readonly count: number
  /** Whether it runs towards the root (the white lane) or away from it (the red one). */
  readonly toRoot: boolean
}

/** How many calls each road names, at most, split between its two lanes. */
const PER_ROAD = 6

/** Up to `PER_ROAD` of `calls`, heaviest first, both lanes kept if both have any. */
function pick(calls: readonly RoadCall[]): RoadCall[] {
  const sorted = [...calls].sort((a, b) => b.count - a.count)
  const half = PER_ROAD / 2
  const up = sorted.filter((c) => c.toRoot).slice(0, half)
  const down = sorted.filter((c) => !c.toRoot).slice(0, half)
  const chosen = new Set([...up, ...down])
  for (const c of sorted) if (chosen.size < PER_ROAD) chosen.add(c)
  return [...chosen].sort((a, b) => b.count - a.count)
}

/** The heaviest calls on each of `roads`, by road; none for a ring road. */
export function roadCallsOf(
  tree: RadialTree,
  calls: readonly Link[],
  roads: readonly Road[],
): RoadCall[][] {
  const { nodes } = tree
  // Per tree edge, keyed by its child node: calls come heaviest first, so
  // the first few found are the ones to keep.
  const keep = PER_ROAD * 2
  const through: RoadCall[][] = nodes.map(() => [])
  const add = (node: number, call: RoadCall): void => {
    const list = through[node]!
    if (list.length < keep) list.push(call)
  }
  for (const [from, to, count] of calls) {
    let a = tree.fileNode[from]
    let b = tree.fileNode[to]
    if (a === undefined || b === undefined || a === b) continue
    while (a !== b) {
      if (nodes[a]!.depth >= nodes[b]!.depth) {
        add(a, { from, to, count, toRoot: true })
        a = nodes[a]!.parent
      } else {
        add(b, { from, to, count, toRoot: false })
        b = nodes[b]!.parent
      }
    }
  }
  const own = new Map<number, number[]>()
  nodes.forEach((node, i) => {
    if (node.file === -1) return
    const list = own.get(node.parent)
    if (list) list.push(i)
    else own.set(node.parent, [i])
  })
  return roads.map((road) => {
    if (road.kind === RoadKind.ring || road.node < 0) return []
    if (road.kind === RoadKind.avenue) return pick(through[road.node]!)
    return pick((own.get(road.node) ?? []).flatMap((k) => through[k]!))
  })
}
