/**
 * The index: one SQLite file per working tree, holding one snapshot.
 *
 * ADR 0004 chose SQLite over a JSON blob on what scales rather than on what it
 * costs today — a cold process answers one `callers` question in 30 ms against
 * 110 ms, at 48 MB resident against 270 MB, and a two-file edit rewrites 6.8 ms
 * of rows rather than the whole file.
 *
 * This is not a decision to use SQLite's query engine. Operations read rows and
 * answer in code; nothing in the CLI surface may expose SQL, or SQLite becomes
 * an interface we cannot change.
 */

import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type {
  CallEdge,
  CallSource,
  FileNode,
  FilePath,
  ProjectNode,
  SymbolId,
  SymbolNode,
  UnresolvedCall,
} from './model.ts'

/**
 * Bumped whenever the shape below changes. A mismatch discards the index and
 * rebuilds cold — TypeScript's own builder does exactly this, and a migration's
 * failure mode is a subtly wrong index against a rebuild's failure mode of a wait.
 */
export const STORE_SCHEMA_VERSION = 1

/** Every table the index holds, for the drop-and-rebuild path and for clearing. */
const TABLES: readonly string[] = [
  'meta',
  'project',
  'file',
  'seen_file',
  'file_project',
  'symbol',
  'call_edge',
  'unresolved_call',
]

const DDL = `
create table if not exists meta (
  key text primary key,
  value text not null
) strict;

create table if not exists project (
  config_path text primary key,
  fidelity text not null,
  root_file_count integer not null,
  analysed_at text not null
) strict;

create table if not exists file (
  path text primary key,
  content_hash text not null,
  size integer not null,
  mtime_ms real not null
) strict;

create table if not exists seen_file (
  path text primary key
) strict;

create table if not exists file_project (
  file_path text not null,
  config_path text not null,
  canonical integer not null,
  primary key (file_path, config_path)
) strict;

create table if not exists symbol (
  id text primary key,
  name text not null,
  qualified text not null,
  kind text not null,
  file_path text not null,
  start integer not null,
  line integer not null,
  durable integer not null,
  callable integer not null
) strict;

create table if not exists call_edge (
  rowid_ integer primary key autoincrement,
  from_id text not null,
  from_kind text not null,
  to_id text not null,
  attribution text not null,
  file_path text not null,
  line integer not null,
  provenance text not null,
  derivation text not null
) strict;

create table if not exists unresolved_call (
  rowid_ integer primary key autoincrement,
  file_path text not null,
  line integer not null,
  cause text not null,
  name text
) strict;

create index if not exists symbol_name on symbol(name);
create index if not exists symbol_file on symbol(file_path);
create index if not exists call_edge_to on call_edge(to_id);
create index if not exists call_edge_from on call_edge(from_id);
`

/** What the index records about itself rather than about the code. */
export interface IndexHeader {
  /** The commit the snapshot describes, or `null` outside a repository. */
  readonly commit: string | null
  /** ISO timestamp of the most recent analysis, or `null` for an empty index. */
  readonly analysedAt: string | null
  readonly toolVersion: string
  readonly typescriptVersion: string
}

/** A handle on one working tree's index. */
export interface Store {
  readonly db: DatabaseSync
  readonly directory: string
  close(): void
}

/**
 * Open (and create, if absent) the index for a working tree.
 *
 * `.codedocs/.gitignore` containing `*` makes the whole directory invisible to
 * `git status` without the user editing anything. The directory is safe to
 * delete: that is the supported way to force a cold build.
 */
export function openStore(root: string): Store {
  const directory = join(root, '.codedocs')
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, '.gitignore'), '*\n')

  const db = new DatabaseSync(join(directory, 'index.db'))
  // WAL so a reader in another process is never shown a half-written index,
  // only an older consistent one.
  db.exec('pragma journal_mode = wal')
  db.exec('pragma foreign_keys = on')

  const found = readUserVersion(db)
  if (found !== 0 && found !== STORE_SCHEMA_VERSION) {
    // Discarded, never migrated. Dropping the tables is enough: the caller's
    // next `analyse` rebuilds, and a rebuild is unconditionally correct.
    for (const table of TABLES) {
      db.exec(`drop table if exists ${table}`)
    }
  }
  db.exec(DDL)
  db.exec(`pragma user_version = ${STORE_SCHEMA_VERSION}`)

  return {
    db,
    directory,
    close: () => db.close(),
  }
}

function readUserVersion(db: DatabaseSync): number {
  const row = db.prepare('pragma user_version').get() as
    | { user_version?: number }
    | undefined
  return row?.user_version ?? 0
}

/** Read the index header. */
export function readHeader(store: Store): IndexHeader {
  const meta = new Map<string, string>()
  for (const row of store.db.prepare('select key, value from meta').all() as {
    key: string
    value: string
  }[]) {
    meta.set(row.key, row.value)
  }
  return {
    commit: meta.get('commit') ?? null,
    analysedAt: meta.get('analysedAt') ?? null,
    toolVersion: meta.get('toolVersion') ?? 'unknown',
    typescriptVersion: meta.get('typescriptVersion') ?? 'unknown',
  }
}

