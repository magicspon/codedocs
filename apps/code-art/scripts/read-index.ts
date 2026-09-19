/**
 * Reads one codedocs index into an `Atlas`.
 *
 * Reads the SQLite file directly and read-only rather than through
 * `@codedocs/core`: the art wants aggregates the operations never answer, and a
 * direct read also works on indexes from older schema versions, which the
 * store would discard and rebuild.
 */

import { DatabaseSync } from 'node:sqlite'
import type { Atlas, Link } from '../src/lib/atlas.ts'

/** vscode has ~200k file pairs that call each other; the faintest add nothing visible. */
const MAX_CALL_LINKS = 40_000
const MAX_IMPORT_LINKS = 60_000

/** How many links to keep; a timeline keeps fewer per frame because it keeps many frames. */
export interface Limits {
  readonly calls?: number
  readonly imports?: number
}

type Row = Record<string, number | string | null>

/** A `FileDatum` while it is being filled in. */
interface Mutable {
  path: string
  size: number
  kinds: number[]
  role: number
  generated: boolean
  project: number
  callsIn: number
  callsOut: number
  callsSelf: number
  refsIn: number
  unresolved: number
}

/** What every step below reads through. */
interface Reader {
  readonly all: (sql: string) => Row[]
  /** Rows from a table an older index may lack, which then simply reads as none. */
  readonly allIf: (table: string, sql: string) => Row[]
  readonly files: Mutable[]
  /** File position by `path.id`. */
  readonly byPathId: Map<number, number>
  readonly limits: Required<Limits>
}

function fileAt(reader: Reader, pathId: unknown): Mutable | undefined {
  const i = reader.byPathId.get(Number(pathId))
  return i === undefined ? undefined : reader.files[i]
}

function readFiles(all: Reader['all']): {
  files: Mutable[]
  byPathId: Map<number, number>
} {
  // Sorted by path so sibling files sit next to each other in every layout. A
  // path escaping the root is code the checker reached through a symlink, not
  // this repository's own.
  const rows = all(
    `select f.path_id as id, p.path, f.size from file f join path p on p.id = f.path_id
     where p.path not like '../%' order by p.path`,
  )
  const byPathId = new Map<number, number>()
  const files = rows.map((r, i): Mutable => {
    byPathId.set(Number(r.id), i)
    return {
      path: String(r.path),
      size: Number(r.size),
      kinds: [0, 0, 0, 0, 0, 0, 0, 0],
      role: 0,
      generated: false,
      project: -1,
      callsIn: 0,
      callsOut: 0,
      callsSelf: 0,
      refsIn: 0,
      unresolved: 0,
    }
  })
  return { files, byPathId }
}

function addSymbols(reader: Reader): void {
  for (const r of reader.all(
    'select path_id, kind, count(*) as n from symbol group by 1, 2',
  )) {
    const file = fileAt(reader, r.path_id)
    if (file) file.kinds[Number(r.kind)] = Number(r.n)
  }
}

function addLabels(reader: Reader): void {
  // A file's own labels sit on its node with empty descriptors.
  const rows = reader.allIf(
    'label',
    `select n.path_id, l.axis, l.value from label l join node n on n.id = l.node_id where n.descriptors = ''`,
  )
  for (const r of rows) {
    const file = fileAt(reader, r.path_id)
    if (!file) continue
    if (Number(r.axis) === 0) file.role = Number(r.value)
    else file.generated = Number(r.value) === 4
  }
}

function addProjects(reader: Reader): string[] {
  const projects = reader
    .all(
      'select p.path from project pr join path p on p.id = pr.path_id order by p.path',
    )
    .map((r) => String(r.path))
  const index = new Map(projects.map((path, i) => [path, i]))
  const rows = reader.all(
    `select fp.file_id, p.path from file_project fp join path p on p.id = fp.project_id where fp.canonical = 1`,
  )
  for (const r of rows) {
    const file = fileAt(reader, r.file_id)
    if (file) file.project = index.get(String(r.path)) ?? -1
  }
  return projects
}

function addCounts(reader: Reader): void {
  for (const r of reader.all(
    'select path_id, count(*) as n from unresolved_call group by 1',
  )) {
    const file = fileAt(reader, r.path_id)
    if (file) file.unresolved = Number(r.n)
  }
  const refs = reader.allIf(
    'reference_edge',
    'select n.path_id, count(*) as n from reference_edge e join node n on n.id = e.to_id group by 1',
  )
  for (const r of refs) {
    const file = fileAt(reader, r.path_id)
    if (file) file.refsIn = Number(r.n)
  }
}

/** Cross-file calls, heaviest first; calls inside one file are counted on it instead. */
function readCalls(reader: Reader): Link[] {
  const calls: Link[] = []
  const rows = reader.all(
    `select f.path_id as a, t.path_id as b, count(*) as n
     from call_edge c join node f on f.id = c.from_id join node t on t.id = c.to_id
     group by 1, 2 order by n desc`,
  )
  for (const r of rows) {
    const from = reader.byPathId.get(Number(r.a))
    const to = reader.byPathId.get(Number(r.b))
    if (from === undefined || to === undefined) continue
    const n = Number(r.n)
    if (from === to) {
      reader.files[from]!.callsSelf += n
      continue
    }
    reader.files[from]!.callsOut += n
    reader.files[to]!.callsIn += n
    if (calls.length < reader.limits.calls) calls.push([from, to, n])
  }
  return calls
}

function readImports(reader: Reader): Link[] {
  const imports: Link[] = []
  for (const r of reader.all(
    'select from_id, to_id from file_import where to_id is not null',
  )) {
    const from = reader.byPathId.get(Number(r.from_id))
    const to = reader.byPathId.get(Number(r.to_id))
    if (from === undefined || to === undefined || from === to) continue
    if (imports.length < reader.limits.imports) imports.push([from, to, 1])
  }
  return imports
}

/** Aggregates the index at `dbPath` to one row per file. */
export function readAtlas(
  dbPath: string,
  name: string,
  limits: Limits = {},
): Atlas {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    const tables = new Set(
      db
        .prepare(`select name from sqlite_master where type = 'table'`)
        .all()
        .map((row) => String(row.name)),
    )
    const all = (sql: string): Row[] => db.prepare(sql).all() as Row[]
    const allIf = (table: string, sql: string): Row[] =>
      tables.has(table) ? all(sql) : []
    const reader: Reader = {
      all,
      allIf,
      ...readFiles(all),
      limits: {
        calls: limits.calls ?? MAX_CALL_LINKS,
        imports: limits.imports ?? MAX_IMPORT_LINKS,
      },
    }

    addSymbols(reader)
    addLabels(reader)
    const projects = addProjects(reader)
    addCounts(reader)
    const calls = readCalls(reader)
    const meta = new Map(
      all('select key, value from meta').map((r) => [r.key, r.value]),
    )

    return {
      name,
      commit: String(meta.get('commit') ?? ''),
      analysedAt: String(meta.get('analysedAt') ?? ''),
      projects,
      files: reader.files,
      calls,
      imports: readImports(reader),
    }
  } finally {
    db.close()
  }
}
