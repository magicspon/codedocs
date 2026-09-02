/**
 * The adapter's own contract: the shape the store and the incremental wave
 * read (`AdapterResult`, `DeclarationSite`), the shape a caller drives one
 * open backend with (`AnalysisSession`, `ExtractRequest`), and the internal
 * view of the open projects every extraction reads (`View`, `OwnedFile`).
 */

import type { Project } from 'typescript/unstable/sync'
import type { SourceFile } from 'typescript/unstable/ast'

import type {
  CallEdge,
  FilePath,
  ImportEdge,
  ReferenceEdge,
  SpecifierSite,
  SymbolId,
  SymbolNode,
  UnresolvedCall,
} from '../../model.ts'

/** One declaration's offset, and the symbol it declares. */
export interface DeclarationSite {
  readonly file: FilePath
  /** Byte offset of the declaration. */
  readonly start: number
  readonly id: SymbolId
}

/** Everything one extraction produced, ready for the store. */
export interface AdapterResult {
  /**
   * Repository-relative paths of every file the open projects contain, per
   * project — whether or not this extraction looked at them.
   *
   * The cold build's view of the tree. A wave opens a subset of the projects, so
   * it must write membership from `canonicalOf` instead or it would drop the
   * files of every project it did not open.
   */
  readonly filesByProject: ReadonlyMap<FilePath, readonly FilePath[]>
  /** The files this extraction actually produced facts for. */
  readonly extracted: readonly FilePath[]
  /** The one project each extracted file's facts were produced in. */
  readonly canonicalOf: ReadonlyMap<FilePath, FilePath>
  readonly symbols: readonly SymbolNode[]
  /**
   * Every declaration site an extracted symbol has beyond the one its row
   * carries — the second overload, the static twin of an instance method.
   *
   * ADR 0002 collapses those into one symbol deliberately, and the row records
   * one offset. A call resolving to any of the others has to find the same id,
   * so the offsets the row cannot hold are stored beside it.
   */
  readonly declarations: readonly DeclarationSite[]
  readonly callEdges: readonly CallEdge[]
  /**
   * Every place a symbol is named without being called.
   *
   * A separate sweep rather than a flag on the call sweep, because ADR 0002
   * keeps the two kinds apart: SCIP conflates them and that is why it was not
   * chosen as the producer.
   */
  readonly referenceEdges: readonly ReferenceEdge[]
  readonly unresolvedCalls: readonly UnresolvedCall[]
  readonly importEdges: readonly ImportEdge[]
  /**
   * Every module specifier that resolved to nothing, with no cause attached.
   *
   * ADR 0009's signal 4, and a by-product rather than a pass: the program is
   * open and module resolution is already done, which is why the whole scan is
   * 0.7 ms over `packages/lib`'s 1,282 specifiers. The cause is decided above
   * the adapter, because it is a question about the filesystem rather than about
   * the program.
   */
  readonly unresolvedSpecifiers: readonly SpecifierSite[]
  /**
   * Per extracted file, the hash of its resolved export surface.
   *
   * `''` means "assume it moved": the file is not a module, or its shape could
   * not be computed. The wave treats that as a change, so the failure mode is
   * one extra file re-extracted rather than a stale answer.
   */
  readonly exportShapes: ReadonlyMap<FilePath, string>
  /** Projects whose tsconfig globbed no files, so nothing could be analysed in them. */
  readonly emptyProjects: readonly FilePath[]
}

/**
 * Resolve a declaration site the current extraction did not sweep.
 *
 * The wave extracts a handful of files, so a call from one of them into an
 * unchanged file has no in-memory symbol to join against. The session supplies
 * the index as the fallback: the unchanged file's rows are current by
 * definition, which is what makes a bounded extraction produce whole edges.
 */
export type DeclarationResolver = (
  path: FilePath,
  start: number,
) => SymbolId | undefined

/** One extraction: which files, analysed where, joined against what. */
export interface ExtractRequest {
  readonly files: readonly FilePath[]
  /**
   * The project to analyse a file in, when the index already recorded one.
   *
   * Without it a wave that opened one project would credit a shared file to a
   * different project than the cold build did, and the same file would report a
   * different fidelity depending on which question reached it first.
   */
  readonly canonicalOf?: ReadonlyMap<FilePath, FilePath>
  readonly resolve?: DeclarationResolver
}

/** One open backend, driven across as many extractions as the wave needs. */
export interface AnalysisSession {
  /**
   * Ensure these tsconfigs are open. Opens are ref-counted and persist across
   * snapshots, so a wave that crosses into a new project only pays for that one.
   */
  openProjects(configPaths: readonly FilePath[]): void
  /**
   * Open these files so the server finds the tsconfig that contains them.
   *
   * For a file the index has never seen there is nothing to look its project up
   * in, and guessing the nearest ancestor tsconfig is a heuristic. The server
   * already does this search, and `getDefaultProjectForFile` reports the answer.
   */
  adoptFiles(files: readonly FilePath[]): void
  extract(request: ExtractRequest): AdapterResult
  close(): void
}

/** The view of the open projects that every extraction reads. */
export interface View {
  readonly projects: readonly Project[]
  /** Repository-relative config path of each open project, in the same order. */
  readonly configPaths: readonly FilePath[]
  /** Lower-cased program path to the canonical repository path. */
  readonly repoPathOf: ReadonlyMap<string, FilePath>
  /** Repository path to the program's own spelling of it. */
  readonly programPathOf: ReadonlyMap<FilePath, string>
  /** Every open project that contains a file, in config-path order. */
  readonly ownersOf: ReadonlyMap<FilePath, readonly Project[]>
  readonly filesByProject: ReadonlyMap<FilePath, readonly FilePath[]>
  readonly emptyProjects: readonly FilePath[]
}

/** One repository file, and the project both sweeps will analyse it in. */
export interface OwnedFile {
  /** The program's own path, which is what the checker hands back. */
  readonly programPath: string
  readonly path: FilePath
  readonly sf: SourceFile
  readonly project: Project
  readonly configPath: FilePath
}
