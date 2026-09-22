import type { FileDatum, Link } from './atlas.ts'
import type { Life, Series } from './series.ts'

/**
 * Tracing: find files by path, then follow the calls (or imports) out of them
 * and into them, hop by hop. A pure function of the data, so the scenes only
 * draw what this returns.
 *
 * Each edge carries a `slot`: when in the loop its pulse runs. Callers fire
 * first, farthest out, so the flow converges on the searched files; callees
 * fire after, so it fans back out. Read in order, the slots are data moving
 * through the system.
 */

/** Which way to follow links from the searched files. */
export type Direction = 'in' | 'out' | 'both'

/** Which links to follow. */
export type Via = 'calls' | 'imports'

/** What the search panel sets. */
export interface TraceQuery {
  readonly text: string
  readonly direction: Direction
  readonly via: Via
  /** Hops to follow, from `1`. */
  readonly depth: number
}

/** One link on the trace, always drawn from caller to callee. */
export interface TraceEdge {
  readonly from: number
  readonly to: number
  readonly weight: number
  /** `1` when it leads away from the searched files, `-1` when it leads towards them. */
  readonly flow: 1 | -1
  /** How many hops out its far end sits, from `1`. */
  readonly hop: number
  /** When its pulse runs, in `[0, slots)`. */
  readonly slot: number
  /** The frames both its files exist in. */
  readonly life: Life
}

/** A traced search. */
export interface Trace {
  /** The files the search matched, best first. */
  readonly roots: readonly number[]
  /** Every match, before the root cap; the panel lists these. */
  readonly matches: readonly number[]
  readonly edges: readonly TraceEdge[]
  /** Per file: `1` searched, `0.6` reached, `0` untouched. The scenes dim by it. */
  readonly focus: Float32Array
  /** Hops out from the searched files per file, or `-1`; the file panel reads it. */
  readonly hopOut: Int16Array
  readonly hopIn: Int16Array
  /** How many slots one loop of the pulses takes. */
  readonly slots: number
  /** The slot at which inbound light reaches the searched files and outbound light leaves. */
  readonly lead: number
}

/** Past this many roots a search is too broad to trace legibly. */
const MAX_ROOTS = 60
/** A hub can call hundreds of files; its heaviest links say enough. */
const MAX_FANOUT = 24
/** Enough edges to read as a flow, few enough to stay one draw. */
const MAX_EDGES = 1600

/**
 * Files whose path holds every space-separated term, ignoring case. An exact
 * path wins outright, so picking a file traces that file alone. A match in the
 * file name ranks ahead of one only in its folders.
 */
export function matchFiles(
  files: readonly FileDatum[],
  text: string,
): number[] {
  const query = text.trim()
  if (!query) return []
  const exact = files.findIndex((f) => f.path === query)
  if (exact >= 0) return [exact]
  const terms = query.toLowerCase().split(/\s+/)
  const scored: [number, number][] = []
  files.forEach((f, i) => {
    const path = f.path.toLowerCase()
    if (!terms.every((t) => path.includes(t))) return
    const name = path.slice(path.lastIndexOf('/') + 1)
    const inName = terms.filter((t) => name.includes(t)).length
    // More terms in the name first, then the shorter path: the likelier intent.
    scored.push([i, inName * 1000 - path.length])
  })
  return scored.sort((a, b) => b[1] - a[1]).map(([i]) => i)
}

/** Each file's links, heaviest first, one way round. */
function adjacency(
  links: readonly Link[],
  n: number,
  reverse: boolean,
): Link[][] {
  const out: Link[][] = Array.from({ length: n }, () => [])
  for (const link of links) out[reverse ? link[1] : link[0]]?.push(link)
  for (const list of out) list.sort((a, b) => b[2] - a[2])
  return out
}

/** One walk's progress: the hop each file was found at, and the edges kept. */
interface Walk {
  readonly hops: Int16Array
  readonly edges: [Link, number][]
}

/**
 * Takes one hop out of `frontier`, returning the files found. An edge is kept
 * when it reaches a file for the first time, or reaches one first found in
 * this same hop, so two parents of one file both show.
 */
function step(
  walked: Walk,
  frontier: readonly number[],
  next: readonly Link[][],
  hop: number,
  reverse: boolean,
  budget: { left: number },
): number[] {
  const found: number[] = []
  for (const link of frontier.flatMap((f) => next[f]!.slice(0, MAX_FANOUT))) {
    if (budget.left <= 0) break
    const far = reverse ? link[0] : link[1]
    if (walked.hops[far] === -1) {
      walked.hops[far] = hop
      found.push(far)
    }
    if (walked.hops[far] !== hop) continue
    walked.edges.push([link, hop])
    budget.left--
  }
  return found
}

/** Breadth-first from `roots` along `next`, `depth` hops, until the budget runs out. */
function walk(
  roots: readonly number[],
  next: readonly Link[][],
  depth: number,
  reverse: boolean,
  budget: { left: number },
): Walk {
  const walked: Walk = { hops: new Int16Array(next.length).fill(-1), edges: [] }
  for (const r of roots) walked.hops[r] = 0
  let frontier: readonly number[] = roots
  for (let hop = 1; hop <= depth && frontier.length > 0; hop++)
    frontier = step(walked, frontier, next, hop, reverse, budget)
  return walked
}

/** The frames both ends of a link exist in. */
function sharedLife(series: Series, from: number, to: number): Life {
  const [a0, a1] = series.fileLife[from]!
  const [b0, b1] = series.fileLife[to]!
  return [Math.max(a0, b0), Math.min(a1, b1)]
}

/** Traces `query` through `series`, or `null` when the search matches nothing. */
export function traceOf(series: Series, query: TraceQuery): Trace | null {
  const { files } = series.merged
  const matches = matchFiles(files, query.text)
  if (matches.length === 0) return null
  const roots = matches.slice(0, MAX_ROOTS)
  const links =
    query.via === 'calls' ? series.merged.calls : series.merged.imports
  const depth = Math.max(1, Math.round(query.depth))
  const budget = { left: MAX_EDGES }
  const none: Walk = { hops: new Int16Array(files.length).fill(-1), edges: [] }
  // Split the budget so one busy direction cannot starve the other.
  const share = query.direction === 'both' ? MAX_EDGES / 2 : MAX_EDGES
  const run = (reverse: boolean): Walk => {
    budget.left = share
    return walk(
      roots,
      adjacency(links, files.length, reverse),
      depth,
      reverse,
      budget,
    )
  }
  const out = query.direction === 'in' ? none : run(false)
  const into = query.direction === 'out' ? none : run(true)
  // Callers run their slots first, so the flow arrives before it leaves.
  const lead = query.direction === 'out' ? 0 : depth
  const edges: TraceEdge[] = [
    ...into.edges.map(([[from, to, weight], hop]) => ({
      from,
      to,
      weight,
      flow: -1 as const,
      hop,
      slot: lead - hop,
      life: sharedLife(series, from, to),
    })),
    ...out.edges.map(([[from, to, weight], hop]) => ({
      from,
      to,
      weight,
      flow: 1 as const,
      hop,
      slot: lead + hop - 1,
      life: sharedLife(series, from, to),
    })),
  ]
  const focus = new Float32Array(files.length)
  for (let i = 0; i < files.length; i++)
    if (out.hops[i]! > 0 || into.hops[i]! > 0) focus[i] = 0.6
  for (const r of roots) focus[r] = 1
  return {
    roots,
    matches,
    edges,
    focus,
    hopOut: out.hops,
    hopIn: into.hops,
    lead,
    slots: lead + (query.direction === 'in' ? 0 : depth),
  }
}
