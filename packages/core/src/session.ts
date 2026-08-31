/**
 * A session is one question's worth of index access: open the store, bring it up
 * to date, and assemble the honesty fields the envelope owes.
 *
 * ADR 0004 makes every query update before it answers. An answer that could not
 * be brought up to date — because the caller passed `--no-update` — is still
 * given, with the drifted files named as blind spots. Silence is the one
 * behaviour ruled out.
 */

import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

import { analyse as runAdapter } from './adapter/ts7.ts'
import {
  currentCommit,
  discoverProjects,
  findRepositoryRoot,
} from './discovery.ts'
import {
  detectDrift,
  driftedPaths,
  hasDrift,
  statFile,
  walkSourceFiles,
} from './drift.ts'
import type {
  AnswerContext,
  BlindSpot,
  ProjectConditions,
  Snapshot,
} from './envelope.ts'
import type { FileNode, Fidelity, FilePath, ProjectNode } from './model.ts'
import {
  openStore,
  readFiles,
  readHeader,
  readProjects,
  readSeenFiles,
  writeAnalysis,
  type Store,
} from './store.ts'

const require = createRequire(import.meta.url)

/** The tool's own version, which invalidates the index when it changes. */
export const TOOL_VERSION = '0.0.0'

/** The TypeScript version the index was built with. A change discards the index. */
export function typescriptVersion(): string {
  const pkg = require('typescript/package.json') as { version?: string }
  return pkg.version ?? 'unknown'
}

/** How a session was asked to treat an out-of-date index. */
export interface SessionOptions {
  readonly cwd: string
  /** When true, answer from the stored snapshot and name the drift instead. */
  readonly noUpdate: boolean
}

/** An open index, brought up to date as far as the caller allowed. */
export interface Session {
  readonly root: string
  readonly store: Store
  readonly context: AnswerContext
  close(): void
}

/**
 * Open the index for `cwd` and bring it up to date.
 *
 * The skeleton repairs drift by re-analysing every project rather than by
 * propagating a wave from the changed files. That is correct and slow: a
 * two-file edit costs a cold build. The wave is what makes it 3–5 ms.
 *
 * TODO(#5): propagate from the changed files through export-shape hashes
 * instead of rebuilding.
 */
export function openSession(options: SessionOptions): Session {
  const root = findRepositoryRoot(options.cwd)
  const store = openStore(root)

  const indexed = readFiles(store)
  const drift = detectDrift(root, indexed, readSeenFiles(store))
  const blindSpots: BlindSpot[] = []

  let projects = readProjects(store)
  const empty = indexed.length === 0

  if ((empty || hasDrift(drift)) && !options.noUpdate) {
    projects = rebuild(root, store)
  } else if (hasDrift(drift)) {
    for (const { path, reason } of driftedPaths(drift)) {
      blindSpots.push({
        subject: path,
        reason: `${reason}, and --no-update was passed`,
      })
    }
  } else if (empty) {
    blindSpots.push({
      subject: root,
      reason:
        'the index is empty and --no-update was passed; run `codedocs analyse`',
    })
  }

  const header = readHeader(store)
  const snapshot: Snapshot = {
    commit: header.commit === '' ? null : header.commit,
    // A snapshot is a commit plus whatever is uncommitted on top of it. After a
    // repair the tree and the index agree, so `dirty` is about drift we kept.
    dirty: options.noUpdate && hasDrift(drift),
    analysedAt: header.analysedAt === '' ? null : header.analysedAt,
  }

  return {
    root,
    store,
    context: {
      snapshot,
      conditions: projects.map(toConditions),
      blindSpots,
    },
    close: () => store.close(),
  }
}

const toConditions = (project: ProjectNode): ProjectConditions => ({
  project: project.configPath,
  fidelity: project.fidelity,
  analysedAt: project.analysedAt,
})

/**
 * Whether a project's dependencies are installed.
 *
 * The cheapest of ADR 0001's four signals, and the one that fires on the case
 * that matters most: a fresh clone type-checks without failing and returns `any`
 * everywhere. The other three — a declared `postinstall`, tsconfig globs that
 * match no files, and the measured unresolved-specifier ratio — are what catch
 * framework codegen, which is not an install step.
 *
 * TODO(#13): implement the remaining three signals and their remediations.
 */
function projectFidelity(
  root: string,
  configPath: FilePath,
  fileCount: number,
): Fidelity {
  // A tsconfig that globs nothing analysed nothing. ADR 0001 makes that a lower
  // fidelity rather than an error, and it is the third of its four signals: a
  // config whose includes match no files is usually waiting on codegen.
  if (fileCount === 0) return 'syntactic'
  let directory = join(root, dirname(configPath))
  for (;;) {
    if (existsSync(join(directory, 'node_modules'))) return 'typed'
    if (directory === root) return 'syntactic'
    const parent = dirname(directory)
    if (parent === directory) return 'syntactic'
    directory = parent
  }
}

/** Re-analyse every project and replace the index contents. */
export function rebuild(root: string, store: Store): ProjectNode[] {
  const configPaths = discoverProjects(root)
  if (configPaths.length === 0) return []

  const result = runAdapter(root, configPaths)
  const analysedAt = new Date().toISOString()

  const projects: ProjectNode[] = configPaths.map((configPath) => {
    const rootFileCount = result.filesByProject.get(configPath)?.length ?? 0
    return {
      configPath,
      fidelity: projectFidelity(root, configPath, rootFileCount),
      rootFileCount,
      analysedAt,
    }
  })

  const files: FileNode[] = []
  const seen = new Set<FilePath>()
  for (const paths of result.filesByProject.values()) {
    for (const path of paths) {
      if (seen.has(path)) continue
      seen.add(path)
      const stats = statFile(root, path)
      if (stats) files.push(stats)
    }
  }

  writeAnalysis(store, {
    projects,
    files,
    seenFiles: walkSourceFiles(root),
    filesByProject: result.filesByProject,
    symbols: result.symbols,
    callEdges: result.callEdges,
    unresolvedCalls: result.unresolvedCalls,
    header: {
      commit: currentCommit(root),
      analysedAt,
      toolVersion: TOOL_VERSION,
      typescriptVersion: typescriptVersion(),
    },
  })

  return projects
}
