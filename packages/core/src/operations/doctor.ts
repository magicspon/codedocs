/**
 * `doctor` — every unmet precondition in the repository, read whole.
 *
 * ADR 0001 makes preflight a core operation that `doctor` *renders*: it opens no
 * program, extracts nothing, and runs no sweep of its own. All four of ADR 0001's
 * signals are measured, stored and reported per answer already; what they had
 * nowhere to be was read together, over the whole index rather than one answer's
 * slice — which is why ADR 0006 scoped `conditions` to the projects an answer
 * touched and left the full view here.
 *
 * The result unit is a **precondition**: one project, one cause, and every signal
 * that evidenced it. That grouping is the deduplication ADR 0009 requires — a
 * project whose codegen never ran fires signal 3 *and* leaves its files'
 * specifiers unresolved, and the two are one finding at different granularity.
 * The exit code follows the cause for the same reason.
 */

import { dirname, join } from 'node:path'

import { listBaselines } from '../baseline/index.ts'
import type { Config } from '../config/index.ts'
import { remediationFor } from '../config/index.ts'
import { answer, type AnswerContext, type Envelope } from '../envelope.ts'
import { unfiltered, type Scoping } from '../labels/index.ts'
import type {
  Fidelity,
  FilePath,
  PreconditionCause,
  ProjectNode,
  UnresolvedSpecifier,
} from '../model.ts'
import { distance } from '../git.ts'
import { installCommand } from '../preflight/index.ts'
import {
  counts,
  readAllUnresolvedSpecifiers,
  readCanonicalProjects,
  readHeader,
  readLabels,
  readProjects,
  type Store,
} from '../store/index.ts'
import { classification, type Classification } from './classification.ts'
import { measureProjects, type Disagreement } from './measure.ts'

/**
 * The causes a command could clear, which is what ADR 0006's exit code follows.
 *
 * `unmapped` and `broken` are absent for opposite reasons — nothing would help a
 * `broken` import, and no *command* would help an `unmapped` one — and a red
 * build that cannot be cleared is noise.
 */
const REMEDIABLE: readonly PreconditionCause[] = [
  'unprepared',
  'missing-generated',
]

/** The order causes are reported in within a project: remediable first. */
const CAUSE_ORDER: readonly PreconditionCause[] = [
  'unprepared',
  'missing-generated',
  'unmapped',
  'broken',
]

/** One distinct unresolved specifier evidencing a cause, with its sites counted. */
export interface SpecifierEvidence {
  /** The specifier as written, which is what a remediation matches on. */
  readonly specifier: string
  /** How many sites wrote it. One absent artefact produced 302 on cal.com. */
  readonly sites: number
  /** The files that wrote it, sorted. */
  readonly files: readonly FilePath[]
  /** What `codedocs.jsonc` says clears it, or `null` — there is no built-in table. */
  readonly remediation: string | null
}

/** ADR 0006's result unit for `doctor`: one unmet precondition, however evidenced. */
export interface Precondition {
  /** The project it is filed under, or `null` for a file no project claims. */
  readonly project: FilePath | null
  readonly cause: PreconditionCause
  /** The fidelity the project was analysed at, or `null` where it has no row. */
  readonly fidelity: Fidelity | null
  /** Whether signals 1-3 evidenced it, which makes it project-wide. */
  readonly signal: boolean
  /** Whether an install script is declared, which sharpens `unprepared`. */
  readonly postinstall: boolean
  /** Whether a command could clear this cause at all. What exit 1 follows. */
  readonly remediable: boolean
  /** The commands that would clear it, distinct and sorted. Empty where none is known. */
  readonly remediations: readonly string[]
  /** Signal 4's evidence, one entry per distinct specifier. */
  readonly specifiers: readonly SpecifierEvidence[]
}

/**
 * What the index says about itself, which is where a user discovers that it was
 * built by another tool or TypeScript version (ADR 0004).
 */
export interface IndexReport {
  readonly toolVersion: string
  readonly typescriptVersion: string
  readonly projects: number
  readonly files: number
}

