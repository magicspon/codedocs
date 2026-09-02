/** Reading call edges back, and `trace`'s batched breadth-first step. */

import type { CallEdge, CallSite, CallSource, SymbolId } from '../model.ts'
import type { Naming } from '../naming.ts'
import { ATTRIBUTIONS, DERIVATIONS, named, PROVENANCES } from './enums.ts'
import { compare, idOf } from './shared.ts'
import type { Store } from './open.ts'
import { nodeId } from './statements.ts'

/**
 * One `call_edge` row as SQLite hands it over, with both endpoints rejoined to
 * their atoms. A type rather than an interface because only a type literal gets
 * the implicit index signature that lets a `Record<string, SQLOutputValue>` be
 * asserted to it.
 */
type EdgeRow = {
  from_path: string
  from_descriptors: string
  to_path: string
  to_descriptors: string
  attribution: number
  file_path: string
  line: number
  provenance: number
  derivation: number
}

const EDGE_SELECT = `select
    fp.path as from_path, fn.descriptors as from_descriptors,
    tp.path as to_path, tn.descriptors as to_descriptors,
    e.attribution, ep.path as file_path, e.line, e.provenance, e.derivation
  from call_edge e
  join node fn on fn.id = e.from_id
  join path fp on fp.id = fn.path_id
  join node tn on tn.id = e.to_id
  join path tp on tp.id = tn.path_id
  join path ep on ep.id = e.path_id`

/** The site half of a row: what a path needs once it has named the endpoints. */
const toSite = (row: EdgeRow): CallSite => ({
  attribution: named(ATTRIBUTIONS, row.attribution, 'attribution'),
  file: row.file_path,
  line: row.line,
  provenance: named(PROVENANCES, row.provenance, 'provenance'),
  derivation: named(DERIVATIONS, row.derivation, 'derivation'),
})

const toEdge = (naming: Naming, row: EdgeRow): CallEdge => ({
  from: idOf(naming, row.from_path, row.from_descriptors),
  to: idOf(naming, row.to_path, row.to_descriptors),
  ...toSite(row),
})

/** ADR 0006's `(source, target, kind, site)` order, on the ids rather than the atoms. */
const byEndpoints = (a: CallEdge, b: CallEdge): number =>
  compare(a.from, b.from) ||
  compare(a.to, b.to) ||
  compare(a.file, b.file) ||
  a.line - b.line

/** Every call edge into a symbol, in ADR 0006's `(source, target, kind, site)` order. */
export function readCallersOf(store: Store, id: SymbolId): CallEdge[] {
  const to = nodeId(store.db, id)
  if (to === undefined) return []
  return (
    store.db.prepare(`${EDGE_SELECT} where e.to_id = ?`).all(to) as EdgeRow[]
  )
    .map((row) => toEdge(store.naming, row))
    .sort(byEndpoints)
}

/** Every call edge out of a symbol or file, in the same order. */
export function readCalleesOf(store: Store, id: CallSource): CallEdge[] {
  const from = nodeId(store.db, id)
  if (from === undefined) return []
  return (
    store.db
      .prepare(`${EDGE_SELECT} where e.from_id = ?`)
      .all(from) as EdgeRow[]
  )
    .map((row) => toEdge(store.naming, row))
    .sort(byEndpoints)
}

/** One outgoing relation from a symbol: the callee, and every site that calls it. */
export interface CalleeStep {
  readonly to: SymbolId
  readonly sites: readonly CallSite[]
}

/**
 * SQLite's default parameter ceiling is 32,766; a chunk well under it keeps one
 * statement small enough to plan quickly and bounds how many distinct parameter
 * counts — and so how many compiled statements — a walk can produce.
 */
const ID_CHUNK = 900

/**
 * Every call edge out of `ids`, grouped by source and then by callee.
 *
 * Batched because `trace` walks breadth-first: one query per level costs the
 * walk `depth` round trips rather than one per symbol it reaches. Grouping by
 * callee is what stops a path set exploding per call *instance* — two call sites
 * from A to B are one step carrying two sites, not two paths.
 */
export function readCalleeSteps(
  store: Store,
  ids: readonly CallSource[],
): Map<CallSource, CalleeStep[]> {
  const interned: number[] = []
  for (const id of ids) {
    const found = nodeId(store.db, id)
    if (found !== undefined) interned.push(found)
  }

  const edges: CallEdge[] = []
  for (let at = 0; at < interned.length; at += ID_CHUNK) {
    const chunk = interned.slice(at, at + ID_CHUNK)
    const rows = store.db
      .prepare(
        `${EDGE_SELECT} where e.from_id in (${chunk.map(() => '?').join(',')})`,
      )
      .all(...chunk) as EdgeRow[]
    for (const row of rows) edges.push(toEdge(store.naming, row))
  }
  edges.sort(byEndpoints)

  const grouped = new Map<CallSource, { to: SymbolId; sites: CallSite[] }[]>()
  for (const edge of edges) {
    let steps = grouped.get(edge.from)
    if (steps === undefined) {
      steps = []
      grouped.set(edge.from, steps)
    }
    // Sorted by `(from, to, …)`, so one callee's sites are contiguous and only
    // the last step can be the one to append to.
    const last = steps.at(-1)
    const site = {
      attribution: edge.attribution,
      file: edge.file,
      line: edge.line,
      provenance: edge.provenance,
      derivation: edge.derivation,
    }
    if (last?.to === edge.to) last.sites.push(site)
    else steps.push({ to: edge.to, sites: [site] })
  }
  return grouped
}
