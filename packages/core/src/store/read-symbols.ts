/** Reading symbol rows back, and the one offset-keyed join a bounded extraction needs. */

import type { FilePath, SymbolId, SymbolNode } from '../model.ts'
import { KINDS, named } from './enums.ts'
import { compare, idOf, partsOf } from './shared.ts'
import type { Store } from './open.ts'
import { prepared, pathId } from './statements.ts'

/** One `symbol` row joined back to the strings the model uses. */
type SymbolRow = {
  path: string
  qualified: string
  name: string
  kind: number
  start: number
  line: number
  durable: number
  callable: number
  collisions: number
}

const toSymbol = (row: SymbolRow): SymbolNode => ({
  id: idOf(row.path, row.qualified),
  name: row.name,
  qualified: row.qualified,
  kind: named(KINDS, row.kind, 'kind'),
  file: row.path,
  start: row.start,
  line: row.line,
  durable: row.durable === 1,
  callable: row.callable === 1,
  collisions: row.collisions,
})

const SYMBOL_SELECT = `select p.path, n.qualified, s.name, s.kind, s.start,
    s.line, s.durable, s.callable, s.collisions
  from symbol s
  join node n on n.id = s.node_id
  join path p on p.id = s.path_id`

/**
 * Every symbol, sorted by id then path — ADR 0006's total order for `symbol`.
 *
 * Sorted here rather than in SQL because the key is the `SymbolId`, which is no
 * longer a stored column: ordering by `(path, qualified)` is close but not the
 * same relation, and ADR 0006 names the id itself. Sorting in JavaScript also
 * makes the store agree with `resolveSubject` and `trace`, which already order
 * ids by the same comparison.
 */
export function readSymbols(store: Store): SymbolNode[] {
  const rows = (store.db.prepare(SYMBOL_SELECT).all() as SymbolRow[]).map(
    toSymbol,
  )
  return rows.sort((a, b) => compare(a.id, b.id) || compare(a.file, b.file))
}

/** One symbol by exact id, or `undefined`. */
export function readSymbol(store: Store, id: SymbolId): SymbolNode | undefined {
  const [path, qualified] = partsOf(id)
  const row = store.db
    .prepare(`${SYMBOL_SELECT} where p.path = ? and n.qualified = ?`)
    .get(path, qualified) as SymbolRow | undefined
  return row === undefined ? undefined : toSymbol(row)
}

/**
 * Every symbol whose declared name is `name`, sorted by id then path.
 *
 * The keyed lookup ADR 0007 requires of the store for subject matching: a
 * linear scan would break the promise that continuity's cost is proportional to
 * the question rather than to the repository, so this reads through the
 * `symbol_name` index and the absence of that index should fail review.
 */
export function readSymbolsNamed(store: Store, name: string): SymbolNode[] {
  const rows = (
    prepared(store.db, `${SYMBOL_SELECT} where s.name = ?`).all(
      name,
    ) as SymbolRow[]
  ).map(toSymbol)
  return rows.sort((a, b) => compare(a.id, b.id) || compare(a.file, b.file))
}

/**
 * The `SymbolId` declared at one file offset, or `undefined`.
 *
 * The join a bounded extraction needs: a call from a re-extracted file into an
 * unchanged one has no in-memory symbol to match, and the unchanged file's rows
 * are current by definition.
 */
export function readSymbolIdAt(
  store: Store,
  path: FilePath,
  start: number,
): SymbolId | undefined {
  const id = pathId(store.db, path)
  if (id === undefined) return undefined
  const row = prepared(
    store.db,
    `select n.qualified from symbol s
     join node n on n.id = s.node_id
     where s.path_id = ? and s.start = ?`,
  ).get(id, start) as { qualified: string } | undefined
  if (row !== undefined) return idOf(path, row.qualified)

  // The offset belongs to a declaration the row could not carry: a later
  // overload, or the static twin of an instance method. Same symbol, same id.
  const extra = prepared(
    store.db,
    `select n.qualified from declaration d
     join node n on n.id = d.node_id
     where d.path_id = ? and d.start = ?`,
  ).get(id, start) as { qualified: string } | undefined
  return extra === undefined ? undefined : idOf(path, extra.qualified)
}
