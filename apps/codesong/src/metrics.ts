/**
 * Graph measures over a plain adjacency list. Kept apart from the atlas so
 * each can be tested on a five-node graph.
 */

/** Outgoing edges per node: `[target, weight]`. */
export type Adjacency = readonly (readonly (readonly [number, number])[])[]

const DAMPING = 0.85
const ITERATIONS = 40

/**
 * Weighted PageRank. A node matters when things that matter depend on it,
 * which is closer to "architectural anchor" than raw fan-in: a utility called
 * once by every leaf ranks below one called by the core.
 */
export function pageRank(out: Adjacency): number[] {
  const n = out.length
  if (n === 0) return []
  const totals = out.map((edges) => edges.reduce((sum, [, w]) => sum + w, 0))
  let rank = Array.from({ length: n }, () => 1 / n)
  for (let step = 0; step < ITERATIONS; step++) {
    const next = Array.from({ length: n }, () => (1 - DAMPING) / n)
    // Rank on nodes with no outgoing edges would leak away; spread it evenly.
    let dangling = 0
    for (let i = 0; i < n; i++) {
      const total = totals[i]!
      if (total === 0) {
        dangling += rank[i]!
        continue
      }
      for (const [to, w] of out[i]!)
        next[to]! += (DAMPING * rank[i]! * w) / total
    }
    const share = (DAMPING * dangling) / n
    rank = next.map((r) => r + share)
  }
  return rank
}

/**
 * Shortest distance from any entry point, where an entry point is a node
 * nothing depends on. Nodes only reachable through a cycle with no entry get
 * the deepest depth found, since they sit below everything that is reachable.
 */
export function depths(out: Adjacency, fanIn: readonly number[]): number[] {
  const depth = out.map(() => -1)
  let frontier: number[] = []
  for (let i = 0; i < out.length; i++) {
    if (fanIn[i] === 0) {
      depth[i] = 0
      frontier.push(i)
    }
  }
  let level = 0
  while (frontier.length > 0) {
    level++
    const next: number[] = []
    for (const from of frontier) {
      for (const [to] of out[from]!) {
        if (depth[to] !== -1) continue
        depth[to] = level
        next.push(to)
      }
    }
    frontier = next
  }
  const deepest = Math.max(0, ...depth)
  return depth.map((d) => (d === -1 ? deepest : d))
}

/**
 * Each value's rank as 0–1, ties sharing their average rank. Ranks rather than
 * the raw value so a repository of 300 files and one of 30,000 spread across
 * the same musical range.
 */
export function rankNormalise(values: readonly number[]): number[] {
  const n = values.length
  if (n <= 1) return values.map(() => 0.5)
  const order = values
    .map((v, i) => [v, i] as const)
    .sort((a, b) => a[0] - b[0])
  const result = Array.from({ length: n }, () => 0)
  let i = 0
  while (i < n) {
    let j = i
    while (j + 1 < n && order[j + 1]![0] === order[i]![0]) j++
    const shared = (i + j) / 2 / (n - 1)
    for (let k = i; k <= j; k++) result[order[k]![1]] = shared
    i = j + 1
  }
  return result
}
