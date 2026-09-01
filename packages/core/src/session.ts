/**
 * A session is one question's worth of index access: open the store, bring it up
 * to date, and assemble the honesty fields the envelope owes.
 *
 * ADR 0004 makes every query update before it answers. An answer that could not
 * be brought up to date — because the caller passed `--no-update` — is still
 * given, with the drifted files named as blind spots. Silence is the one
 * behaviour ruled out.
 */

import { createRequire } from 'node:module'

import { openAnalysis, type AnalysisSession } from './adapter/ts7/index.ts'
import { loadConfig, type Config } from './config.ts'
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
import type { FileNode, FilePath, ProjectNode } from './model.ts'
import {
  classifySpecifiers,
  fidelityOf,
  preflightProjects,
  type ProjectPreflight,
} from './preflight.ts'
import {
  applyWave,
  beginAnalysis,
  commitProject,
  openStore,
  readBrokenImporters,
  readCanonicalProjects,
  readExportShapes,
  readFiles,
  readHeader,
  readImporters,
  readMembershipCounts,
  readProjectFiles,
  readProjects,
  readSeenFiles,
  readSymbolIdAt,
  readUnanalysedFiles,
  readUnanalysedProjects,
  refreshProjects,
  retireFiles,
  writeHeader,
  type Store,
} from './store/index.ts'

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
  /** The repository's own `codedocs.jsonc`, or the defaults it did not override. */
  readonly config: Config
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
  /**
   * The projects re-analysed because their environment fingerprint moved.
   *
   * Reported separately from the file count because it is a different event: no
   * file changed, the machine did. ADR 0001 makes that a legitimate full
   * re-analysis of those projects, and one that is reported as such rather than
   * dressed up as drift.
   */
  readonly environment: readonly FilePath[]
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
  // Read before the store is opened: a config that cannot be used means the
  // user's intent is unknown, and nothing should be built on a guess at it.
  const config = loadConfig(root)
  const store = openStore(root)

  const indexed = readFiles(store)
  const outstanding: Outstanding = {
    drift: detectDrift(root, indexed, readSeenFiles(store)),
    stale: staleReason(readHeader(store), indexed.length === 0),
    // A build that was interrupted between two of its per-project commits. Not
    // drift — these files never changed, they were never analysed — so it is its
    // own reason to repair and its own kind of blind spot.
    unanalysed: readUnanalysedProjects(store),
    // The environment under a project, which no file's content reveals: an
    // install lands, or codegen writes the directory a tsconfig already globbed,
    // and every stored fidelity for that project describes a machine that is
    // gone.
    moved: [],
  }
  outstanding.moved = movedProjects(
    root,
    readProjects(store),
    outstanding.drift.seenFiles,
  )

  const repair = options.noUpdate
    ? null
    : repairFor(root, store, config, outstanding)
  const blindSpots = options.noUpdate ? withheld(root, outstanding) : []
  const projects = readProjects(store)

  const current = readHeader(store)
  const snapshot: Snapshot = {
    commit: current.commit === '' ? null : current.commit,
    // A snapshot is a commit plus whatever is uncommitted on top of it. After a
    // repair the tree and the index agree, so `dirty` is about drift we kept.
    dirty: options.noUpdate && hasDrift(outstanding.drift),
    analysedAt: current.analysedAt === '' ? null : current.analysedAt,
  }

  return {
    root,
    store,
    config,
    context: {
      snapshot,
      conditions: projects.map(toConditions),
      blindSpots,
    },
    repair,
    close: () => store.close(),
  }
}

/** Everything a session found out of date before it decided what to do. */
interface Outstanding {
  readonly drift: Drift
  /** Why the whole index must be rebuilt, or `null`. */
  readonly stale: string | null
  /** Projects a previous build was interrupted before it reached. */
  readonly unanalysed: readonly FilePath[]
  /** Projects whose environment fingerprint no longer matches the index. */
  moved: readonly ProjectPreflight[]
}

/** Whether anything at all is out of date. */
const anythingOutstanding = (outstanding: Outstanding): boolean =>
  outstanding.stale !== null ||
  hasDrift(outstanding.drift) ||
  outstanding.unanalysed.length > 0 ||
  outstanding.moved.length > 0