/** How `doctor` was asked to run, and what it needs to name a remediation. */
export interface DoctorOptions {
  readonly root: string
  /** The repository's own `codedocs.jsonc`, which is where `missing-generated`'s command lives. */
  readonly config: Config
  /** Re-run signals 1-3 against the working tree and name the disagreements. */
  readonly measure: boolean
  /** The session's tree walk, so `--measure` needs no sweep of its own. */
  readonly seenFiles: readonly FilePath[]
  /** The scope, echoed rather than applied: a precondition is about a project. */
  readonly scoping: Scoping
}

/** A `doctor` answer: the preconditions, the header over them, and what `--measure` found. */
export type DoctorEnvelope = Envelope<readonly Precondition[]> & {
  readonly header: IndexReport
  /**
   * How many findings a command could clear, over the whole set.
   *
   * Counted before `--limit`, because an exit code that changed with a display
   * bound would let `--limit 1` turn a red build green.
   */
  readonly remediable: number
  /** `--measure`'s disagreements, or `null` where it was not asked for. */
  readonly measured: readonly Disagreement[] | null
  /**
   * What the label layer decided, and where it is least sure.
   *
   * ADR 0003 asks for it here because `classify` in `codedocs.jsonc` is the
   * escape hatch, and a user who cannot see what the signals decided has no way
   * to discover that it exists.
   */
  readonly classification: Classification
  /**
   * The baselines held, and how far `HEAD` is from the newest.
   *
   * ADR 0008 calls its cap of three a guess and says so; PRD §28 rules out
   * telemetry, so this line is the only place the guess can be observed
   * accruing evidence.
   */
  readonly baselines: BaselineReport
}

/** One held baseline, without the absolute path that names the machine. */
export interface HeldBaseline {
  readonly commit: string
  readonly committedAt: string | null
  /** Whether it is an ancestor of `HEAD`, which is what makes it usable. */
  readonly ancestor: boolean
  readonly bytes: number
}

/** What `doctor` says about the baselines on disk. */
export interface BaselineReport {
  readonly held: readonly HeldBaseline[]
  /** The cap in force, from `codedocs.jsonc`. `0` means capture is disabled. */
  readonly cap: number
  /** Commits between `HEAD` and the newest usable baseline, where git can say. */
  readonly distance: number | null
}

/**
 * Report every unmet precondition, one row per project and cause.
 *
 * Blind spots stay the session's own. Every unresolved specifier is already the
 * result here, and repeating it as a blind spot would say twice, in two
 * vocabularies, what this operation exists to say once.
 */
export function doctor(
  store: Store,
  context: AnswerContext,
  limit: number | null,
  options: DoctorOptions,
): DoctorEnvelope {
  const projects = readProjects(store)
  const preconditions = assemble(store, projects, options)
  const totals = counts(store)
  const header = readHeader(store)

  return {
    ...answer(
      'doctor',
      // A precondition is about a project, and no label joins to one: the scope
      // is echoed as given rather than quietly not applying.
      {
        subject: null,
        resolved: [],
        limit,
        depth: null,
        scope: unfiltered(options.scoping),
      },
      context,
      preconditions,
    ),
    header: {
      toolVersion: header.toolVersion,
      typescriptVersion: header.typescriptVersion,
      projects: totals.projects,
      files: totals.files,
    },
    remediable: preconditions.filter((found) => found.remediable).length,
    measured: options.measure
      ? measureProjects(options.root, projects, options.seenFiles)
      : null,
    classification: classification(readLabels(store)),
    baselines: baselineReport(options),
  }
}

/** The baselines held, newest first, with the distance to the newest usable one. */
function baselineReport(options: DoctorOptions): BaselineReport {
  const held = listBaselines(options.root)
  const newest = held.find((one) => one.ancestor)
  return {
    // The path is left out for the reason `impact` leaves it out: it is
    // absolute, so it names the machine rather than the repository.
    held: held.map(({ commit, committedAt, ancestor, bytes }) => ({
      commit,
      committedAt,
      ancestor,
      bytes,
    })),
    cap: options.config.baselines,
    distance:
      newest === undefined
        ? null
        : distance(options.root, newest.commit, 'HEAD'),
  }
}

