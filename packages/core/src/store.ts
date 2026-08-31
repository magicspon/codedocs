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
 *
 * **Every string the model repeats is interned here and nowhere else.** A
 * `SymbolId` is `path#qualified`, so storing it verbatim wrote the path three
 * times per symbol and twice more per edge; the tables below hold integers and
 * the reads rebuild the strings. That is invisible above this module — the
 * operations still see `SymbolId` and `FilePath`, and every answer is byte for
 * byte the one the skeleton gave — and it takes cal.com from 61 MB to 17.6 MB,
 * which is the 20 MB ADR 0004 measured. `microsoft/vscode`, the ceiling test,
 * goes from 851 MB to 184 MB. No query got slower: `callers` on a 1,038-edge
 * hub is 2.6 ms warm either way, because the joins the interning adds are all
 * primary-key lookups.
 */

import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { DeclarationSite } from './adapter/ts7.ts'

import type {
  CallEdge,
  CallerAttribution,
  CallSite,
  CallSource,
  Derivation,
  Fidelity,
  FileNode,
  FilePath,
  ImportEdge,
  PreconditionCause,
  ProjectNode,
  Provenance,
  SymbolId,
  SymbolKind,
  SymbolNode,
  UnresolvedCall,
  UnresolvedCallCause,
  UnresolvedSpecifier,
} from './model.ts'

/**
 * Bumped whenever the shape below changes. A mismatch discards the index and
 * rebuilds cold — TypeScript's own builder does exactly this, and a migration's
 * failure mode is a subtly wrong index against a rebuild's failure mode of a wait.
 */
export const STORE_SCHEMA_VERSION = 7

/** Every table the index holds, for the drop-and-rebuild path and for clearing. */
const TABLES: readonly string[] = [
  'meta',
  'path',
  'node',
  'project',
  'file',
  'seen_file',
  'file_project',
  'file_import',
  'symbol',
  'declaration',
  'call_edge',
  'unresolved_call',
  'unresolved_specifier',
]

const DDL = `
create table if not exists meta (
  key text primary key,
  value text not null
) strict;

create table if not exists path (
  id integer primary key,
  path text not null unique
) strict;

create table if not exists node (
  id integer primary key,
  path_id integer not null,
  qualified text not null,
  unique (path_id, qualified)
) strict;

create table if not exists project (
  path_id integer primary key,
  fidelity integer not null,
  root_file_count integer not null,
  analysed_at text not null,
  fingerprint text not null,
  cause integer,
  postinstall integer not null
) strict;

create table if not exists file (
  path_id integer primary key,
  content_hash text not null,
  size integer not null,
  mtime_ms real not null,
  export_shape_hash text not null
) strict;

create table if not exists seen_file (
  path_id integer primary key
) strict;

create table if not exists file_import (
  from_id integer not null,
  specifier text not null,
  to_id integer,
  primary key (from_id, specifier)
) strict;

create table if not exists file_project (
  file_id integer not null,
  project_id integer not null,
  canonical integer not null,
  primary key (file_id, project_id)
) strict;

create table if not exists symbol (
  node_id integer primary key,
  path_id integer not null,
  name text not null,
  kind integer not null,
  start integer not null,
  line integer not null,
  durable integer not null,
  callable integer not null,
  collisions integer not null
) strict;

create table if not exists declaration (
  path_id integer not null,
  start integer not null,
  node_id integer not null,
  primary key (path_id, start)
) strict;

create table if not exists call_edge (
  rowid_ integer primary key autoincrement,
  from_id integer not null,
  to_id integer not null,
  attribution integer not null,
  path_id integer not null,
  line integer not null,
  provenance integer not null,
  derivation integer not null
) strict;

create table if not exists unresolved_call (
  rowid_ integer primary key autoincrement,
  path_id integer not null,
  line integer not null,
  cause integer not null,
  name text
) strict;

create table if not exists unresolved_specifier (
  rowid_ integer primary key autoincrement,
  path_id integer not null,
  specifier text not null,
  line integer not null,
  cause integer not null
) strict;

create index if not exists file_import_to on file_import(to_id);
create index if not exists symbol_name on symbol(name);
create index if not exists symbol_site on symbol(path_id, start);
create index if not exists call_edge_to on call_edge(to_id);
create index if not exists call_edge_from on call_edge(from_id);
`
// There is no separate index on `symbol(path_id)`: `symbol_site` leads with that
// column, so the file-scoped delete already uses it. The skeleton carried both,
// which cost 3.8 MB on cal.com and bought nothing.