/** Bring the index up to date, or report that there was nothing to do. */
function repairFor(
  root: string,
  store: Store,
  config: Config,
  outstanding: Outstanding,
): RepairReport | null {
  if (!anythingOutstanding(outstanding)) return null
  const { stale, drift, moved } = outstanding
  return stale === null
    ? repairWave(root, store, config, drift, moved)
    : { ...rebuild(root, store, config), environment: [], reason: stale }
}

/**
 * What `--no-update` withheld, named file by file and project by project.
 *
 * ADR 0004's one rule for this path: the answer is still given, and what could
 * not be brought up to date is named. A version mismatch is reported only when
 * nothing else is, because it is the whole index rather than a list of subjects.
 */
function withheld(root: string, outstanding: Outstanding): BlindSpot[] {
  const { stale, drift, unanalysed, moved } = outstanding
  const spots: BlindSpot[] = [
    ...moved.map((project) => ({
      subject: project.configPath,
      reason:
        'this project’s environment changed since it was analysed, so its ' +
        'fidelity and its facts may both be stale, and --no-update was passed',
    })),
    ...unanalysed.map((project) => ({
      subject: project,
      reason:
        'this project was never analysed — a build was interrupted before it ' +
        'reached it — and --no-update was passed',
    })),
    ...driftedPaths(drift).map(({ path, reason }) => ({
      subject: path,
      reason: `${reason}, and --no-update was passed`,
    })),
  ]
  if (spots.length > 0 || stale === null) return spots
  return [
    {
      subject: root,
      reason: `${stale}, and --no-update was passed; run \`codedocs analyse\``,
    },
  ]
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
  cause: project.cause,
  postinstall: project.postinstall,
})

/**
 * The projects whose environment fingerprint no longer matches the index.
 *
 * Preflight runs over the walk drift detection has just done, so the whole check
 * is a lockfile hash, a config read and a glob match per project. A project the
 * index has a row for but whose config has since gone reads as changed, which is
 * the honest answer: it is no longer the project that was analysed.
 */
function movedProjects(
  root: string,
  projects: readonly ProjectNode[],
  seenFiles: readonly FilePath[],
): ProjectPreflight[] {
  const measured = preflightProjects(
    root,
    projects.map((project) => project.configPath),
    seenFiles,
  )
  return projects
    .map((project) => measured.get(project.configPath))
    .filter((preflight) => preflight !== undefined)
    .filter((preflight) => {
      const stored = projects.find(
        (project) => project.configPath === preflight.configPath,
      )
      // A project whose tsconfig has gone is not an environment change but a
      // structural one, and re-analysing a project that no longer exists would
      // ask the backend to open nothing. `analyse` is where that is resolved.
      return preflight.present && stored?.fingerprint !== preflight.fingerprint
    })
}

/**
 * One project's row, from the preflight measured for it.
 *
 * `rootFileCount` stays the analysis's own count of the files it extracted for
 * this project, which is not preflight's glob count: preflight reads the config
 * against the tree, and the analysis credits a shared file to exactly one
 * project. The two answer different questions, and only the first can be
 * recomputed without opening a program.
 */
function projectRow(
  preflight: ProjectPreflight,
  rootFileCount: number,
): ProjectNode {
  const { fidelity, cause } = fidelityOf(preflight)
  return {
    configPath: preflight.configPath,
    fidelity,
    rootFileCount,
    analysedAt: new Date().toISOString(),
    fingerprint: preflight.fingerprint,
    cause,
    postinstall: preflight.postinstall,
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
function repairWave(
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
    if (waves === 0) writeHeader(store, stamp(root))

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
  const { pending, canonicalOf, shapes } = context
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

/**
 * Re-analyse every project and replace the index contents.
 *
 * ADR 0004 wants an interrupted build to leave a partial index. Committing per
 * project was only half of that while every project was extracted before the
 * first commit: of cal.com's 16 s, the ~1 s of commits was interruptible and the
 * 15 s of analysis was not. Now each project is extracted and committed on its
 * own, so a project that finished is in the index and the rest read as
 * unanalysed files, which the next run repairs with a wave.
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
