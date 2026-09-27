/**
 * Dependency paths: chains of files where each one calls or imports the next.
 * A long chain is the nearest thing a code graph has to a melodic phrase.
 */

import type { Structure } from './structure.ts'

const MIN_LENGTH = 3
const MAX_LENGTH = 8

/**
 * From `start`, follows the heaviest edge to a file not yet on the path until
 * the chain is `MAX_LENGTH` long or runs out.
 */
function walk(structure: Structure, start: number): number[] {
  const path = [start]
  const seen = new Set(path)
  while (path.length < MAX_LENGTH) {
    const next = structure.out[path.at(-1)!]!.find(([to]) => !seen.has(to))
    if (next === undefined) break
    path.push(next[0])
    seen.add(next[0])
  }
  return path
}

/**
 * Up to `limit` dependency paths, starting from the most central files that
 * depend on something. A file already used to start a path is not reused, and
 * a path must share no more than half its files with an earlier one, so the
 * motifs describe different parts of the code rather than one busy route.
 */
export function dependencyPaths(
  structure: Structure,
  limit: number,
): number[][] {
  const starts = structure.nodes
    .map((node, i) => ({ i, node }))
    .filter(({ node }) => node.fanOut > 0)
    .sort((a, b) => b.node.centrality - a.node.centrality || a.i - b.i)
    .map(({ i }) => i)

  const paths: number[][] = []
  const used = new Set<number>()
  for (const start of starts) {
    if (paths.length >= limit) break
    const path = walk(structure, start)
    if (path.length < MIN_LENGTH) continue
    const shared = path.filter((i) => used.has(i)).length
    if (shared > path.length / 2) continue
    for (const i of path) used.add(i)
    paths.push(path)
  }
  return paths
}