/** One cause under one project, while its evidence is still being gathered. */
interface Draft {
  readonly project: FilePath | null
  readonly cause: PreconditionCause
  signal: boolean
  readonly specifiers: Map<string, { sites: number; files: Set<FilePath> }>
}

/**
 * Both signals, folded into one row per project and cause.
 *
 * The fold *is* the deduplication: a project row and a specifier row that name
 * the same cause under the same project meet in the same draft, so one missing
 * codegen is reported once however many ways it was seen.
 */
function assemble(
  store: Store,
  projects: readonly ProjectNode[],
  options: DoctorOptions,
): Precondition[] {
  const drafts = new Map<string, Draft>()
  for (const project of projects) {
    if (project.cause === null) continue
    draft(drafts, project.configPath, project.cause).signal = true
  }

  const canonical = readCanonicalProjects(store)
  for (const found of readAllUnresolvedSpecifiers(store)) {
    add(draft(drafts, canonical.get(found.file) ?? null, found.cause), found)
  }

  const rows = new Map(projects.map((project) => [project.configPath, project]))
  return [...drafts.values()]
    .map((held) =>
      resolve(
        held,
        held.project === null ? undefined : rows.get(held.project),
        options,
      ),
    )
    .sort(
      (a, b) =>
        compareProject(a.project, b.project) ||
        CAUSE_ORDER.indexOf(a.cause) - CAUSE_ORDER.indexOf(b.cause),
    )
}

/** The draft for one project and cause, created on first sight of either signal. */
function draft(
  drafts: Map<string, Draft>,
  project: FilePath | null,
  cause: PreconditionCause,
): Draft {
  const key = `${project ?? ''} ${cause}`
  const held = drafts.get(key)
  if (held !== undefined) return held
  const made: Draft = { project, cause, signal: false, specifiers: new Map() }
  drafts.set(key, made)
  return made
}

/** Count one specifier site against its draft. */
function add(held: Draft, found: UnresolvedSpecifier): void {
  const seen = held.specifiers.get(found.specifier)
  if (seen === undefined) {
    held.specifiers.set(found.specifier, {
      sites: 1,
      files: new Set([found.file]),
    })
    return
  }
  seen.sites += 1
  seen.files.add(found.file)
}

/** One finished precondition: its evidence sorted, its remediations looked up. */
function resolve(
  held: Draft,
  project: ProjectNode | undefined,
  options: DoctorOptions,
): Precondition {
  const specifiers: SpecifierEvidence[] = [...held.specifiers.entries()]
    .map(([specifier, seen]) => ({
      specifier,
      sites: seen.sites,
      files: [...seen.files].sort(),
      remediation: remediationFor(options.config, held.cause, specifier),
    }))
    .sort((a, b) => compareText(a.specifier, b.specifier))

  const install =
    held.cause === 'unprepared' ? installFor(held.project, options) : null
  const remediations = new Set(
    [install, ...specifiers.map((found) => found.remediation)].filter(
      (command): command is string => command !== null,
    ),
  )

  return {
    project: held.project,
    cause: held.cause,
    fidelity: project?.fidelity ?? null,
    signal: held.signal,
    postinstall: project?.postinstall ?? false,
    remediable: REMEDIABLE.includes(held.cause),
    remediations: [...remediations].sort(),
    specifiers,
  }
}

/**
 * `unprepared`'s command, read from the lockfile nearest the project.
 *
 * ADR 0010 keeps this out of the config because it is determinable, and a
 * monorepo whose packages are installed by different managers is answered per
 * project rather than per repository.
 */
function installFor(
  project: FilePath | null,
  options: DoctorOptions,
): string | null {
  const { root } = options
  return project === null
    ? installCommand(root)
    : installCommand(root, join(root, dirname(project)))
}

/** A file no project claims sorts last: it is a finding without a home, not a project. */
const compareProject = (a: FilePath | null, b: FilePath | null): number => {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return compareText(a, b)
}

const compareText = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0
