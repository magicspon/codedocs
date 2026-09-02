/**
 * Opening the TypeScript 7 backend and driving it across extractions.
 *
 * ADR 0002 makes this seam array-first — "facts for these N files", never "a
 * fact for this symbol" — because batching is a 17x effect that cannot be
 * retrofitted, and because it is what keeps the bet on an unstable API
 * reversible. `openAnalysis` is that contract taken literally: one open backend
 * that the incremental wave drives across several extractions, each naming its
 * own file set.
 *
 * Opens one API instance for all projects: the spike measured TypeScript 6
 * exhausting an 8 GB heap on cal.com's 31 projects, where TypeScript 7
 * completes the same work at 2.4 GB.
 */

import { API, type Project } from 'typescript/unstable/sync'

import { toRepoPath } from '../../discovery.ts'
import type { FilePath } from '../../model.ts'
import { namingFor } from '../../naming.ts'
import { sweepCallEdges } from './calls.ts'
import { sweepReferenceEdges } from './references.ts'
import { sweepExportShapes } from './export-shapes.ts'
import { sweepImports } from './imports.ts'
import { isRepoFile } from './shared.ts'
import { sweepSymbols } from './symbols.ts'
import type {
  AdapterResult,
  AnalysisSession,
  ExtractRequest,
  OwnedFile,
  View,
} from './types.ts'

/** An open backend the caller drives, with an internal extension for the cold path. */
interface InternalSession extends AnalysisSession {
  /** Every repository file of every open project. The cold path's file set. */
  everyFile(): readonly FilePath[]
  /**
   * Every open project's files, per project, each file credited to exactly one.
   *
   * **The iteration order is the ownership order**, because both come from the
   * same loop over projects sorted by config path: a file is claimed by the
   * first project whose program contains it, and the map is filled in that same
   * order. A cold build extracts project by project along this map, and that is
   * what lets a call leaving a project resolve against rows already committed.
   */
  filesByProject(): ReadonlyMap<FilePath, readonly FilePath[]>
}

/**
 * Analyse the given projects and return every fact they yield.
 *
 * The cold path, and a thin wrapper over one extraction covering every file the
 * projects contain. It exists so the whole-index rebuild and the incremental
 * wave cannot drift apart: they run the same sweeps over different file sets.
 *
 * @param root - Absolute path of the repository root.
 * @param configPaths - Repository-relative tsconfig paths to open.
 */
export function analyse(
  root: string,
  configPaths: readonly FilePath[],
): AdapterResult {
  const session = openAnalysis(root)
  try {
    session.openProjects(configPaths)
    const everything = [...session.everyFile()]
    return session.extract({ files: everything })
  } finally {
    session.close()
  }
}

/**
 * Open a backend and keep it open.
 *
 * @param root - Absolute path of the repository root.
 */