/**
 * Closed enums are stored as their position in these lists rather than as text.
 * `unresolved_call.cause` alone repeated one of two words 91,674 times on
 * cal.com, and `call_edge` carried three such columns on every row.
 *
 * **Append only, never reorder.** The position is what the index holds, so
 * moving a name silently relabels every stored row. `store.test.ts` pins the
 * lists for that reason; changing one is a schema change and owes a version bump.
 */
const KINDS: readonly SymbolKind[] = [
  'function',
  'class',
  'interface',
  'typeAlias',
  'enum',
  'variable',
  'method',
  'namespace',
]
const ATTRIBUTIONS: readonly CallerAttribution[] = [
  'symbol',
  'variable',
  'file',
]
const PROVENANCES: readonly Provenance[] = [
  'deterministic',
  'syntactic',
  'inferred',
]
const DERIVATIONS: readonly Derivation[] = [
  'checker-signature',
  'checker-base-types',
  'heritage-clause',
  'jsx-element-rule',
  'shared-method-name',
  'manifest',
  'resolver',
]
const CAUSES: readonly UnresolvedCallCause[] = [
  'external',
  'unresolvable',
  'dynamic',
]
const FIDELITIES: readonly Fidelity[] = ['typed', 'syntactic']
const PRECONDITION_CAUSES: readonly PreconditionCause[] = [
  'unprepared',
  'missing-generated',
  'unmapped',
  'broken',
]

/** The closed lists, exposed only so a test can pin their order. */
export interface EnumCodes {
  readonly kind: readonly SymbolKind[]
  readonly attribution: readonly CallerAttribution[]
  readonly provenance: readonly Provenance[]
  readonly derivation: readonly Derivation[]
  readonly cause: readonly UnresolvedCallCause[]
  readonly fidelity: readonly Fidelity[]
  readonly preconditionCause: readonly PreconditionCause[]
}

/** The stored order of every closed enum, so a reorder fails a test. */
export const ENUM_CODES: EnumCodes = {
  kind: KINDS,
  attribution: ATTRIBUTIONS,
  provenance: PROVENANCES,
  derivation: DERIVATIONS,
  cause: CAUSES,
  fidelity: FIDELITIES,
  preconditionCause: PRECONDITION_CAUSES,
}

/** The stored code for one enum value. Throws rather than storing a wrong row. */
function code<T>(list: readonly T[], value: T, column: string): number {
  const at = list.indexOf(value)
  if (at === -1) throw new Error(`unknown ${column}: ${String(value)}`)
  return at
}

/** The enum value one stored code names. Throws rather than inventing one. */
function named<T>(list: readonly T[], stored: number, column: string): T {
  const value = list[stored]
  if (value === undefined) throw new Error(`unknown ${column} code: ${stored}`)
  return value
}

/**
 * The string form of an interned node.
 *
 * A file used as a call source is the node whose descriptor path is empty, so
 * one table addresses both halves of `CallSource` and `call_edge` needs no
 * column saying which namespace an endpoint came from.
 */
const idOf = (path: string, qualified: string): CallSource =>
  qualified === '' ? path : `${path}#${qualified}`

/**
 * Split a `CallSource` back into its file and its descriptor path.
 *
 * On the first `#`, which is what `resolveSubject` already assumes: a descriptor
 * path may contain one inside a string literal, a repository path may not.
 */
