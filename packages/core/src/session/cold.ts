/**
 * The cold build: re-analyse every project and replace the index contents.
 *
 * ADR 0004 wants an interrupted build to leave a partial index. Committing per
 * project was only half of that while every project was extracted before the
 * first commit: of cal.com's 16 s, the ~1 s of commits was interruptible and the
 * 15 s of analysis was not. Now each project is extracted and committed on its
 * own, so a project that finished is in the index and the rest read as
 * unanalysed files, which the next run repairs with a wave.
 */

import { type AnalysisSession, openAnalysis } from '../adapter/ts7/index.ts'
import type { Config } from '../config.ts'
import { currentCommit, discoverProjects } from '../discovery.ts'
import { statFile, walkSourceFiles } from '../drift.ts'
import type { FileNode, FilePath } from '../model.ts'
import {
  classifySpecifiers,
  preflightProjects,
  type ProjectPreflight,
} from '../preflight.ts'
import {
  beginAnalysis,
  commitProject,
  readSymbolIdAt,
  type Store,
} from '../store/index.ts'
import { projectRow } from './shared.ts'
import { TOOL_VERSION, typescriptVersion } from './version.ts'

/**
 * Re-analyse every project and replace the index contents.
 *
 * **What makes the split safe is the order.** A call leaving a project has no
 * in-memory symbol to join against, so it falls through to the index — the same
 * fallback the wave uses. The row is always there: the callee's declaration is
 * necessarily in the caller's own program, so the callee's file was claimed by a
 * project no later than the caller's, and `filesByProject` is iterated in the
 * order that claim was made. Verified rather than argued: extracting cal.com's
 * 34 projects one at a time produces a byte-identical index.
 */
export function rebuild(
  root: string,
  store: Store,
  config: Config,
): { kind: 'cold'; files: number; waves: number } {
  const configPaths = discoverProjects(root, config)
  if (configPaths.length === 0) return { kind: 'cold', files: 0, waves: 0 }

  // Preflight before anything is opened, over the same walk the index stores as
  // the files it has seen. ADR 0009 makes it the first phase unconditionally,
  // because signals 1-3 are `existsSync` work against a 12 s analysis.
  const seenFiles = walkSourceFiles(root)
  const preflight = preflightProjects(root, configPaths, seenFiles)

  const analysis = openAnalysis(root)
  try {
    analysis.openProjects(configPaths)
    const byProject = analysis.filesByProject()

    beginAnalysis(store, {
      seenFiles,
      filesByProject: byProject,
      header: {
        commit: currentCommit(root),
        analysedAt: new Date().toISOString(),
        toolVersion: TOOL_VERSION,
        typescriptVersion: typescriptVersion(),
      },
    })

    // Named explicitly rather than left to the adapter's own tie-break, so the
    // project a file is extracted in is the project this loop credits it to.
    const canonicalOf = new Map<FilePath, FilePath>()
    for (const [configPath, paths] of byProject) {
      for (const path of paths) canonicalOf.set(path, configPath)
    }

    // A project that globs nothing has no facts to wait for, so its row is
    // written before anything is extracted rather than whenever the loop happens
    // to reach it. ADR 0001 makes a config whose includes match no files a lower
    // fidelity rather than an absence, and that signal must survive an
    // interruption like any other project's. The same goes for a tsconfig that
    // was discovered but that the server returned no project for.
    for (const configPath of configPaths) {
      if ((byProject.get(configPath)?.length ?? 0) > 0) continue
      commitProject(store, {
        project: projectRow(preflight.get(configPath)!, 0),
        files: [],
        exportShapes: new Map(),
        symbols: [],
        declarations: [],
        callEdges: [],
        unresolvedCalls: [],
        importEdges: [],
        unresolvedSpecifiers: [],
      })
    }

    let extracted = 0
    for (const [configPath, owned] of byProject) {
      if (owned.length === 0) continue
      extracted += extractProject(root, store, analysis, {
        preflight: preflight.get(configPath)!,
        owned,
        canonicalOf,
      })
    }

    return { kind: 'cold', files: extracted, waves: 0 }
  } finally {
    analysis.close()
  }
}

/** One project's slice of the cold build. */
interface ProjectSlice {
  /** What preflight measured for this project before anything was opened. */
  readonly preflight: ProjectPreflight
  /** The files this project owns, which are the ones it extracts. */
  readonly owned: readonly FilePath[]
  /** Every file's owner, so a shared file is extracted where it is credited. */
  readonly canonicalOf: ReadonlyMap<FilePath, FilePath>
}

/**
 * Extract and commit one project. Returns how many files it produced facts for.
 *
 * `resolve` is what carries a call out of the project: the callee's rows are
 * already in the index, because its project was committed first.
 */
function extractProject(
  root: string,
  store: Store,
  analysis: AnalysisSession,
  slice: ProjectSlice,
): number {
  const result = analysis.extract({
    files: slice.owned,
    canonicalOf: slice.canonicalOf,
    resolve: (path, start) => readSymbolIdAt(store, path, start),
  })

  const files: FileNode[] = []
  for (const path of result.extracted) {
    const stats = statFile(root, path)
    if (stats) files.push(stats)
  }

  commitProject(store, {
    project: projectRow(slice.preflight, slice.owned.length),
    files,
    exportShapes: result.exportShapes,
    symbols: result.symbols,
    declarations: result.declarations,
    callEdges: result.callEdges,
    unresolvedCalls: result.unresolvedCalls,
    importEdges: result.importEdges,
    unresolvedSpecifiers: classifySpecifiers(
      root,
      result.unresolvedSpecifiers,
      result.canonicalOf,
    ),
  })

  return files.length
}
