/** The file-scoped reads `file` assembles: membership, declarations and imports. */

import type { FilePath, ImportEdge, SymbolNode } from '../model.ts'
import type { Store } from './open.ts'
import { readSymbols } from './read-symbols.ts'
import { pathId } from './statements.ts'

/** Which projects globbed a file, and which one produced its facts. */
export interface FileMembership {
  /** Every project that globs it, sorted by config path. */
  readonly projects: readonly FilePath[]
  /** The one its facts were produced in, or `null` where none is recorded. */
  readonly canonical: FilePath | null
}

/**
 * Every file the index has a row for, sorted.
 *
 * What a `file` subject resolves against: an operation may only name a file the
 * index actually holds, and a path that globs nothing is a different answer from
 * a path that was never seen.
 */
export function readIndexedFiles(store: Store): FilePath[] {
  const rows = store.db
    .prepare('select p.path from file f join path p on p.id = f.path_id')
    .all() as { path: string }[]
  return rows.map((row) => row.path).sort()
}

/**
 * The projects one file belongs to.
 *
 * A file may belong to several — a shared `packages/lib` file globbed by two
 * apps — and exactly one of those is where its facts were produced. Reporting
 * both is what makes a file's fidelity readable: the canonical project is the
 * one whose conditions apply to it.
 */
export function readMembershipOf(store: Store, path: FilePath): FileMembership {
  const id = pathId(store.db, path)
  if (id === undefined) return { projects: [], canonical: null }
  const rows = store.db
    .prepare(
      `select c.path, fp.canonical from file_project fp
       join path c on c.id = fp.project_id
       where fp.file_id = ?
       order by c.path`,
    )
    .all(id) as { path: string; canonical: number }[]
  return {
    projects: rows.map((row) => row.path),
    canonical: rows.find((row) => row.canonical === 1)?.path ?? null,
  }
}

/** Every symbol declared in one file, in the order `symbol` reports them. */
export function readSymbolsIn(store: Store, path: FilePath): SymbolNode[] {
  return readSymbols(store).filter((symbol) => symbol.file === path)
}

/** Every module specifier written in one file, with what it resolved to. */
export function readImportsOf(store: Store, path: FilePath): ImportEdge[] {
  const id = pathId(store.db, path)
  if (id === undefined) return []
  const rows = store.db
    .prepare(
      `select i.specifier, t.path as target from file_import i
       left join path t on t.id = i.to_id
       where i.from_id = ?
       order by i.specifier`,
    )
    .all(id) as { specifier: string; target: string | null }[]
  return rows.map((row) => ({
    from: path,
    specifier: row.specifier,
    to: row.target,
  }))
}