function partsOf(id: CallSource): [FilePath, string] {
  const at = id.indexOf('#')
  return at === -1 ? [id, ''] : [id.slice(0, at), id.slice(at + 1)]
}

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
    // Discarded, never migrated. Dropping the tables is enough for correctness:
    // the caller's next `analyse` rebuilds, and a rebuild is unconditionally
    // correct.
    for (const table of TABLES) {
      db.exec(`drop table if exists ${table}`)
    }
    // Dropped pages stay in the file as free pages, so without this an index
    // upgraded from the pre-interning schema would keep its 61 MB for ever and
    // hold 17 MB of rows in it. The cost is one rewrite of a file the next step
    // is about to spend 16 seconds refilling.
    db.exec('vacuum')
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

/**
 * The write-side intern caches, one per open store.
 *
 * Held beside the store rather than on it, so nothing above this module can
 * reach the id space: a `Store` is still a database handle and a directory.
 */
const interners = new WeakMap<Store, Interner>()

/** Turns the model's strings into the integers the tables hold. */
interface Interner {
  path(text: FilePath): number
  node(id: CallSource): number
  /** Forget everything, for when the rows those ids named have been deleted. */
  reset(): void
}

function internerFor(store: Store): Interner {
  let found = interners.get(store)
  if (found === undefined) {
    found = makeInterner(store.db)
    interners.set(store, found)
  }
  return found
}

/**
 * Read-then-insert, memoised per run.
 *
 * A wave mostly re-interns strings the index already holds, so the read comes
 * first; a cold build mostly inserts, and the memo means each distinct string is
 * looked up once however many rows repeat it.
 */
function makeInterner(db: DatabaseSync): Interner {
  const paths = new Map<string, number>()
  const nodes = new Map<string, number>()
  const selectPath = db.prepare('select id from path where path = ?')
  const insertPath = db.prepare('insert into path (path) values (?)')
  const selectNode = db.prepare(
    'select id from node where path_id = ? and qualified = ?',
  )
  const insertNode = db.prepare(
    'insert into node (path_id, qualified) values (?, ?)',
  )

  const path = (text: FilePath): number => {
    const cached = paths.get(text)
    if (cached !== undefined) return cached
    const found = selectPath.get(text) as { id: number } | undefined
    const id = found?.id ?? Number(insertPath.run(text).lastInsertRowid)
    paths.set(text, id)
    return id
  }

  const node = (id: CallSource): number => {
    const cached = nodes.get(id)
    if (cached !== undefined) return cached
    const [file, qualified] = partsOf(id)
    const pathId = path(file)
    const found = selectNode.get(pathId, qualified) as
      | { id: number }
      | undefined
    const nodeId =
      found?.id ?? Number(insertNode.run(pathId, qualified).lastInsertRowid)
    nodes.set(id, nodeId)
    return nodeId
  }

  return {
    path,
    node,
    reset: () => {
      paths.clear()
      nodes.clear()
    },
  }
}

/**
 * The id of an already-interned path, or `undefined`.
 *
 * The read-side counterpart, which never inserts: a query about a file the index
 * has never seen is an empty answer, not a new row.
 */
/**
 * One prepared statement per database and SQL text.
 *
 * The two helpers below run once per file or per symbol rather than once per
 * query — a wave clears 185 files, a `trace` level looks up every live tail — so
 * compiling the same statement each time is pure overhead. SQLite reprepares a
 * cached statement itself when the schema changes underneath it.
 */
const statements = new WeakMap<DatabaseSync, Map<string, StatementSync>>()

