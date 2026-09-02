/**
 * Repairing the index by propagating a wave from the drifted files.
 *
 * The wave is the whole point: re-extract the changed files, and reach a file's
 * importers only when its own export shape moved. ADR 0004 measured 3–5 ms for a
 * changed file against a 22.9 s cold build, because a body-only edit — the
 * commonest edit there is — settles in one wave and one file.
 */

import { type AnalysisSession, openAnalysis } from '../adapter/ts7/index.ts'
import type { Config } from '../config/index.ts'
import type { Drift } from '../drift.ts'
import { statFile } from '../drift.ts'
import type { FileNode, FilePath, ProjectNode } from '../model.ts'
import {
  classifySpecifiers,
  preflightProjects,
  type ProjectPreflight,
} from '../preflight/index.ts'
import {
  applyWave,
  readBrokenImporters,
  readCanonicalProjects,
  readExportShapes,
  readImporters,
  readMembershipCounts,
  readProjectFiles,
  readProjects,
  readSymbolIdAt,
  readUnanalysedFiles,
  refreshProjects,
  retireFiles,
  writeHeader,
  type Store,
} from '../store/index.ts'
import { rebuild } from './cold.ts'
import { projectRow, stamp, type RepairReport } from './shared.ts'

/**
 * How many waves may run before the repair gives up and rebuilds cold.
 *
 * A wave that keeps propagating is a bug in the shape hash, not a large edit:
 * ADR 0002 measured an id-based hash turning a body-only edit into 10 waves and
 * 1,436 of 3,000 files. A ceiling turns that failure into a slow answer rather
 * than a hung process, and `analyse` reports the fallback when it fires.
 */
const MAX_WAVES = 8

/**
 * Repair the index by propagating a wave from the drifted files.
 */
export function repairWave(
  root: string,
  store: Store,
  config: Config,
  drift: Drift,
  moved: readonly ProjectPreflight[],
): RepairReport {
  const shapes = readExportShapes(store)
  const canonicalOf = readCanonicalProjects(store)
  const gone = new Set(drift.deleted)
  const seed = seedFrontier(store, drift, gone)

  // Applied before the wave runs, because a deleted leaf file starts no wave and
  // a deletion that waited for one would be rediscovered as drift for ever.
  retireFiles(store, drift.deleted, drift.seenFiles)

  const analysis = openAnalysis(root)
  try {
    // A project whose environment moved is re-analysed in full, so its files
    // join the frontier rather than getting their own code path: the wave then
    // propagates out of them exactly as it does out of an edit, which is what
    // carries a project turning `typed` into the answers of the projects that
    // import it.
    const measured = new Map(
      moved.map((preflight) => [preflight.configPath, preflight]),
    )
    const preflightOf = (configPath: FilePath): ProjectPreflight =>
      measured.get(configPath) ??
      preflightProjects(root, [configPath], drift.seenFiles).get(configPath)!
    const environment = reanalyse(store, analysis, moved, canonicalOf)
    const visited = new Set<FilePath>(gone)
    let pending = [...new Set([...seed, ...environment.files])].filter(
      (path) => !gone.has(path),
    )
    let waves = 0
    let extracted = 0

    while (pending.length > 0) {
      if (waves >= MAX_WAVES) {
        // Propagation that will not settle is a bug in the shape hash, not a
        // large edit. Falling back is honest and bounded; looping is neither.
        return {
          ...rebuild(root, store, config),
          environment: [],
          reason: `the wave did not settle within ${MAX_WAVES} rounds`,
        }
      }
      waves += 1
      for (const path of pending) visited.add(path)

      const wave = runWave(root, store, analysis, {
        config,
        pending,
        canonicalOf,
        shapes,
        preflightOf,
        refreshed: environment.rows,
      })
      extracted += wave.extracted

      pending = [...readImporters(store, wave.reshaped)].filter(
        (path) => !visited.has(path),
      )
    }

    // Written whatever the wave did. A project that globs no files has no facts
    // to carry its new fingerprint into the index, and without the row it would
    // read as moved again on the next question, for ever.
    refreshProjects(store, [...environment.rows.values()])

    // A repair that extracted nothing still happened: without the stamp, a lone
    // deletion would leave `analysedAt` reporting an older snapshot than the one
    // the index now holds.
    if (waves === 0) writeHeader(store, stamp(root, config))

    return {
      kind: 'wave',
      files: extracted,
      waves,
      environment: [...environment.rows.keys()],
      reason: '',
    }
  } finally {
    analysis.close()
  }
}

/**
 * The files the first wave starts from.
 *
 * Changed and added files are obvious. The other three are not: a deleted file's
 * importers hold edges that are now dangling and nothing about their own content
 * says so, a file appearing may be the one that completes a relative import that
 * is broken today, and the files of a project an interrupted build never reached
 * are unanalysed without having drifted at all.
 */
