/** Reading project rows, and the membership facts derived from `file_project`. */

import type { FilePath, ProjectNode } from '../model.ts'
import { FIDELITIES, named, PRECONDITION_CAUSES } from './enums.ts'
import type { Store } from './open.ts'

/**
 * The projects that contain the given files.
 *
 * What lets an answer report conditions for only the projects it touched, rather
 * than for the whole index: cal.com has 34 projects and 33 of them have nothing
 * to say about one `callers` answer.
 */
export function readProjectsForFiles(
  store: Store,
  paths: readonly FilePath[],
): Set<FilePath> {
  const found = new Set<FilePath>()
  if (paths.length === 0) return found
  const statement = store.db.prepare(
    `select distinct c.path from file_project fp
     join path f on f.id = fp.file_id
     join path c on c.id = fp.project_id
     where f.path = ?`,
  )
  for (const path of new Set(paths)) {
    for (const row of statement.all(path) as { path: string }[]) {
      found.add(row.path)
    }
  }
  return found
}

/** Per file, the project its facts were produced in. */
export function readCanonicalProjects(store: Store): Map<FilePath, FilePath> {
  const rows = store.db
    .prepare(
      `select f.path as file, c.path as project from file_project fp
       join path f on f.id = fp.file_id
       join path c on c.id = fp.project_id
       where fp.canonical = 1`,
    )
    .all() as { file: string; project: string }[]
  return new Map(rows.map((row) => [row.file, row.project]))
}

/**
 * The projects the index has membership for but no analysis of.
 *
 * ADR 0004's half-built index, in the vocabulary it already has: a project's row
 * appears only once its facts are in, so a project that owns files and has no row
 * is one a build never reached. Named here rather than inferred from drift,
 * because a project may glob files the tree walk never sees — anything under
 * `dist` or `.next` — and drift can only report what the walk found.
 */
export function readUnanalysedProjects(store: Store): FilePath[] {
  const rows = store.db
    .prepare(
      `select distinct c.path from file_project fp
       join path c on c.id = fp.project_id
       where not exists (select 1 from project r where r.path_id = fp.project_id)
       order by c.path`,
    )
    .all() as { path: string }[]
  return rows.map((row) => row.path)
}

/** Every file canonically owned by a project the index has no analysis of. */
export function readUnanalysedFiles(store: Store): FilePath[] {
  const rows = store.db
    .prepare(
      `select f.path from file_project fp
       join path f on f.id = fp.file_id
       where fp.canonical = 1
         and not exists (select 1 from project r where r.path_id = fp.project_id)
       order by f.path`,
    )
    .all() as { path: string }[]
  return rows.map((row) => row.path)
}

/**
 * How many files each project owns, from membership rather than from its row.
 *
 * A wave writes a project row for a project that may never have had one — the
 * repair of a half-built index does exactly that — and `rootFileCount` has to be
 * the project's size rather than the size of the wave.
 */
export function readMembershipCounts(store: Store): Map<FilePath, number> {
  const rows = store.db
    .prepare(
      `select c.path, count(*) as n from file_project fp
       join path c on c.id = fp.project_id
       where fp.canonical = 1
       group by c.path`,
    )
    .all() as { path: string; n: number }[]
  return new Map(rows.map((row) => [row.path, row.n]))
}

/**
 * The files a project owns, from membership rather than from a re-enumeration.
 *
 * What a project whose environment fingerprint moved re-extracts: ADR 0001 makes
 * a fingerprint change a full re-analysis of that project, and its files are the
 * ones the index credited to it.
 */
export function readProjectFiles(
  store: Store,
  configPaths: readonly FilePath[],
): FilePath[] {
  const found = new Set<FilePath>()
  const statement = store.db.prepare(
    `select f.path from file_project fp
     join path f on f.id = fp.file_id
     join path c on c.id = fp.project_id
     where c.path = ? and fp.canonical = 1`,
  )
  for (const configPath of configPaths) {
    for (const row of statement.all(configPath) as { path: string }[]) {
      found.add(row.path)
    }
  }
  return [...found].sort()
}

/** Every project the index describes, sorted by config path. */
export function readProjects(store: Store): ProjectNode[] {
  return (
    store.db
      .prepare(
        `select p.path, r.fidelity, r.root_file_count, r.analysed_at,
                r.fingerprint, r.cause, r.postinstall
         from project r join path p on p.id = r.path_id
         order by p.path`,
      )
      .all() as {
      path: string
      fidelity: number
      root_file_count: number
      analysed_at: string
      fingerprint: string
      cause: number | null
      postinstall: number
    }[]
  ).map((row) => ({
    configPath: row.path,
    fidelity: named(FIDELITIES, row.fidelity, 'fidelity'),
    rootFileCount: row.root_file_count,
    analysedAt: row.analysed_at,
    fingerprint: row.fingerprint,
    cause:
      row.cause === null
        ? null
        : named(PRECONDITION_CAUSES, row.cause, 'precondition cause'),
    postinstall: row.postinstall === 1,
  }))
}
