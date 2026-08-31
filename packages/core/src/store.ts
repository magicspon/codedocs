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
  CallSite,
  CallSource,
  FileNode,
  FilePath,
  ImportEdge,
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
export const STORE_SCHEMA_VERSION = 2

/** Every table the index holds, for the drop-and-rebuild path and for clearing. */
const TABLES: readonly string[] = [
  'meta',
  'project',
  'file',
  'seen_file',
  'file_project',
  'file_import',
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
  mtime_ms real not null,
  export_shape_hash text not null
) strict;

create table if not exists seen_file (
  path text primary key
) strict;

create table if not exists file_import (
  from_path text not null,
  specifier text not null,
  to_path text,
  primary key (from_path, specifier)
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

create index if not exists file_import_to on file_import(to_path);
create index if not exists symbol_name on symbol(name);
create index if not exists symbol_site on symbol(file_path, start);
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

/** The rows one file contributes, which the wave replaces wholesale. */
interface FileFacts {
  readonly files: readonly FileNode[]
  readonly exportShapes: ReadonlyMap<FilePath, string>
  readonly symbols: readonly SymbolNode[]
  readonly callEdges: readonly CallEdge[]
  readonly unresolvedCalls: readonly UnresolvedCall[]
  readonly importEdges: readonly ImportEdge[]
}

/** Everything one analysis run writes. */
export interface AnalysisWrite extends FileFacts {
  readonly projects: readonly ProjectNode[]
  /**
   * Every source file the tree walk saw, analysed or not.
   *
   * Without it, a file no tsconfig globs — a config script, a vendored bundle —
   * is absent from `file` and so looks newly added on every single query, which
   * makes drift permanent and a rebuild unconditional.
   */
  readonly seenFiles: readonly FilePath[]
  readonly filesByProject: ReadonlyMap<FilePath, readonly FilePath[]>
  readonly header: IndexHeader
}

/** One wave's worth of facts: the files it re-extracted, and where they belong. */
export interface WaveWrite extends FileFacts {
  /** The project each re-extracted file's facts were produced in. */
  readonly canonicalOf: ReadonlyMap<FilePath, FilePath>
  /** Fresh `analysedAt` for the projects the wave touched. */
  readonly projects: readonly ProjectNode[]
  readonly header: IndexHeader
}

/**
 * Replace the index contents with one analysis run.
 *
 * Committed per project, as ADR 0004 decided, so an interrupted build leaves a
 * partial index rather than nothing: a project's row appears only once its facts
 * are in, so finished projects are current and the rest are simply absent — which
 * the next run rebuilds and a query in between names as a blind spot.
 *
 * TODO(#30): extraction is still one pass over every project, so an interruption
 * during the analysis itself — the 22.9 s, against ~1 s of commits — still leaves
 * nothing. Extracting per project needs the cross-project symbol join to survive
 * being split, which is a larger change than the commit boundary.
 */
export function writeAnalysis(store: Store, write: AnalysisWrite): void {
  const { db } = store

  // The clear is its own transaction so a project's commit is never rolled back
  // by a later project's failure.
  transaction(db, () => {
    for (const table of TABLES.filter((name) => name !== 'meta')) {
      db.exec(`delete from ${table}`)
    }
    writeSeenFiles(db, write.seenFiles)
  })

  const owner = new Map<FilePath, FilePath>()
  for (const [configPath, paths] of write.filesByProject) {
    for (const path of paths) owner.set(path, configPath)
  }

  const grouped = groupByProject(write, owner)
  for (const project of write.projects) {
    const facts = grouped.get(project.configPath)
    transaction(db, () => {
      writeProject(db, project)
      writeMembership(db, project.configPath, facts?.files ?? [])
      if (facts) writeFileFacts(db, facts)
    })
  }

  // Anything no project claimed, so a fact is never silently dropped because its
  // file fell outside `filesByProject`.
  const orphans = grouped.get(UNOWNED)
  if (orphans) transaction(db, () => writeFileFacts(db, orphans))

  transaction(db, () => writeMeta(db, write.header))
}

/**
 * Retire the files that left the tree, and refresh the tree walk.
 *
 * Separate from `applyWave` because a deletion has to be applied even when it
 * starts no wave. Nobody imports a leaf file, so deleting one produces an empty
 * frontier — and a deletion that waited for a wave to carry it would be
 * rediscovered as drift on every query from then on.
 */
export function retireFiles(
  store: Store,
  deleted: readonly FilePath[],
  seenFiles: readonly FilePath[],
): void {
  const { db } = store
  transaction(db, () => {
    const file = db.prepare('delete from file where path = ?')
    const seen = db.prepare('delete from seen_file where path = ?')
    for (const path of deleted) {
      clearFile(db, path)
      file.run(path)
      seen.run(path)
    }
    writeSeenFiles(db, seenFiles)
  })
}

/**
 * Apply one wave: replace the rows of the files it re-extracted.
 *
 * Every file the wave named is cleared before anything is inserted, so a symbol
 * that moved within a file cannot survive as a duplicate under its old offset.
 */
export function applyWave(store: Store, write: WaveWrite): void {
  const { db } = store
  const grouped = groupByProject(write, write.canonicalOf)

  transaction(db, () => {
    for (const path of write.canonicalOf.keys()) clearFile(db, path)
  })

  for (const project of write.projects) {
    const facts = grouped.get(project.configPath)
    transaction(db, () => {
      writeProject(db, project)
      if (facts) {
        writeMembership(db, project.configPath, facts.files)
        writeFileFacts(db, facts)
      }
    })
  }

  writeHeader(store, write.header)
}

/** Stamp the index header. Its own transaction, so a repair that extracted
 * nothing — a lone deletion — still records that it ran. */
export function writeHeader(store: Store, header: IndexHeader): void {
  transaction(store.db, () => writeMeta(store.db, header))
}

/** The group for facts about a file no project claimed. Never a config path. */
const UNOWNED = ''

/** Split one run's flat fact arrays into the per-project commits ADR 0004 wants. */
function groupByProject(
  facts: FileFacts,
  owner: ReadonlyMap<FilePath, FilePath>,
): Map<FilePath, FactGroup> {
  const groups = new Map<FilePath, FactGroup>()
  const group = (path: FilePath): FactGroup => {
    const key = owner.get(path) ?? UNOWNED
    let found = groups.get(key)
    if (!found) {
      found = {
        files: [],
        exportShapes: new Map(),
        symbols: [],
        callEdges: [],
        unresolvedCalls: [],
        importEdges: [],
      }
      groups.set(key, found)
    }
    return found
  }

  for (const file of facts.files) {
    const into = group(file.path)
    into.files.push(file)
    into.exportShapes.set(file.path, facts.exportShapes.get(file.path) ?? '')
  }
  for (const row of facts.symbols) group(row.file).symbols.push(row)
  for (const row of facts.callEdges) group(row.file).callEdges.push(row)
  for (const row of facts.unresolvedCalls)
    group(row.file).unresolvedCalls.push(row)
  for (const row of facts.importEdges) group(row.from).importEdges.push(row)
  return groups
}

/** The mutable twin of `FileFacts`, for accumulating one project's rows. */
interface FactGroup {
  files: FileNode[]
  exportShapes: Map<FilePath, string>
  symbols: SymbolNode[]
  callEdges: CallEdge[]
  unresolvedCalls: UnresolvedCall[]
  importEdges: ImportEdge[]
}

/** Run one unit of work in an immediate transaction, rolling back on a throw. */
function transaction(db: DatabaseSync, work: () => void): void {
  db.exec('begin immediate')
  try {
    work()
    db.exec('commit')
  } catch (error) {
    db.exec('rollback')
    throw error
  }
}

/** Every row keyed to one file, so re-extraction cannot leave a stale duplicate. */
function clearFile(db: DatabaseSync, path: FilePath): void {
  db.prepare('delete from symbol where file_path = ?').run(path)
  db.prepare('delete from call_edge where file_path = ?').run(path)
  db.prepare('delete from unresolved_call where file_path = ?').run(path)
  db.prepare('delete from file_import where from_path = ?').run(path)
  db.prepare('delete from file_project where file_path = ?').run(path)
}

function writeProject(db: DatabaseSync, project: ProjectNode): void {
  db.prepare(
    `insert or replace into project
       (config_path, fidelity, root_file_count, analysed_at)
       values (?, ?, ?, ?)`,
  ).run(
    project.configPath,
    project.fidelity,
    project.rootFileCount,
    project.analysedAt,
  )
}

/** `seen_file` is what keeps drift finite; see `AnalysisWrite.seenFiles`. */
function writeSeenFiles(
  db: DatabaseSync,
  seenFiles: readonly FilePath[],
): void {
  const seen = db.prepare('insert or ignore into seen_file (path) values (?)')
  for (const path of seenFiles) seen.run(path)
}

function writeMembership(
  db: DatabaseSync,
  configPath: FilePath,
  files: readonly FileNode[],
): void {
  const membership = db.prepare(
    'insert or ignore into file_project (file_path, config_path, canonical) values (?, ?, 1)',
  )
  for (const file of files) membership.run(file.path, configPath)
}

/** One project's facts, in one transaction. */
function writeFileFacts(db: DatabaseSync, facts: FileFacts): void {
  writeFileRows(db, facts)
  writeSymbols(db, facts.symbols)
  writeCallEdges(db, facts.callEdges)
  writeUnresolvedCalls(db, facts.unresolvedCalls)
  writeImportEdges(db, facts.importEdges)
}

/** The file row carries both hashes: content for drift, export shape for the wave. */
function writeFileRows(db: DatabaseSync, facts: FileFacts): void {
  const file = db.prepare(
    `insert or replace into file
       (path, content_hash, size, mtime_ms, export_shape_hash)
       values (?, ?, ?, ?, ?)`,
  )
  for (const row of facts.files) {
    file.run(
      row.path,
      row.contentHash,
      row.size,
      row.mtimeMs,
      facts.exportShapes.get(row.path) ?? '',
    )
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

function writeImportEdges(
  db: DatabaseSync,
  importEdges: readonly ImportEdge[],
): void {
  const imported = db.prepare(
    'insert or replace into file_import (from_path, specifier, to_path) values (?, ?, ?)',
  )
  for (const row of importEdges) {
    imported.run(row.from, row.specifier, row.to)
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

/** Per file, the export-shape hash the wave gates propagation on. */
export function readExportShapes(store: Store): Map<FilePath, string> {
  const rows = store.db
    .prepare('select path, export_shape_hash from file')
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
    'select distinct from_path from file_import where to_path = ?',
  )
  for (const path of new Set(paths)) {
    for (const row of statement.all(path) as { from_path: string }[]) {
      found.add(row.from_path)
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
    .prepare('select distinct from_path from file_import where to_path is null')
    .all() as { from_path: string }[]
  return new Set(rows.map((row) => row.from_path))
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
  const row = store.db
    .prepare('select id from symbol where file_path = ? and start = ?')
    .get(path, start) as { id: string } | undefined
  return row?.id
}

/** Per file, the project its facts were produced in. */
export function readCanonicalProjects(store: Store): Map<FilePath, FilePath> {
  const rows = store.db
    .prepare(
      'select file_path, config_path from file_project where canonical = 1',
    )
    .all() as { file_path: string; config_path: string }[]
  return new Map(rows.map((row) => [row.file_path, row.config_path]))
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

/**
 * One `call_edge` row as SQLite hands it over. A type rather than an interface
 * because only a type literal gets the implicit index signature that lets a
 * `Record<string, SQLOutputValue>` be asserted to it.
 */
type EdgeRow = {
  from_id: string
  to_id: string
  attribution: string
  file_path: string
  line: number
  provenance: string
  derivation: string
}

/** The site half of a row: what a path needs once it has named the endpoints. */
const toSite = (row: EdgeRow): CallSite => ({
  attribution: row.attribution as CallSite['attribution'],
  file: row.file_path,
  line: row.line,
  provenance: row.provenance as CallSite['provenance'],
  derivation: row.derivation as CallSite['derivation'],
})

const toEdge = (row: EdgeRow): CallEdge => ({
  from: row.from_id,
  to: row.to_id,
  ...toSite(row),
})

/** Every call edge into a symbol, in ADR 0006's `(source, target, kind, site)` order. */
export function readCallersOf(store: Store, id: SymbolId): CallEdge[] {
  return (
    store.db
      .prepare(
        `select ${EDGE_COLUMNS} from call_edge where to_id = ?
         order by from_id, to_id, file_path, line`,
      )
      .all(id) as EdgeRow[]
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
      .all(id) as EdgeRow[]
  ).map(toEdge)
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
  const grouped = new Map<CallSource, { to: SymbolId; sites: CallSite[] }[]>()
  for (let at = 0; at < ids.length; at += ID_CHUNK) {
    const chunk = ids.slice(at, at + ID_CHUNK)
    const rows = store.db
      .prepare(
        `select ${EDGE_COLUMNS} from call_edge
         where from_id in (${chunk.map(() => '?').join(',')})
         order by from_id, to_id, file_path, line`,
      )
      .all(...chunk) as EdgeRow[]
    for (const row of rows) {
      let steps = grouped.get(row.from_id)
      if (steps === undefined) {
        steps = []
        grouped.set(row.from_id, steps)
      }
      // Rows arrive sorted by `(from_id, to_id, …)`, so one callee's sites are
      // contiguous and only the last step can be the one to append to.
      const last = steps.at(-1)
      if (last?.to === row.to_id) last.sites.push(toSite(row))
      else steps.push({ to: row.to_id, sites: [toSite(row)] })
    }
  }
  return grouped
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