function seedFrontier(
  store: Store,
  drift: Drift,
  gone: ReadonlySet<FilePath>,
): FilePath[] {
  const frontier = new Set<FilePath>([
    ...drift.changed,
    ...drift.added,
    ...readUnanalysedFiles(store),
  ])
  for (const path of readImporters(store, drift.deleted)) frontier.add(path)
  if (drift.added.length > 0) {
    for (const path of readBrokenImporters(store)) frontier.add(path)
  }
  return [...frontier].filter((path) => !gone.has(path))
}

/** What one round of the wave needs, beyond the files it is extracting. */
interface WaveContext {
  readonly pending: readonly FilePath[]
  /** The repository's config, which the header stamp hashes for the label layer. */
  readonly config: Config
  /** Every file's project, as the index credits it. Ownership never moves here. */
  readonly canonicalOf: ReadonlyMap<FilePath, FilePath>
  /** Per file, the export-shape hash the last extraction produced. */
  readonly shapes: Map<FilePath, string>
  /** Preflight for a project the wave meets without a row in the index. */
  readonly preflightOf: (configPath: FilePath) => ProjectPreflight
  /** Rows for the projects being re-analysed for an environment change. */
  readonly refreshed: ReadonlyMap<FilePath, ProjectNode>
}

/** One round: extract the frontier, commit it, and report whose shape moved. */
function runWave(
  root: string,
  store: Store,
  analysis: AnalysisSession,
  context: WaveContext,
): { extracted: number; reshaped: FilePath[] } {
  const { config, pending, canonicalOf, shapes } = context
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
    declarations: result.declarations,
    callEdges: result.callEdges,
    referenceEdges: result.referenceEdges,
    unresolvedCalls: result.unresolvedCalls,
    importEdges: result.importEdges,
    // The adapter measured which specifiers resolved to nothing; the cause is
    // filesystem knowledge, so it is decided here rather than in the program.
    unresolvedSpecifiers: classifySpecifiers(
      root,
      result.unresolvedSpecifiers,
      result.canonicalOf,
    ),
    projects: touchedProjects(store, result.canonicalOf, context),
    header: stamp(root, config),
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

/**
 * Re-open the projects whose environment moved, and say what to re-extract.
 *
 * Both halves matter. The files the index already credits to the project are
 * re-extracted because their facts were produced under the old environment — an
 * `any` where there is now a type — and the files the project globs *now* are
 * re-extracted because that is how codegen landing becomes facts. Ownership is
 * left where the index put it: a re-analysis refreshes a project, it does not
 * take files off its neighbours.
 */
function reanalyse(
  store: Store,
  analysis: ReturnType<typeof openAnalysis>,
  moved: readonly ProjectPreflight[],
  canonicalOf: ReadonlyMap<FilePath, FilePath>,
): { files: FilePath[]; rows: Map<FilePath, ProjectNode> } {
  const rows = new Map<FilePath, ProjectNode>()
  if (moved.length === 0) return { files: [], rows }

  const configPaths = moved.map((preflight) => preflight.configPath)
  analysis.openProjects(configPaths)
  const byProject = analysis.filesByProject()
  const files = new Set<FilePath>(readProjectFiles(store, configPaths))

  for (const preflight of moved) {
    const owned = (byProject.get(preflight.configPath) ?? []).filter(
      (path) =>
        (canonicalOf.get(path) ?? preflight.configPath) ===
        preflight.configPath,
    )
    for (const path of owned) files.add(path)
    rows.set(preflight.configPath, projectRow(preflight, owned.length))
  }
  return { files: [...files].sort(), rows }
}

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
 * wave would report a 3-file project where there are 3,000. A project with no
 * recorded row falls back to its membership, for the same reason.
 *
 * Fidelity, its cause and the fingerprint are carried forward untouched, because
 * they describe the environment the facts were extracted in rather than the
 * machine as it is now. The exception is a project being re-analysed *for* an
 * environment change, whose row was measured before the wave started.
 */
function touchedProjects(
  store: Store,
  canonicalOf: ReadonlyMap<FilePath, FilePath>,
  context: WaveContext,
): ProjectNode[] {
  const known = new Map(
    readProjects(store).map((project) => [project.configPath, project]),
  )
  // A project the index has no row for at all — the repair of a half-built index
  // writes its first one — takes its size from membership, which the interrupted
  // build recorded before it started extracting.
  const owned = readMembershipCounts(store)
  const analysedAt = new Date().toISOString()
  return [...new Set(canonicalOf.values())].sort().map((configPath) => {
    const refreshed = context.refreshed.get(configPath)
    if (refreshed !== undefined) return refreshed
    const existing = known.get(configPath)
    if (existing !== undefined) return { ...existing, analysedAt }
    return projectRow(
      context.preflightOf(configPath),
      owned.get(configPath) ?? 0,
    )
  })
}
