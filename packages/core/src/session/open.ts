/**
 * A session is one question's worth of index access: open the store, bring it up
 * to date, and assemble the honesty fields the envelope owes.
 *
 * ADR 0004 makes every query update before it answers. An answer that could not
 * be brought up to date — because the caller passed `--no-update` — is still
 * given, with the drifted files named as blind spots. Silence is the one
 * behaviour ruled out.
 */

import type { Config } from '../config/index.ts'
import { loadConfig } from '../config/index.ts'
import { findRepositoryRoot } from '../discovery.ts'
import { detectDrift, driftedPaths, hasDrift, type Drift } from '../drift.ts'
import type {
  AnswerContext,
  BlindSpot,
  ProjectConditions,
  Snapshot,
} from '../envelope.ts'
import {
  effective,
  labelFiles,
  type EffectiveLabels,
  type LabelPass,
} from '../labels/index.ts'
import type { FilePath, ProjectNode } from '../model.ts'
import { preflightProjects, type ProjectPreflight } from '../preflight/index.ts'
import {
  openStore,
  readFiles,
  readHeader,
  readLabels,
  readProjects,
  readSeenFiles,
  readUnanalysedProjects,
  replaceLabels,
  writeHeader,
  type Store,
} from '../store/index.ts'
import { rebuild } from './cold.ts'
import { classifyHash, type RepairReport } from './shared.ts'
import { TOOL_VERSION, typescriptVersion } from './version.ts'
import { repairWave } from './wave.ts'

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
  /**
   * Every source file this session's drift walk saw.
   *
   * Carried so `doctor --measure` can re-run signal 3 without a sweep of its
   * own: the walk has just happened, and walking cal.com's 5,064 files twice
   * costs 69 ms to learn what the session already knows.
   */
  readonly seenFiles: readonly FilePath[]
  /** What the repair actually did, for a test to pin and for `analyse` to report. */
  readonly repair: RepairReport | null
  /**
   * What the label pass cost, or `null` where the stored labels still stood.
   *
   * Reported rather than hidden for the same reason a repair is: ADR 0003 chose
   * to recompute the whole layer on the strength of one measurement, and a
   * number nobody can see is an assumption rather than a measurement.
   */
  readonly labelPass: LabelPass | null
  /**
   * Every node's effective labels, read on first use.
   *
   * Lazy because most answers never filter: an operation that applies no scope
   * beyond the default still pays a table scan it has no use for.
   */
  labels(): ReadonlyMap<FilePath, EffectiveLabels>
  close(): void
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

  // ADR 0003 recomputes the layer rather than invalidating it. A repair is one
  // trigger; the other is the `classify` block itself, which changes nothing in
  // the tree and would otherwise leave the old labels standing for ever.
  const labelPass =
    repair === null && readHeader(store).classifyHash === classifyHash(config)
      ? null
      : relabel(root, store, config)

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
    seenFiles: outstanding.drift.seenFiles,
    repair,
    labelPass,
    labels: memoise(() => effective(readLabels(store))),
    close: () => store.close(),
  }
}

/**
 * Recompute every label, and record the `classify` block it was computed under.
 *
 * The whole set, never a slice: a partial pass would leave files with no rows,
 * and a file with no rows reads as `source` and `authored` — which is exactly
 * what a half-written pass would be claiming.
 */
function relabel(root: string, store: Store, config: Config): LabelPass {
  const pass = labelFiles(
    root,
    readFiles(store).map((file) => file.path),
    config,
  )
  replaceLabels(store, pass.labels)
  writeHeader(store, {
    ...readHeader(store),
    classifyHash: classifyHash(config),
  })
  return pass
}

/** Run once, then answer from what the first call produced. */
function memoise<T>(compute: () => T): () => T {
  let held: T | undefined
  return () => (held ??= compute())
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