export function openAnalysis(root: string): InternalSession {
  const api = new API({ cwd: root })
  const opened = new Set<string>()
  const adopted = new Set<string>()
  // One per open backend: the manifests it reads do not move under an
  // extraction, and a cold build asks it once per file.
  const naming = namingFor(root)
  let view: View | undefined

  /**
   * Rebuild the view from a fresh snapshot.
   *
   * Only `getSourceFileNames` is called per project, never `getSourceFile`: the
   * names arrive in one response (29 ms for cal.com's 76,343) while fetching
   * every file costs 1.2 s. Paying that per file, on demand, is the whole reason
   * a bounded extraction is cheap.
   */
  const refresh = (): View => {
    const snapshot = api.updateSnapshot({
      openProjects: [...opened],
      openFiles: [...adopted],
    })
    const all = snapshot.getProjects()
    if (all.length === 0) {
      // An unrecognised `DocumentIdentifier` shape yields zero projects and no
      // error, so an empty list must be a hard failure rather than an empty index.
      throw new Error(`no projects opened from ${opened.size} tsconfig path(s)`)
    }

    const projects = [...all].sort((a, b) =>
      a.configFileName < b.configFileName
        ? -1
        : a.configFileName > b.configFileName
          ? 1
          : 0,
    )
    const configPaths = projects.map((project) =>
      toRepoPath(root, project.configFileName),
    )
    const repoPathOf = new Map<string, FilePath>()
    const programPathOf = new Map<FilePath, string>()
    const ownersOf = new Map<FilePath, Project[]>()
    const filesByProject = new Map<FilePath, readonly FilePath[]>()

    for (const [index, project] of projects.entries()) {
      const owned: FilePath[] = []
      for (const programPath of project.program.getSourceFileNames()) {
        if (!isRepoFile(programPath)) continue
        const path = toRepoPath(root, programPath)
        repoPathOf.set(programPath.toLowerCase(), path)
        programPathOf.set(path, programPath)
        const owners = ownersOf.get(path)
        if (owners === undefined) {
          // First project wins the canonical claim, and projects are sorted by
          // config path, so the choice is deterministic. A file shared between
          // two projects that contributed its symbols once and its call edges
          // twice would double every edge in it.
          ownersOf.set(path, [project])
          owned.push(path)
        } else {
          owners.push(project)
        }
      }
      owned.sort()
      filesByProject.set(configPaths[index]!, owned)
    }

    view = {
      projects,
      naming,
      configPaths,
      repoPathOf,
      programPathOf,
      ownersOf,
      filesByProject,
      emptyProjects: projects
        .filter((project) => project.rootFiles.length === 0)
        .map((project) => toRepoPath(root, project.configFileName))
        .sort(),
    }
    return view
  }

  const current = (): View => view ?? refresh()

  /** Add to the open set, and re-snapshot only if it actually grew. */
  const add = (into: Set<string>, values: readonly string[]): void => {
    let grew = false
    for (const value of values) {
      if (into.has(value)) continue
      into.add(value)
      grew = true
    }
    if (grew) view = undefined
  }

  return {
    openProjects(configPaths) {
      add(
        opened,
        configPaths.map((path) => `${root}/${path}`),
      )
    },

    adoptFiles(files) {
      add(
        adopted,
        files.map((path) => `${root}/${path}`),
      )
    },

    everyFile() {
      return [...current().programPathOf.keys()].sort()
    },

    filesByProject() {
      return current().filesByProject
    },

    extract(request) {
      return extractFrom(root, current(), request)
    },

    close() {
      api.close()
    },
  }
}

/**
 * Which project a file is analysed in.
 *
 * The index's recorded choice wins where that project is open, so a wave agrees
 * with the cold build; otherwise the first open project that contains the file
 * takes it, which is the same rule the cold build applies.
 */
function pickProject(
  view: View,
  path: FilePath,
  canonicalOf: ReadonlyMap<FilePath, FilePath> | undefined,
): Project | undefined {
  const owners = view.ownersOf.get(path)
  if (owners === undefined || owners.length === 0) return undefined
  const recorded = canonicalOf?.get(path)
  if (recorded === undefined) return owners[0]
  for (const [index, project] of view.projects.entries()) {
    if (view.configPaths[index] === recorded && owners.includes(project))
      return project
  }
  return owners[0]
}

/** The files a request names, each paired with the project it is analysed in. */
function ownedFiles(
  root: string,
  view: View,
  request: ExtractRequest,
): { files: OwnedFile[]; canonicalOf: Map<FilePath, FilePath> } {
  const files: OwnedFile[] = []
  const canonicalOf = new Map<FilePath, FilePath>()

  for (const path of [...new Set(request.files)].sort()) {
    const programPath = view.programPathOf.get(path)
    if (programPath === undefined) continue // No open project globs it.
    const project = pickProject(view, path, request.canonicalOf)
    if (!project) continue
    const sf = project.program.getSourceFile(programPath)
    if (!sf) continue
    const configPath = toRepoPath(root, project.configFileName)
    files.push({ programPath, path, sf, project, configPath })
    canonicalOf.set(path, configPath)
  }
  return { files, canonicalOf }
}

/** Run every sweep over one file set, and return the facts they produced. */
function extractFrom(
  root: string,
  view: View,
  request: ExtractRequest,
): AdapterResult {
  const { files, canonicalOf } = ownedFiles(root, view, request)

  const { nodes, byDeclaration, declarations } = sweepSymbols(
    files,
    view.naming,
  )
  const { callEdges, unresolvedCalls } = sweepCallEdges(
    files,
    view,
    byDeclaration,
    request.resolve,
  )

  const referenceEdges = sweepReferenceEdges(
    files,
    view,
    byDeclaration,
    request.resolve,
  )

  const imports = sweepImports(files, view)

  return {
    filesByProject: view.filesByProject,
    extracted: files.map((file) => file.path),
    canonicalOf,
    symbols: nodes,
    declarations,
    callEdges,
    referenceEdges,
    unresolvedCalls,
    importEdges: imports.edges,
    unresolvedSpecifiers: imports.unresolved,
    exportShapes: sweepExportShapes(files),
    emptyProjects: view.emptyProjects,
  }
}