function prepared(db: DatabaseSync, sql: string): StatementSync {
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

function pathId(db: DatabaseSync, path: FilePath): number | undefined {
  return (
    db.prepare('select id from path where path = ?').get(path) as
      | { id: number }
      | undefined
  )?.id
}

/** The id of an already-interned node, or `undefined`. Never inserts. */
function nodeId(db: DatabaseSync, id: CallSource): number | undefined {
  const [file, qualified] = partsOf(id)
  const found = prepared(
    db,
    `select n.id from node n join path p on p.id = n.path_id
     where p.path = ? and n.qualified = ?`,
  ).get(file, qualified) as { id: number } | undefined
  return found?.id
}

/**
 * Atoms are never deleted, only added.
 *
 * A `path` or `node` row is referenced from tables a single file's clear does not
 * touch — an edge into a deleted file is stored under the *calling* file — so
 * collecting one would silently drop the rows still pointing at it. An orphan
 * atom is invisible to every read, since each read joins from the fact to the
 * atom; a cold rebuild is what collects them.
 */

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
  /** The declaration offsets the symbol rows cannot carry. See `declaration`. */
  readonly declarations: readonly DeclarationSite[]
  readonly callEdges: readonly CallEdge[]
  readonly unresolvedCalls: readonly UnresolvedCall[]
  readonly importEdges: readonly ImportEdge[]
  /**
   * ADR 0009's signal 4, per site and keyed by file.
   *
   * Per site because the wave's write unit is one file: a project-level count
   * would need read-modify-write across files, and would go wrong exactly where
   * ADR 0004 permits a partial build committed per project. Deduplicating 306
   * copies of one specifier into one fact is the operation's job.
   */
  readonly unresolvedSpecifiers: readonly UnresolvedSpecifier[]
}

/** One wave's worth of facts: the files it re-extracted, and where they belong. */
export interface WaveWrite extends FileFacts {
  /** The project each re-extracted file's facts were produced in. */
  readonly canonicalOf: ReadonlyMap<FilePath, FilePath>
  /** Fresh `analysedAt` for the projects the wave touched. */
  readonly projects: readonly ProjectNode[]
  readonly header: IndexHeader
}

/** What a cold build writes before it extracts anything project by project. */
export interface AnalysisStart {
  /**
   * Every source file the tree walk saw, analysed or not.
   *
   * Without it, a file no tsconfig globs — a config script, a vendored bundle —
   * is absent from `file` and so looks newly added on every single query, which
   * makes drift permanent and a rebuild unconditional.
   *
   * It is written here, before anything is extracted, and that is safe *because*
   * a half-built index is recognised by `readUnanalysedProjects` rather than by
   * drift: the files of a project a build never reached did not appear, they
   * were never analysed, and saying so is a different sentence.
   */
  readonly seenFiles: readonly FilePath[]
  /**
   * Every open project's files, per project.
   *
   * Written as membership before any project is extracted, so a project the
   * build never reached still says which project its files belong to — which is
   * what lets the repairing wave open the right projects rather than adopting
   * thousands of files it has no record of. No `file` rows come with it: `file`
   * is what drift is measured against, and a file whose project never finished
   * must read as unanalysed.
   */
  readonly filesByProject: ReadonlyMap<FilePath, readonly FilePath[]>
  readonly header: IndexHeader
}

/** One project's facts, committed on their own. */
export interface ProjectWrite extends FileFacts {
  readonly project: ProjectNode
}

/**
 * Empty the index and record what the build is about to do.
 *
 * The header is stamped **here** rather than at the end. A partial index is only
 * useful if the next run recognises it, and the next run reads the tool and
 * TypeScript versions from the header to decide whether the index is repairable
 * at all — an unstamped one is discarded whole, which is the outcome per-project
 * commits exist to avoid. When a project's own analysis ran is
 * `project.analysedAt`, which is per project and is what the envelope's
 * conditions report.
 */
