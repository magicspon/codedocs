/** Reading reference edges back — the relationship set minus `calls`. */

import type { CallSource, ReferenceEdge, SymbolId } from '../model.ts'
import {
  ATTRIBUTIONS,
  DERIVATIONS,
  named,
  PROVENANCES,
  REFERENCE_KINDS,
} from './enums.ts'
import type { Store } from './open.ts'
import { compare, idOf } from './shared.ts'
import { nodeId } from './statements.ts'

/** One `reference_edge` row with both endpoints rejoined to their atoms. */
type ReferenceRow = {
  from_path: string
  from_qualified: string
  to_path: string
  to_qualified: string
  kind: number
  attribution: number
  file_path: string
  line: number
  provenance: number
  derivation: number
}

const REFERENCE_SELECT = `select
    fp.path as from_path, fn.qualified as from_qualified,
    tp.path as to_path, tn.qualified as to_qualified,
    e.kind, e.attribution, ep.path as file_path, e.line, e.provenance,
    e.derivation
  from reference_edge e
  join node fn on fn.id = e.from_id
  join path fp on fp.id = fn.path_id
  join node tn on tn.id = e.to_id
  join path tp on tp.id = tn.path_id
  join path ep on ep.id = e.path_id`

const toReference = (row: ReferenceRow): ReferenceEdge => ({
  from: idOf(row.from_path, row.from_qualified),
  to: idOf(row.to_path, row.to_qualified),
  kind: named(REFERENCE_KINDS, row.kind, 'reference kind'),
  attribution: named(ATTRIBUTIONS, row.attribution, 'attribution'),
  file: row.file_path,
  line: row.line,
  provenance: named(PROVENANCES, row.provenance, 'provenance'),
  derivation: named(DERIVATIONS, row.derivation, 'derivation'),
})

/**
 * ADR 0006's `(source, target, kind, site)` order, taken literally.
 *
 * `kind` earns its place in the key here where it could not for call edges:
 * one symbol may both extend and reference another, and those are two facts
 * about the same pair.
 */
export const byReference = (a: ReferenceEdge, b: ReferenceEdge): number =>
  compare(a.from, b.from) ||
  compare(a.to, b.to) ||
  compare(a.kind, b.kind) ||
  compare(a.file, b.file) ||
  a.line - b.line

/** Every reference into a symbol, in `(source, target, kind, site)` order. */
export function readReferencesTo(store: Store, id: SymbolId): ReferenceEdge[] {
  const to = nodeId(store.db, id)
  if (to === undefined) return []
  return (
    store.db
      .prepare(`${REFERENCE_SELECT} where e.to_id = ?`)
      .all(to) as ReferenceRow[]
  )
    .map(toReference)
    .sort(byReference)
}

/** Every reference written inside a symbol or file, in the same order. */
export function readReferencesFrom(
  store: Store,
  id: CallSource,
): ReferenceEdge[] {
  const from = nodeId(store.db, id)
  if (from === undefined) return []
  return (
    store.db
      .prepare(`${REFERENCE_SELECT} where e.from_id = ?`)
      .all(from) as ReferenceRow[]
  )
    .map(toReference)
    .sort(byReference)
}