/** Everything one analysis run writes. */
export interface AnalysisWrite {
  readonly projects: readonly ProjectNode[]
  readonly files: readonly FileNode[]
  /**
   * Every source file the tree walk saw, analysed or not.
   *
   * Without it, a file no tsconfig globs — a config script, a vendored bundle —
   * is absent from `file` and so looks newly added on every single query, which
   * makes drift permanent and a rebuild unconditional.
   */
  readonly seenFiles: readonly FilePath[]
  readonly filesByProject: ReadonlyMap<FilePath, readonly FilePath[]>
  readonly symbols: readonly SymbolNode[]
  readonly callEdges: readonly CallEdge[]
  readonly unresolvedCalls: readonly UnresolvedCall[]
  readonly header: IndexHeader
}

/**
 * Replace the index contents with one analysis run.
 *
 * The skeleton rewrites wholesale rather than per project. ADR 0004 chose
 * per-project commits so an interrupted 22.9 s build leaves a partial index
 * rather than nothing; that matters once the incremental wave exists to fill the
 * gap, and until then a partial index has no way to complete itself.
 *
 * TODO(#5): commit per project, and write only the files the wave touched.
 */
export function writeAnalysis(store: Store, write: AnalysisWrite): void {
  const { db } = store
  db.exec('begin immediate')
  try {
    for (const table of TABLES.filter((name) => name !== 'meta')) {
      db.exec(`delete from ${table}`)
    }

    writeProjects(db, write.projects)
    writeFiles(db, write.files, write.seenFiles)
    writeMembership(db, write.filesByProject)
    writeSymbols(db, write.symbols)
    writeCallEdges(db, write.callEdges)
    writeUnresolvedCalls(db, write.unresolvedCalls)
    writeMeta(db, write.header)

    db.exec('commit')
  } catch (error) {
    db.exec('rollback')
    throw error
  }
}

function writeProjects(
  db: DatabaseSync,
  projects: readonly ProjectNode[],
): void {
  const project = db.prepare(
    'insert into project (config_path, fidelity, root_file_count, analysed_at) values (?, ?, ?, ?)',
  )
  for (const row of projects) {
    project.run(row.configPath, row.fidelity, row.rootFileCount, row.analysedAt)
  }
}

/** Analysed files and the wider tree walk together: `seen_file` is what keeps drift finite. */
function writeFiles(
  db: DatabaseSync,
  files: readonly FileNode[],
  seenFiles: readonly FilePath[],
): void {
  const file = db.prepare(
    'insert into file (path, content_hash, size, mtime_ms) values (?, ?, ?, ?)',
  )
  for (const row of files)
    file.run(row.path, row.contentHash, row.size, row.mtimeMs)

  const seen = db.prepare('insert or ignore into seen_file (path) values (?)')
  for (const path of seenFiles) seen.run(path)
}

function writeMembership(
  db: DatabaseSync,
  filesByProject: ReadonlyMap<FilePath, readonly FilePath[]>,
): void {
  const membership = db.prepare(
    'insert or ignore into file_project (file_path, config_path, canonical) values (?, ?, 1)',
  )
  for (const [configPath, paths] of filesByProject) {
    for (const path of paths) membership.run(path, configPath)
  }
}

