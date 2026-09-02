/**
 * One prepared statement per database and SQL text, plus the two read-side
 * lookups every other read builds on.
 *
 * The two lookups below run once per file or per symbol rather than once per
 * query — a wave clears 185 files, a `trace` level looks up every live tail —
 * so compiling the same statement each time is pure overhead. SQLite reprepares
 * a cached statement itself when the schema changes underneath it.
 */

import type { DatabaseSync, StatementSync } from 'node:sqlite'

import type { CallSource, FilePath } from '../model.ts'
import { partsOf } from './shared.ts'

const statements = new WeakMap<DatabaseSync, Map<string, StatementSync>>()

export function prepared(db: DatabaseSync, sql: string): StatementSync {
  let byDatabase = statements.get(db)
  if (byDatabase === undefined) {
    byDatabase = new Map()
    statements.set(db, byDatabase)
  }
  let statement = byDatabase.get(sql)
  if (statement === undefined) {
    statement = db.prepare(sql)
    byDatabase.set(sql, statement)
  }
  return statement
}

/**
 * The id of an already-interned path, or `undefined`.
 *
 * The read-side counterpart, which never inserts: a query about a file the
 * index has never seen is an empty answer, not a new row.
 */
export function pathId(db: DatabaseSync, path: FilePath): number | undefined {
  return (
    db.prepare('select id from path where path = ?').get(path) as
      | { id: number }
      | undefined
  )?.id
}

/** The id of an already-interned node, or `undefined`. Never inserts. */
export function nodeId(db: DatabaseSync, id: CallSource): number | undefined {
  const [file, descriptors] = partsOf(id)
  const found = prepared(
    db,
    `select n.id from node n join path p on p.id = n.path_id
     where p.path = ? and n.descriptors = ?`,
  ).get(file, descriptors) as { id: number } | undefined
  return found?.id
}

/**
 * Atoms are never deleted, only added.
 *
 * A `path` or `node` row is referenced from tables a single file's clear does
 * not touch — an edge into a deleted file is stored under the *calling* file —
 * so collecting one would silently drop the rows still pointing at it. An
 * orphan atom is invisible to every read, since each read joins from the fact
 * to the atom; a cold rebuild is what collects them.
 */
