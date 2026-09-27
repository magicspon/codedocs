/**
 * Groups within the graph: clusters of files that work closely together, and
 * cycles of files that depend on each other in a loop. Both are deterministic,
 * so the same code always finds the same groups.
 */

import type { Adjacency } from './metrics.ts'

const PROPAGATION_ROUNDS = 12

/** Edges both ways, weights summed, so a cluster ignores who calls whom. */
function undirected(out: Adjacency): Map<number, number>[] {
  const both = out.map(() => new Map<number, number>())
  out.forEach((edges, from) => {
    for (const [to, w] of edges) {
      both[from]!.set(to, (both[from]!.get(to) ?? 0) + w)
      both[to]!.set(from, (both[to]!.get(from) ?? 0) + w)
    }
  })
  return both
}

/**
 * Clusters by label propagation: every file starts in its own cluster and
 * repeatedly joins the one its neighbours weigh most towards. Files are
 * visited in index order and ties go to the lowest label, which is what makes
 * it deterministic. Returns a cluster number per node, numbered from 0 by
 * first appearance.
 */
export function clusters(out: Adjacency): number[] {
  const both = undirected(out)
  // A hub's vote is divided by how many files it touches, otherwise one
  // utility used everywhere pulls every file into a single cluster.
  const reach = both.map((edges) => Math.max(1, edges.size))
  const label = out.map((_, i) => i)
  for (let round = 0; round < PROPAGATION_ROUNDS; round++) {
    let changed = false
    for (let i = 0; i < label.length; i++) {
      const best = vote(both[i]!, label, reach, label[i]!)
      if (best === label[i]) continue
      label[i] = best
      changed = true
    }
    if (!changed) break
  }
  const renumber = new Map<number, number>()
  return label.map((l) => {
    if (!renumber.has(l)) renumber.set(l, renumber.size)
    return renumber.get(l)!
  })
}

/** The label a file's neighbours weigh most towards; ties go to the lowest. */
function vote(
  neighbours: ReadonlyMap<number, number>,
  label: readonly number[],
  reach: readonly number[],
  current: number,
): number {
  const weight = new Map<number, number>()
  for (const [j, w] of neighbours) {
    weight.set(label[j]!, (weight.get(label[j]!) ?? 0) + w / reach[j]!)
  }
  let best = current
  let bestWeight = -1
  for (const [l, w] of weight) {
    if (w > bestWeight || (w === bestWeight && l < best)) {
      best = l
      bestWeight = w
    }
  }
  return best
}

/** Tarjan's bookkeeping, shared by the steps of one walk. */
interface Tarjan {
  readonly out: Adjacency
  readonly index: number[]
  readonly low: number[]
  readonly onStack: boolean[]
  readonly stack: number[]
  readonly found: number[][]
  counter: number
}

/** Numbers `v` and puts it on the stack: the walk has reached it. */
function enter(t: Tarjan, v: number): void {
  t.index[v] = t.low[v] = t.counter++
  t.stack.push(v)
  t.onStack[v] = true
}

/** Pops `v`'s component off the stack once `v` turns out to be its root. */
function close(t: Tarjan, v: number): void {
  if (t.low[v] !== t.index[v]) return
  const component: number[] = []
  let w: number
  do {
    w = t.stack.pop()!
    t.onStack[w] = false
    component.push(w)
  } while (w !== v)
  if (component.length > 1) t.found.push(component.sort((a, b) => a - b))
}

/** One depth-first walk from `root`, with an explicit stack of frames. */
function walk(t: Tarjan, root: number): void {
  // Each frame is a node and how far through its edges the walk has got.
  const frames: [number, number][] = [[root, 0]]
  enter(t, root)
  while (frames.length > 0) {
    const frame = frames.at(-1)!
    const v = frame[0]
    const next = t.out[v]![frame[1]++]
    if (next === undefined) {
      frames.pop()
      const parent = frames.at(-1)
      if (parent) t.low[parent[0]] = Math.min(t.low[parent[0]]!, t.low[v]!)
      close(t, v)
    } else if (t.index[next[0]] === -1) {
      enter(t, next[0])
      frames.push([next[0], 0])
    } else if (t.onStack[next[0]]) {
      t.low[v] = Math.min(t.low[v]!, t.index[next[0]]!)
    }
  }
}

/**
 * Dependency cycles: strongly connected components of two or more files,
 * largest first. Tarjan's algorithm, iterative so a deep graph cannot
 * overflow the stack.
 */
export function cycles(out: Adjacency): number[][] {
  const n = out.length
  const t: Tarjan = {
    out,
    index: Array.from({ length: n }, () => -1),
    low: Array.from({ length: n }, () => 0),
    onStack: Array.from({ length: n }, () => false),
    stack: [],
    found: [],
    counter: 0,
  }
  for (let root = 0; root < n; root++) if (t.index[root] === -1) walk(t, root)
  return t.found.sort((a, b) => b.length - a.length || a[0]! - b[0]!)
}