function writeSymbols(db: DatabaseSync, symbols: readonly SymbolNode[]): void {
  const symbol = db.prepare(
    `insert or ignore into symbol
       (id, name, qualified, kind, file_path, start, line, durable, callable)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  for (const row of symbols) {
    symbol.run(
      row.id,
      row.name,
      row.qualified,
      row.kind,
      row.file,
      row.start,
      row.line,
      row.durable ? 1 : 0,
      row.callable ? 1 : 0,
    )
  }
}

function writeCallEdges(
  db: DatabaseSync,
  callEdges: readonly CallEdge[],
): void {
  const edge = db.prepare(
    `insert into call_edge
       (from_id, from_kind, to_id, attribution, file_path, line, provenance, derivation)
       values (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  for (const row of callEdges) {
    edge.run(
      row.from,
      row.attribution === 'file' ? 'file' : 'symbol',
      row.to,
      row.attribution,
      row.file,
      row.line,
      row.provenance,
      row.derivation,
    )
  }
}

function writeUnresolvedCalls(
  db: DatabaseSync,
  unresolvedCalls: readonly UnresolvedCall[],
): void {
  const unresolved = db.prepare(
    'insert into unresolved_call (file_path, line, cause, name) values (?, ?, ?, ?)',
  )
  for (const row of unresolvedCalls) {
    unresolved.run(row.file, row.line, row.cause, row.name)
  }
}

/** `meta` survives the clear, so every key is written rather than inserted. */
function writeMeta(db: DatabaseSync, header: IndexHeader): void {
  const meta = db.prepare(
    'insert or replace into meta (key, value) values (?, ?)',
  )
  meta.run('commit', header.commit ?? '')
  meta.run('analysedAt', header.analysedAt ?? '')
  meta.run('toolVersion', header.toolVersion)
  meta.run('typescriptVersion', header.typescriptVersion)
}

/** Every file the index describes, with the signature drift is detected against. */
export function readFiles(store: Store): FileNode[] {
  return (
    store.db
      .prepare('select path, content_hash, size, mtime_ms from file')
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
    'select distinct config_path from file_project where file_path = ?',
  )
  for (const path of new Set(paths)) {
    for (const row of statement.all(path) as { config_path: string }[]) {
      found.add(row.config_path)
    }
  }
  return found
}

/** Every source file the last analysis saw, whether or not a project globbed it. */
export function readSeenFiles(store: Store): Set<FilePath> {
  const rows = store.db.prepare('select path from seen_file').all() as {
    path: string
  }[]
  return new Set(rows.map((row) => row.path))
}

/** Every project the index describes, sorted by config path. */
export function readProjects(store: Store): ProjectNode[] {
  return (
    store.db
      .prepare(
        'select config_path, fidelity, root_file_count, analysed_at from project order by config_path',
      )
      .all() as {
      config_path: string
      fidelity: string
      root_file_count: number
      analysed_at: string
    }[]
  ).map((row) => ({
    configPath: row.config_path,
    fidelity: row.fidelity === 'typed' ? 'typed' : 'syntactic',
    rootFileCount: row.root_file_count,
    analysedAt: row.analysed_at,
  }))
}

const toSymbol = (row: {
  id: string
  name: string
  qualified: string
  kind: string
  file_path: string
  start: number
  line: number
  durable: number
  callable: number
}): SymbolNode => ({
  id: row.id,
  name: row.name,
  qualified: row.qualified,
  kind: row.kind as SymbolNode['kind'],
  file: row.file_path,
  start: row.start,
  line: row.line,
  durable: row.durable === 1,
  callable: row.callable === 1,
})

const SYMBOL_COLUMNS =
  'id, name, qualified, kind, file_path, start, line, durable, callable'

/** Every symbol, sorted by id then path — ADR 0006's total order for `symbol`. */
export function readSymbols(store: Store): SymbolNode[] {
  return (
    store.db
      .prepare(`select ${SYMBOL_COLUMNS} from symbol order by id, file_path`)
      .all() as Parameters<typeof toSymbol>[0][]
  ).map(toSymbol)
}

/** One symbol by exact id, or `undefined`. */
export function readSymbol(store: Store, id: SymbolId): SymbolNode | undefined {
  const row = store.db
    .prepare(`select ${SYMBOL_COLUMNS} from symbol where id = ?`)
    .get(id) as Parameters<typeof toSymbol>[0] | undefined
  return row === undefined ? undefined : toSymbol(row)
}

const EDGE_COLUMNS =
  'from_id, to_id, attribution, file_path, line, provenance, derivation'

const toEdge = (row: {
  from_id: string
  to_id: string
  attribution: string
  file_path: string
  line: number
  provenance: string
  derivation: string
}): CallEdge => ({
  from: row.from_id,
  to: row.to_id,
  attribution: row.attribution as CallEdge['attribution'],
  file: row.file_path,
  line: row.line,
  provenance: row.provenance as CallEdge['provenance'],
  derivation: row.derivation as CallEdge['derivation'],
})

/** Every call edge into a symbol, in ADR 0006's `(source, target, kind, site)` order. */
export function readCallersOf(store: Store, id: SymbolId): CallEdge[] {
  return (
    store.db
      .prepare(
        `select ${EDGE_COLUMNS} from call_edge where to_id = ?
         order by from_id, to_id, file_path, line`,
      )
      .all(id) as Parameters<typeof toEdge>[0][]
  ).map(toEdge)
}

/** Every call edge out of a symbol or file, in the same order. */
export function readCalleesOf(store: Store, id: CallSource): CallEdge[] {
  return (
    store.db
      .prepare(
        `select ${EDGE_COLUMNS} from call_edge where from_id = ?
         order by from_id, to_id, file_path, line`,
      )
      .all(id) as Parameters<typeof toEdge>[0][]
  ).map(toEdge)
}

/** How many rows the index holds, for `analyse` to report what it built. */
export function counts(store: Store): {
  symbols: number
  callEdges: number
  unresolved: number
} {
  const one = (sql: string): number =>
    (store.db.prepare(sql).get() as { n: number } | undefined)?.n ?? 0
  return {
    symbols: one('select count(*) as n from symbol'),
    callEdges: one('select count(*) as n from call_edge'),
    unresolved: one('select count(*) as n from unresolved_call'),
  }
}
