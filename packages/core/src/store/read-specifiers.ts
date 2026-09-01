/** Reading unresolved specifiers back, scoped to an answer's files or to the whole index. */

import type { FilePath, UnresolvedSpecifier } from '../model.ts'
import { named, PRECONDITION_CAUSES } from './enums.ts'
import type { Store } from './open.ts'

/**
 * Every unresolved specifier written against the given files.
 *
 * Filtered here rather than in the operation, because ADR 0009 scopes these to
 * the answer's own result: cal.com `apps/web`'s 576 have no business on a
 * `callers` answer over three files of `packages/lib`.
 */
export function readUnresolvedSpecifiers(
  store: Store,
  files: readonly FilePath[],
): UnresolvedSpecifier[] {
  const found: UnresolvedSpecifier[] = []
  if (files.length === 0) return found
  const statement = store.db.prepare(
    `select u.specifier, u.line, u.cause from unresolved_specifier u
     join path p on p.id = u.path_id
     where p.path = ?`,
  )
  for (const file of new Set(files)) {
    for (const row of statement.all(file) as {
      specifier: string
      line: number
      cause: number
    }[]) {
      found.push({
        file,
        specifier: row.specifier,
        line: row.line,
        cause: named(PRECONDITION_CAUSES, row.cause, 'precondition cause'),
      })
    }
  }
  return found
}

/** Every unresolved specifier in the index, for the operations whose scope is the repository. */
export function readAllUnresolvedSpecifiers(
  store: Store,
): UnresolvedSpecifier[] {
  return (
    store.db
      .prepare(
        `select p.path, u.specifier, u.line, u.cause from unresolved_specifier u
         join path p on p.id = u.path_id
         order by p.path, u.line`,
      )
      .all() as {
      path: string
      specifier: string
      line: number
      cause: number
    }[]
  ).map((row) => ({
    file: row.path,
    specifier: row.specifier,
    line: row.line,
    cause: named(PRECONDITION_CAUSES, row.cause, 'precondition cause'),
  }))
}
