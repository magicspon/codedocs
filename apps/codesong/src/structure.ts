/**
 * The code graph reduced to what the composer reads: one node per source file
 * with its fan-in, fan-out, depth and centrality, each also as a 0–1 rank.
 */

import { isTest, ROLES, type Atlas } from '@codedocs/code-art/atlas'
import { depths, pageRank, rankNormalise, type Adjacency } from './metrics.ts'

/** One source file and where it sits in the graph. */
export interface StructureNode {
  readonly path: string
  readonly project?: string
  /** Distinct files that call or import this one. */
  readonly fanIn: number
  /** Distinct files this one calls or imports. */
  readonly fanOut: number
  /** Steps from the nearest entry point. */
  readonly depth: number
  readonly centrality: number
  /** The four measures above as ranks, 0–1, comparable across repositories. */
  readonly rank: {
    readonly fanIn: number
    readonly fanOut: number
    readonly depth: number
    readonly centrality: number
  }
}

/** The graph the musical analysis reads. */
export interface Structure {
  readonly name: string
  readonly commit: string
  readonly nodes: readonly StructureNode[]
  /** Outgoing edges by node index, heaviest first. */
  readonly out: Adjacency
  /** Mean distinct dependencies per file. */
  readonly meanFanOut: number
  /** Share of files that depend on nothing: the graph's leaves. */
  readonly leafShare: number
}

/**
 * Directories that hold code about the code: test suites, fixtures and
 * benchmarks. `isTest` only knows test files by name, and a fixture repo's
 * `src/` would otherwise become a subsystem of its own.
 */
const HARNESS =
  /(^|\/)(tests?|__tests__|e2e|fixtures|__fixtures__|__mocks__|benchmarks?|testRunner)\//

/**
 * Keeps hand-written source only. Tests and generated code are real
 * structure, but they describe the code rather than make it up, and generated
 * files would let a codegen tool write the tune.
 */
function sourceFiles(atlas: Atlas): number[] {
  const kept: number[] = []
  atlas.files.forEach((file, i) => {
    if (file.generated || ROLES[file.role] === 'config') return
    if (isTest(file) || HARNESS.test(file.path)) return
    kept.push(i)
  })
  return kept
}

/** Calls and imports merged into one weighted adjacency over the kept files. */
function adjacency(
  atlas: Atlas,
  position: ReadonlyMap<number, number>,
): Adjacency {
  const weights = Array.from(
    { length: position.size },
    () => new Map<number, number>(),
  )
  for (const [from, to, n] of [...atlas.calls, ...atlas.imports]) {
    const a = position.get(from)
    const b = position.get(to)
    if (a === undefined || b === undefined || a === b) continue
    const edges = weights[a]!
    edges.set(b, (edges.get(b) ?? 0) + n)
  }
  // Heaviest first, then by index, so a walk that takes the first edge is
  // deterministic however the atlas ordered its links.
  return weights.map((edges) =>
    [...edges].sort((x, y) => y[1] - x[1] || x[0] - y[0]),
  )
}

/** Reads the structure of one exported atlas. */
export function readStructure(atlas: Atlas): Structure {
  const kept = sourceFiles(atlas)
  const position = new Map(kept.map((fileIndex, i) => [fileIndex, i]))
  const out = adjacency(atlas, position)

  const fanOut = out.map((edges) => edges.length)
  const fanIn = out.map(() => 0)
  for (const edges of out) for (const [to] of edges) fanIn[to]!++
  const depth = depths(out, fanIn)
  const centrality = pageRank(out)

  const ranks = {
    fanIn: rankNormalise(fanIn),
    fanOut: rankNormalise(fanOut),
    depth: rankNormalise(depth),
    centrality: rankNormalise(centrality),
  }
  const nodes = kept.map((fileIndex, i): StructureNode => {
    const file = atlas.files[fileIndex]!
    return {
      path: file.path,
      project: file.project >= 0 ? atlas.projects[file.project] : undefined,
      fanIn: fanIn[i]!,
      fanOut: fanOut[i]!,
      depth: depth[i]!,
      centrality: centrality[i]!,
      rank: {
        fanIn: ranks.fanIn[i]!,
        fanOut: ranks.fanOut[i]!,
        depth: ranks.depth[i]!,
        centrality: ranks.centrality[i]!,
      },
    }
  })

  const n = Math.max(1, nodes.length)
  return {
    name: atlas.name,
    commit: atlas.commit,
    nodes,
    out,
    meanFanOut: fanOut.reduce((a, b) => a + b, 0) / n,
    leafShare: fanOut.filter((f) => f === 0).length / n,
  }
}
