/** Reading file-scoped facts: signatures, export shapes, imports and the tree walk's own record. */

import type { FileNode, FilePath } from '../model.ts'
import type { Store } from './open.ts'
import { pathId } from './statements.ts'

/** Every file the index describes, with the signature drift is detected against. */
export function readFiles(store: Store): FileNode[] {
  return (
    store.db
      .prepare(
        `select p.path, f.content_hash, f.size, f.mtime_ms
         from file f join path p on p.id = f.path_id`,
      )
      .all() as {
      path: string
      content_hash: string
      size: number
      mtime_ms: number
    }[]
  ).map((row) => ({
    path: row.path,
    contentHash: row.content_hash,
    size: row.size,
    mtimeMs: row.mtime_ms,
  }))
}

/** Per file, the export-shape hash the wave gates propagation on. */
export function readExportShapes(store: Store): Map<FilePath, string> {
  const rows = store.db
    .prepare(
      `select p.path, f.export_shape_hash
       from file f join path p on p.id = f.path_id`,
    )
    .all() as { path: string; export_shape_hash: string }[]
  return new Map(rows.map((row) => [row.path, row.export_shape_hash]))
}

/**
 * The files that import any of the given ones.
 *
 * The wave's only propagation step, and the reason it stays small: a file whose
 * export shape moved reaches its direct importers, and reaches no further unless
 * their own shape moves too.
 */
export function readImporters(
  store: Store,
  paths: readonly FilePath[],
): Set<FilePath> {
  const found = new Set<FilePath>()
  if (paths.length === 0) return found
  const statement = store.db.prepare(
    `select distinct f.path from file_import i
     join path f on f.id = i.from_id
     where i.to_id = ?`,
  )
  for (const path of new Set(paths)) {
    const id = pathId(store.db, path)
    if (id === undefined) continue
    for (const row of statement.all(id) as { path: string }[]) {
      found.add(row.path)
    }
  }
  return found
}

/**
 * The files holding a relative import that resolved to nothing.
 *
 * A file appearing in the tree may be the one that completes such an import, and
 * the importer's own content did not change, so nothing else would put it in the
 * wave. Bare specifiers are never recorded, so this set stays small: it is the
 * repository's genuinely broken imports, not its package dependencies.
 */
export function readBrokenImporters(store: Store): Set<FilePath> {
  const rows = store.db
    .prepare(
      `select distinct f.path from file_import i
       join path f on f.id = i.from_id
       where i.to_id is null`,
    )
    .all() as { path: string }[]
  return new Set(rows.map((row) => row.path))
}

/** Every source file the last analysis saw, whether or not a project globbed it. */
export function readSeenFiles(store: Store): Set<FilePath> {
  const rows = store.db
    .prepare('select p.path from seen_file s join path p on p.id = s.path_id')
    .all() as { path: string }[]
  return new Set(rows.map((row) => row.path))
}
