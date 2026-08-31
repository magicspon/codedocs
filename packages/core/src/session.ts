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

import { openAnalysis, type AnalysisSession } from './adapter/ts7.ts'
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
  type Drift,
} from './drift.ts'
import type {
  AnswerContext,
  BlindSpot,
  ProjectConditions,
  Snapshot,
} from './envelope.ts'
import type { FileNode, Fidelity, FilePath, ProjectNode } from './model.ts'
import {
  applyWave,
  openStore,
  readBrokenImporters,
  readCanonicalProjects,
  readExportShapes,
  readFiles,
  readHeader,
  readImporters,
  readProjects,
  readSeenFiles,
  readSymbolIdAt,
  retireFiles,
  writeAnalysis,
  writeHeader,
  type Store,
} from './store.ts'

const require = createRequire(import.meta.url)

/** The tool's own version, which invalidates the index when it changes. */
export const TOOL_VERSION = '0.0.0'

/**
 * How many waves may run before the repair gives up and rebuilds cold.
 *
 * A wave that keeps propagating is a bug in the shape hash, not a large edit:
 * ADR 0002 measured an id-based hash turning a body-only edit into 10 waves and
 * 1,436 of 3,000 files. A ceiling turns that failure into a slow answer rather
 * than a hung process, and `analyse` reports the fallback when it fires.
 */
const MAX_WAVES = 8

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
  /** What the repair actually did, for a test to pin and for `analyse` to report. */
  readonly repair: RepairReport | null
  close(): void
}

/** What one repair cost, in the only units that matter: files and waves. */
export interface RepairReport {
  readonly kind: 'cold' | 'wave'
  /** Files re-extracted. For a cold build, every file the projects contain. */
  readonly files: number
  /** How many propagation rounds ran. Always 0 for a cold build. */
  readonly waves: number
  /** Why a cold build was chosen over a wave, when one was. */
  readonly reason: string
}

/**
 * Open the index for `cwd` and bring it up to date.
 *
 * Content drift is repaired by a wave: re-extract the changed files, recompute
 * their export-shape hashes, and propagate to direct importers only where a hash
 * moved. A version change is the one thing that still rebuilds the whole index,
 * because a stale schema cannot be repaired file by file.
 */
export function openSession(options: SessionOptions): Session {
  const root = findRepositoryRoot(options.cwd)
  const store = openStore(root)

  const indexed = readFiles(store)
  const drift = detectDrift(root, indexed, readSeenFiles(store))
  const blindSpots: BlindSpot[] = []

  let projects = readProjects(store)
  let repair: RepairReport | null = null
  const header = readHeader(store)
  const stale = staleReason(header, indexed.length === 0)

  if (!options.noUpdate && (stale !== null || hasDrift(drift))) {
    repair =
      stale === null
        ? repairWave(root, store, drift)
        : { ...rebuild(root, store), reason: stale }
    projects = readProjects(store)
  } else if (hasDrift(drift)) {
    for (const { path, reason } of driftedPaths(drift)) {
      blindSpots.push({
        subject: path,
        reason: `${reason}, and --no-update was passed`,
      })
    }
  } else if (stale !== null) {
    blindSpots.push({
      subject: root,
      reason: `${stale}, and --no-update was passed; run \`codedocs analyse\``,
    })
  }

  const current = readHeader(store)
  const snapshot: Snapshot = {
    commit: current.commit === '' ? null : current.commit,
    // A snapshot is a commit plus whatever is uncommitted on top of it. After a
    // repair the tree and the index agree, so `dirty` is about drift we kept.
    dirty: options.noUpdate && hasDrift(drift),
    analysedAt: current.analysedAt === '' ? null : current.analysedAt,
  }

  return {
    root,
    store,
    context: {
      snapshot,
      conditions: projects.map(toConditions),
      blindSpots,
    },
    repair,
    close: () => store.close(),
  }
}

