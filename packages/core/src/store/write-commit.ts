/**
 * The write path: one transaction per commit, per ADR 0004's rule that a
 * project's row appears only once its facts are in.
 */

import type {
  CallEdge,
  FileNode,
  FilePath,
  ImportEdge,
  Label,
  ProjectNode,
  ReferenceEdge,
  SymbolNode,
  UnresolvedCall,
  UnresolvedSpecifier,
} from '../model.ts'
import type { DeclarationSite } from '../adapter/ts7/index.ts'
import { TABLES } from './schema.ts'
import { internerFor } from './interner.ts'
import { pathId, prepared } from './statements.ts'
import type { Store } from './open.ts'
import { type IndexHeader, writeMeta } from './header.ts'
import {
  type FileFacts,
  writeFileFacts,
  writeLabels,
  writeMembership,
  writeMembershipPaths,
  writeProject,
  writeSeenFiles,
} from './write-rows.ts'

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
function clearFile(store: Store, id: number): void {
  const { db } = store
  prepared(db, 'delete from symbol where path_id = ?').run(id)
  prepared(db, 'delete from declaration where path_id = ?').run(id)
  prepared(db, 'delete from call_edge where path_id = ?').run(id)
  prepared(db, 'delete from reference_edge where path_id = ?').run(id)
  prepared(db, 'delete from unresolved_call where path_id = ?').run(id)
  prepared(db, 'delete from unresolved_specifier where path_id = ?').run(id)
  prepared(db, 'delete from file_import where from_id = ?').run(id)
  prepared(db, 'delete from file_project where file_id = ?').run(id)
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
      clearFile(store, id)
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
      if (id !== undefined) clearFile(store, id)
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

/**
 * Replace the label set, in one transaction.
 *
 * Its own commit rather than part of a project's: the layer is computed over
 * every file the index holds, so it belongs to no single project and a partial
 * label set would be worse than none — a file with no rows reads as `source` and
 * `authored`, which is exactly what a half-written pass would claim.
 */
export function replaceLabels(store: Store, labels: readonly Label[]): void {
  transaction(store, () => writeLabels(store, labels))
}

/** Stamp the index header. Its own transaction, so a repair that extracted
 * nothing — a lone deletion — still records that it ran. */
export function writeHeader(store: Store, header: IndexHeader): void {
  transaction(store, () => writeMeta(store.db, header))
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

/** The group for facts about a file no project claimed. Never a config path. */
const UNOWNED = ''

/** The mutable twin of `FileFacts`, for accumulating one project's rows. */
interface FactGroup {
  files: FileNode[]
  exportShapes: Map<FilePath, string>
  symbols: SymbolNode[]
  declarations: DeclarationSite[]
  callEdges: CallEdge[]
  referenceEdges: ReferenceEdge[]
  unresolvedCalls: UnresolvedCall[]
  importEdges: ImportEdge[]
  unresolvedSpecifiers: UnresolvedSpecifier[]
}

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
        referenceEdges: [],
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
  byFile(facts, group)
  // The one family keyed by something else: an import edge belongs to the file
  // that wrote the specifier.
  for (const row of facts.importEdges) group(row.from).importEdges.push(row)
  return groups
}

/**
 * The fact families keyed by the file they describe.
 *
 * Apart from the rest because they share one key, which is what lets a family
 * be added here as a line rather than as another branch of the split itself.
 */
function byFile(facts: FileFacts, group: (path: FilePath) => FactGroup): void {
  for (const row of facts.symbols) group(row.file).symbols.push(row)
  for (const row of facts.declarations) group(row.file).declarations.push(row)
  for (const row of facts.callEdges) group(row.file).callEdges.push(row)
  for (const row of facts.referenceEdges)
    group(row.file).referenceEdges.push(row)
  for (const row of facts.unresolvedCalls)
    group(row.file).unresolvedCalls.push(row)
  for (const row of facts.unresolvedSpecifiers)
    group(row.file).unresolvedSpecifiers.push(row)
}