export function beginAnalysis(store: Store, write: AnalysisStart): void {
  const { db } = store

  // Its own transaction so a project's commit is never rolled back by a later
  // project's failure.
  transaction(store, () => {
    for (const table of TABLES.filter((name) => name !== 'meta')) {
      db.exec(`delete from ${table}`)
    }
    // The ids the cache holds named rows that no longer exist.
    internerFor(store).reset()
    writeSeenFiles(store, write.seenFiles)
    writeMeta(db, write.header)
  })

  for (const [configPath, paths] of write.filesByProject) {
    transaction(store, () => writeMembershipPaths(store, configPath, paths))
  }
}

/**
 * Commit one project's facts.
 *
 * The project row is written last within the transaction and the whole thing is
 * atomic, so a project's row appears only once its facts are in: finished
 * projects are current, and the rest are simply absent — which the next run
 * repairs and a query in between names as a blind spot.
 */
export function commitProject(store: Store, write: ProjectWrite): void {
  transaction(store, () => {
    writeMembership(store, write.project.configPath, write.files)
    writeFileFacts(store, write)
    writeProject(store, write.project)
  })
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
  transaction(store, () => {
    const file = db.prepare('delete from file where path_id = ?')
    const seen = db.prepare('delete from seen_file where path_id = ?')
    for (const path of deleted) {
      const id = pathId(db, path)
      if (id === undefined) continue
      clearFile(db, id)
      file.run(id)
      seen.run(id)
    }
    writeSeenFiles(store, seenFiles)
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

  transaction(store, () => {
    for (const path of write.canonicalOf.keys()) {
      const id = pathId(db, path)
      if (id !== undefined) clearFile(db, id)
    }
  })

  for (const project of write.projects) {
    const facts = grouped.get(project.configPath)
    transaction(store, () => {
      writeProject(store, project)
      if (facts) {
        writeMembership(store, project.configPath, facts.files)
        writeFileFacts(store, facts)
      }
    })
  }

  writeHeader(store, write.header)
}

/** Stamp the index header. Its own transaction, so a repair that extracted
 * nothing — a lone deletion — still records that it ran. */
export function writeHeader(store: Store, header: IndexHeader): void {
  transaction(store, () => writeMeta(store.db, header))
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
        declarations: [],
        callEdges: [],
        unresolvedCalls: [],
        importEdges: [],
        unresolvedSpecifiers: [],
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
  for (const row of facts.declarations) group(row.file).declarations.push(row)
  for (const row of facts.callEdges) group(row.file).callEdges.push(row)
  for (const row of facts.unresolvedCalls)
    group(row.file).unresolvedCalls.push(row)
  for (const row of facts.importEdges) group(row.from).importEdges.push(row)
  for (const row of facts.unresolvedSpecifiers)
    group(row.file).unresolvedSpecifiers.push(row)
  return groups
}

/** The mutable twin of `FileFacts`, for accumulating one project's rows. */
interface FactGroup {
  files: FileNode[]
  exportShapes: Map<FilePath, string>
  symbols: SymbolNode[]
  declarations: DeclarationSite[]
  callEdges: CallEdge[]
  unresolvedCalls: UnresolvedCall[]
  importEdges: ImportEdge[]
  unresolvedSpecifiers: UnresolvedSpecifier[]
}

/**
 * Run one unit of work in an immediate transaction, rolling back on a throw.
 *
 * The intern cache is dropped on a rollback: the ids it holds were assigned by
 * inserts the rollback has just undone, and a later row referring to one would
 * point at nothing.
 */
function transaction(store: Store, work: () => void): void {
  const { db } = store
  db.exec('begin immediate')
  try {
    work()
    db.exec('commit')
  } catch (error) {
    db.exec('rollback')
    internerFor(store).reset()
    throw error
  }
}

/** Every row keyed to one file, so re-extraction cannot leave a stale duplicate. */
function clearFile(db: DatabaseSync, id: number): void {
  prepared(db, 'delete from symbol where path_id = ?').run(id)
  prepared(db, 'delete from declaration where path_id = ?').run(id)
  prepared(db, 'delete from call_edge where path_id = ?').run(id)
  prepared(db, 'delete from unresolved_call where path_id = ?').run(id)
  prepared(db, 'delete from unresolved_specifier where path_id = ?').run(id)
  prepared(db, 'delete from file_import where from_id = ?').run(id)
  prepared(db, 'delete from file_project where file_id = ?').run(id)
}

function writeProject(store: Store, project: ProjectNode): void {
  store.db
    .prepare(
      `insert or replace into project
       (path_id, fidelity, root_file_count, analysed_at, fingerprint, cause,
        postinstall)
       values (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      internerFor(store).path(project.configPath),
      code(FIDELITIES, project.fidelity, 'fidelity'),
      project.rootFileCount,
      project.analysedAt,
      project.fingerprint,
      project.cause === null
        ? null
        : code(PRECONDITION_CAUSES, project.cause, 'precondition cause'),
      project.postinstall ? 1 : 0,
    )
}

/**
 * Rewrite project rows without touching a fact.
 *
 * A project whose environment fingerprint moved is re-analysed, and its new
 * fingerprint has to reach the index even when the re-analysis extracted
 * nothing — a project that globs no files has no facts to carry it. Without
 * this, such a project would fingerprint as stale on every query for ever.
 */
export function refreshProjects(
  store: Store,
  projects: readonly ProjectNode[],
): void {
  transaction(store, () => {
    for (const project of projects) writeProject(store, project)
  })
}

/** `seen_file` is what keeps drift finite; see `AnalysisStart.seenFiles`. */
function writeSeenFiles(store: Store, seenFiles: readonly FilePath[]): void {
  const intern = internerFor(store)
  const seen = store.db.prepare(
    'insert or ignore into seen_file (path_id) values (?)',
  )
  for (const path of seenFiles) seen.run(intern.path(path))
}

function writeMembership(
  store: Store,
  configPath: FilePath,
  files: readonly FileNode[],
): void {
  writeMembershipPaths(
    store,
    configPath,
    files.map((file) => file.path),
  )
}

function writeMembershipPaths(
  store: Store,
  configPath: FilePath,
  paths: readonly FilePath[],
): void {
  const intern = internerFor(store)
  const project = intern.path(configPath)
  const membership = store.db.prepare(
    'insert or ignore into file_project (file_id, project_id, canonical) values (?, ?, 1)',
  )
  for (const path of paths) membership.run(intern.path(path), project)
}

/** One project's facts, in one transaction. */
function writeFileFacts(store: Store, facts: FileFacts): void {
  writeFileRows(store, facts)
  writeSymbols(store, facts.symbols)
  writeDeclarations(store, facts.declarations)
  writeCallEdges(store, facts.callEdges)
  writeUnresolvedCalls(store, facts.unresolvedCalls)
  writeImportEdges(store, facts.importEdges)
  writeUnresolvedSpecifiers(store, facts.unresolvedSpecifiers)
}

/** The file row carries both hashes: content for drift, export shape for the wave. */
function writeFileRows(store: Store, facts: FileFacts): void {
  const intern = internerFor(store)
  const file = store.db.prepare(
    `insert or replace into file
       (path_id, content_hash, size, mtime_ms, export_shape_hash)
       values (?, ?, ?, ?, ?)`,
  )
  for (const row of facts.files) {
    file.run(
      intern.path(row.path),
      row.contentHash,
      row.size,
      row.mtimeMs,
      facts.exportShapes.get(row.path) ?? '',
    )
  }
}

function writeSymbols(store: Store, symbols: readonly SymbolNode[]): void {
  const intern = internerFor(store)
  // `or ignore` is a safety net rather than the collapse: the adapter now emits
  // one row per id and says whether several declarations claim it.
  const symbol = store.db.prepare(
    `insert or ignore into symbol
       (node_id, path_id, name, kind, start, line, durable, callable,
        collisions)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  for (const row of symbols) {
    // `path_id` repeats the file already inside `node`, and is derived from the
    // same interning call so the two cannot disagree. It buys `symbol_site`,
    // which is what makes a file's rows deletable without a table scan.
    symbol.run(
      intern.node(row.id),
      intern.path(row.file),
      row.name,
      code(KINDS, row.kind, 'kind'),
      row.start,
      row.line,
      row.durable ? 1 : 0,
      row.callable ? 1 : 0,
      row.collisions,
    )
  }
}

/**
 * The declaration offsets a symbol row has no room for.
 *
 * ADR 0002 collapses overloads and declaration merging into one symbol, and the
 * row records the first declaration's offset. `readSymbolIdAt` joins on an
 * offset, so without these an edge into the *second* overload — or into the
 * static twin of an instance method — resolves in memory and nowhere else. That
 * cost 20 of `microsoft/vscode`'s 728,717 edges the moment a build stopped
 * holding every project in memory at once.
 */
function writeDeclarations(
  store: Store,
  declarations: readonly DeclarationSite[],
): void {
  const intern = internerFor(store)
  const site = store.db.prepare(
    'insert or ignore into declaration (path_id, start, node_id) values (?, ?, ?)',
  )
  for (const row of declarations) {
    site.run(intern.path(row.file), row.start, intern.node(row.id))
  }
}

function writeCallEdges(store: Store, callEdges: readonly CallEdge[]): void {
  const intern = internerFor(store)
  // No column says whether a source is a symbol or a file: a file source is the
  // node with an empty descriptor path, and `attribution` already names the case.
  const edge = store.db.prepare(
    `insert into call_edge
       (from_id, to_id, attribution, path_id, line, provenance, derivation)
       values (?, ?, ?, ?, ?, ?, ?)`,
  )
  for (const row of callEdges) {
    edge.run(
      intern.node(row.from),
      intern.node(row.to),
      code(ATTRIBUTIONS, row.attribution, 'attribution'),
      intern.path(row.file),
      row.line,
      code(PROVENANCES, row.provenance, 'provenance'),
      code(DERIVATIONS, row.derivation, 'derivation'),
    )
  }
}

function writeUnresolvedCalls(
  store: Store,
  unresolvedCalls: readonly UnresolvedCall[],
): void {
  const intern = internerFor(store)
  const unresolved = store.db.prepare(
    'insert into unresolved_call (path_id, line, cause, name) values (?, ?, ?, ?)',
  )
  for (const row of unresolvedCalls) {
    unresolved.run(
      intern.path(row.file),
      row.line,
      code(CAUSES, row.cause, 'cause'),
      row.name,
    )
  }
}

function writeImportEdges(
  store: Store,
  importEdges: readonly ImportEdge[],
): void {
  const intern = internerFor(store)
  const imported = store.db.prepare(
    'insert or replace into file_import (from_id, specifier, to_id) values (?, ?, ?)',
  )
  for (const row of importEdges) {
    imported.run(
      intern.path(row.from),
      row.specifier,
      row.to === null ? null : intern.path(row.to),
    )
  }
}

function writeUnresolvedSpecifiers(
  store: Store,
  specifiers: readonly UnresolvedSpecifier[],
): void {
  const intern = internerFor(store)
  const row = store.db.prepare(
    `insert into unresolved_specifier (path_id, specifier, line, cause)
     values (?, ?, ?, ?)`,
  )
  for (const specifier of specifiers) {
    row.run(
      intern.path(specifier.file),
      specifier.specifier,
      specifier.line,
      code(PRECONDITION_CAUSES, specifier.cause, 'precondition cause'),
    )
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

/** Every source file the last analysis saw, whether or not a project globbed it. */
export function readSeenFiles(store: Store): Set<FilePath> {
  const rows = store.db
    .prepare('select p.path from seen_file s join path p on p.id = s.path_id')
    .all() as { path: string }[]
  return new Set(rows.map((row) => row.path))
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
 * One `call_edge` row as SQLite hands it over, with both endpoints rejoined to
 * their atoms. A type rather than an interface because only a type literal gets
 * the implicit index signature that lets a `Record<string, SQLOutputValue>` be
 * asserted to it.
 */
type EdgeRow = {
  from_path: string
  from_qualified: string
  to_path: string
  to_qualified: string
  attribution: number
  file_path: string
  line: number
  provenance: number
  derivation: number
}

const EDGE_SELECT = `select
    fp.path as from_path, fn.qualified as from_qualified,
    tp.path as to_path, tn.qualified as to_qualified,
    e.attribution, ep.path as file_path, e.line, e.provenance, e.derivation
  from call_edge e
  join node fn on fn.id = e.from_id
  join path fp on fp.id = fn.path_id
  join node tn on tn.id = e.to_id
  join path tp on tp.id = tn.path_id
  join path ep on ep.id = e.path_id`

/** The site half of a row: what a path needs once it has named the endpoints. */
const toSite = (row: EdgeRow): CallSite => ({
  attribution: named(ATTRIBUTIONS, row.attribution, 'attribution'),
  file: row.file_path,
  line: row.line,
  provenance: named(PROVENANCES, row.provenance, 'provenance'),
  derivation: named(DERIVATIONS, row.derivation, 'derivation'),
})

const toEdge = (row: EdgeRow): CallEdge => ({
  from: idOf(row.from_path, row.from_qualified),
  to: idOf(row.to_path, row.to_qualified),
  ...toSite(row),
})

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** ADR 0006's `(source, target, kind, site)` order, on the ids rather than the atoms. */
const byEndpoints = (a: CallEdge, b: CallEdge): number =>
  compare(a.from, b.from) ||
  compare(a.to, b.to) ||
  compare(a.file, b.file) ||
  a.line - b.line

/** Every call edge into a symbol, in ADR 0006's `(source, target, kind, site)` order. */
export function readCallersOf(store: Store, id: SymbolId): CallEdge[] {
  const to = nodeId(store.db, id)
  if (to === undefined) return []
  return (
    store.db.prepare(`${EDGE_SELECT} where e.to_id = ?`).all(to) as EdgeRow[]
  )
    .map(toEdge)
    .sort(byEndpoints)
}

/** Every call edge out of a symbol or file, in the same order. */
export function readCalleesOf(store: Store, id: CallSource): CallEdge[] {
  const from = nodeId(store.db, id)
  if (from === undefined) return []
  return (
    store.db
      .prepare(`${EDGE_SELECT} where e.from_id = ?`)
      .all(from) as EdgeRow[]
  )
    .map(toEdge)
    .sort(byEndpoints)
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
  const interned: number[] = []
  for (const id of ids) {
    const found = nodeId(store.db, id)
    if (found !== undefined) interned.push(found)
  }

  const edges: CallEdge[] = []
  for (let at = 0; at < interned.length; at += ID_CHUNK) {
    const chunk = interned.slice(at, at + ID_CHUNK)
    const rows = store.db
      .prepare(
        `${EDGE_SELECT} where e.from_id in (${chunk.map(() => '?').join(',')})`,
      )
      .all(...chunk) as EdgeRow[]
    for (const row of rows) edges.push(toEdge(row))
  }
  edges.sort(byEndpoints)

  const grouped = new Map<CallSource, { to: SymbolId; sites: CallSite[] }[]>()
  for (const edge of edges) {
    let steps = grouped.get(edge.from)
    if (steps === undefined) {
      steps = []
      grouped.set(edge.from, steps)
    }
    // Sorted by `(from, to, …)`, so one callee's sites are contiguous and only
    // the last step can be the one to append to.
    const last = steps.at(-1)
    const site = {
      attribution: edge.attribution,
      file: edge.file,
      line: edge.line,
      provenance: edge.provenance,
      derivation: edge.derivation,
    }
    if (last?.to === edge.to) last.sites.push(site)
    else steps.push({ to: edge.to, sites: [site] })
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