/**
 * Why the whole index must be rebuilt rather than repaired, or `null`.
 *
 * ADR 0004's index-wide invalidations. The schema version is not checked here:
 * `openStore` has already dropped the tables on a mismatch, which arrives at
 * this function as an empty index.
 */
function staleReason(
  header: ReturnType<typeof readHeader>,
  empty: boolean,
): string | null {
  if (empty) return 'the index is empty'
  if (header.toolVersion !== TOOL_VERSION) {
    return `the index was built by codedocs ${header.toolVersion}, not ${TOOL_VERSION}`
  }
  const typescript = typescriptVersion()
  if (header.typescriptVersion !== typescript) {
    return `the index was built against TypeScript ${header.typescriptVersion}, not ${typescript}`
  }
  return null
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

/**
 * Repair the index by propagating a wave from the drifted files.
 *
 * The wave is the whole point: re-extract the changed files, and reach a file's
 * importers only when its own export shape moved. ADR 0004 measured 3–5 ms for a
 * changed file against a 22.9 s cold build, because a body-only edit — the
 * commonest edit there is — settles in one wave and one file.
 */
function repairWave(root: string, store: Store, drift: Drift): RepairReport {
  const shapes = readExportShapes(store)
  const canonicalOf = readCanonicalProjects(store)
  const gone = new Set(drift.deleted)
  const seed = seedFrontier(store, drift, gone)

  // Applied before the wave runs, because a deleted leaf file starts no wave and
  // a deletion that waited for one would be rediscovered as drift for ever.
  retireFiles(store, drift.deleted, drift.seenFiles)

  const analysis = openAnalysis(root)
  try {
    const visited = new Set<FilePath>(gone)
    let pending = seed
    let waves = 0
    let extracted = 0

    while (pending.length > 0) {
      if (waves >= MAX_WAVES) {
        // Propagation that will not settle is a bug in the shape hash, not a
        // large edit. Falling back is honest and bounded; looping is neither.
        return {
          ...rebuild(root, store),
          reason: `the wave did not settle within ${MAX_WAVES} rounds`,
        }
      }
      waves += 1
      for (const path of pending) visited.add(path)

      const moved = runWave(root, store, analysis, pending, canonicalOf, shapes)
      extracted += moved.extracted

      pending = [...readImporters(store, moved.reshaped)].filter(
        (path) => !visited.has(path),
      )
    }

    // A repair that extracted nothing still happened: without the stamp, a lone
    // deletion would leave `analysedAt` reporting an older snapshot than the one
    // the index now holds.
    if (waves === 0) writeHeader(store, stamp(root))

    return { kind: 'wave', files: extracted, waves, reason: '' }
  } finally {
    analysis.close()
  }
}

/**
 * The files the first wave starts from.
 *
 * Changed and added files are obvious. The other two are not: a deleted file's
 * importers hold edges that are now dangling and nothing about their own content
 * says so, and a file appearing may be the one that completes a relative import
 * that is broken today.
 */
function seedFrontier(
  store: Store,
  drift: Drift,
  gone: ReadonlySet<FilePath>,
): FilePath[] {
  const frontier = new Set<FilePath>([...drift.changed, ...drift.added])
  for (const path of readImporters(store, drift.deleted)) frontier.add(path)
  if (drift.added.length > 0) {
    for (const path of readBrokenImporters(store)) frontier.add(path)
  }
  return [...frontier].filter((path) => !gone.has(path))
}

/** One round: extract the frontier, commit it, and report whose shape moved. */
function runWave(
  root: string,
  store: Store,
  analysis: AnalysisSession,
  pending: readonly FilePath[],
  canonicalOf: ReadonlyMap<FilePath, FilePath>,
  shapes: Map<FilePath, string>,
): { extracted: number; reshaped: FilePath[] } {
  openFor(analysis, pending, canonicalOf)
  const result = analysis.extract({
    files: pending,
    canonicalOf,
    resolve: (path, start) => readSymbolIdAt(store, path, start),
  })

  const files: FileNode[] = []
  for (const path of result.extracted) {
    const stats = statFile(root, path)
    if (stats) files.push(stats)
  }

  applyWave(store, {
    files,
    exportShapes: result.exportShapes,
    canonicalOf: result.canonicalOf,
    symbols: result.symbols,
    callEdges: result.callEdges,
    unresolvedCalls: result.unresolvedCalls,
    importEdges: result.importEdges,
    projects: touchedProjects(root, store, result.canonicalOf),
    header: stamp(root),
  })

  // The gate. A file whose export surface is unchanged cannot have changed what
  // its importers see, so the wave stops there.
  const reshaped: FilePath[] = []
  for (const path of result.extracted) {
    const shape = result.exportShapes.get(path) ?? ''
    if (shape !== (shapes.get(path) ?? '')) reshaped.push(path)
    shapes.set(path, shape)
  }
  return { extracted: result.extracted.length, reshaped }
}

/** The header one repair stamps on the index. */
const stamp = (root: string) => ({
  commit: currentCommit(root),
  analysedAt: new Date().toISOString(),
  toolVersion: TOOL_VERSION,
  typescriptVersion: typescriptVersion(),
})

/**
 * Open the projects the wave's next round needs, and no others.
 *
 * Opening one cal.com project is 130 ms against 1,654 ms for all 28, so scoping
 * the open set is most of what makes a warm answer fast. A file the index has
 * never seen has no recorded project, so the server is asked to find its
 * tsconfig rather than the nearest ancestor being guessed at here.
 */
function openFor(
  analysis: AnalysisSession,
  files: readonly FilePath[],
  canonicalOf: ReadonlyMap<FilePath, FilePath>,
): void {
  const projects: FilePath[] = []
  const unknown: FilePath[] = []
  for (const path of files) {
    const recorded = canonicalOf.get(path)
    if (recorded === undefined) unknown.push(path)
    else projects.push(recorded)
  }
  if (projects.length > 0) analysis.openProjects(projects)
  if (unknown.length > 0) analysis.adoptFiles(unknown)
}

/**
 * Fresh project rows for the projects a wave touched.
 *
 * `rootFileCount` is left as the index recorded it: a wave re-extracts files, it
 * does not re-enumerate a project, and overwriting the count with the size of the
 * wave would report a 3-file project where there are 3,000.
 */
function touchedProjects(
  root: string,
  store: Store,
  canonicalOf: ReadonlyMap<FilePath, FilePath>,
): ProjectNode[] {
  const known = new Map(
    readProjects(store).map((project) => [project.configPath, project]),
  )
  const analysedAt = new Date().toISOString()
  return [...new Set(canonicalOf.values())].sort().map((configPath) => {
    const existing = known.get(configPath)
    const rootFileCount = existing?.rootFileCount ?? 0
    return {
      configPath,
      fidelity:
        existing?.fidelity ?? projectFidelity(root, configPath, rootFileCount),
      rootFileCount,
      analysedAt,
    }
  })
}

/** Re-analyse every project and replace the index contents. */
export function rebuild(
  root: string,
  store: Store,
): { kind: 'cold'; files: number; waves: number } {
  const configPaths = discoverProjects(root)
  if (configPaths.length === 0) return { kind: 'cold', files: 0, waves: 0 }

  const analysis = openAnalysis(root)
  let result
  try {
    analysis.openProjects(configPaths)
    result = analysis.extract({ files: analysis.everyFile() })
  } finally {
    analysis.close()
  }
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
    exportShapes: result.exportShapes,
    seenFiles: walkSourceFiles(root),
    filesByProject: result.filesByProject,
    symbols: result.symbols,
    callEdges: result.callEdges,
    unresolvedCalls: result.unresolvedCalls,
    importEdges: result.importEdges,
    header: {
      commit: currentCommit(root),
      analysedAt,
      toolVersion: TOOL_VERSION,
      typescriptVersion: typescriptVersion(),
    },
  })

  return { kind: 'cold', files: files.length, waves: 0 }
}
