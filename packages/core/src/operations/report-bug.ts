/**
 * `report-bug` — one reproduced failure, in a shape that is safe to paste.
 *
 * ADR 0011 draws the line and this applies it: **a fact about codedocs or the
 * machine is in the default report, and a fact that names the user's code is
 * behind `--with-repository`**. The default is what someone pastes into a public
 * issue without reading it, which is the only assumption worth designing
 * against, so every repository field here is an absent key rather than a
 * redacted one — a key that is never written cannot be written by accident.
 *
 * It is also the one operation that reads the index without repairing it. A
 * report describes the index the failure came from, and an operation that
 * quietly rebuilt it first would be reporting on a different one.
 */

import { existsSync, readFileSync } from 'node:fs'
import { release } from 'node:os'
import { join } from 'node:path'

import { configFacts, type ConfigFacts } from '../config.ts'
import { findRepositoryRoot } from '../discovery.ts'
import {
  SCHEMA_VERSION,
  type BlindSpot,
  type Budget,
  type Envelope,
  type EnvelopeError,
  type ProjectConditions,
  type Snapshot,
} from '../envelope.ts'
import type { Fidelity, PreconditionCause } from '../model.ts'
import { compilerOptionsOf, lockfileName } from '../preflight.ts'
import { TOOL_VERSION, typescriptVersion } from '../session.ts'
import {
  counts,
  openStore,
  readAllUnresolvedSpecifiers,
  readHeader,
  readProjects,
  STORE_SCHEMA_VERSION,
} from '../store.ts'

/**
 * Where a report lands unless `--out` moves it.
 *
 * Not inside `.codedocs/`: ADR 0004 documents that directory as invisible to
 * `git status` and safe to delete, and a file the user is meant to find, read
 * and attach fails both.
 */
export const REPORT_FILE = 'codedocs-report.json'

/** What the failing command was, and what running it again just did. */
export interface Reproduction {
  /** The command as typed, after `--`. It names the subject, so it travels only under the flag. */
  readonly argv: readonly string[]
  /** The operation it named, or `null` where it named nothing codedocs knows. */
  readonly operation: string | null
  /** The flags it gave, recognised by the parser and stripped of their values. */
  readonly flags: readonly string[]
  /** The directory it ran in, which is the index the report describes. */
  readonly cwd: string
  /** The re-run's own exit code. A field, never propagated: see `reportBug`. */
  readonly exitCode: 0 | 1 | 2
  readonly durationMs: number
  /** The envelope it produced, or `null` where the command line never parsed to one. */
  readonly envelope: Envelope<unknown> | null
  /** The failure, where there was no envelope to carry it. */
  readonly error: EnvelopeError | null
}

/** The versions of codedocs itself, none of which name the repository. */
export interface CodedocsFacts {
  readonly version: string
  readonly schemaVersion: number
  readonly storeSchemaVersion: number
  /** The TypeScript this process is running. */
  readonly typescript: string
  /** The TypeScript the index was built with. A difference is why it rebuilt. */
  readonly indexTypescript: string | null
}

/** The package manager, from the `packageManager` field or the lockfile's name. */
export interface PackageManager {
  readonly name: string | null
  readonly version: string | null
}

/** The machine, at the resolution that has ever diagnosed anything. */
export interface MachineFacts {
  readonly node: string
  readonly platform: string
  readonly release: string
  readonly arch: string
  readonly packageManager: PackageManager
  /** The lockfile's filename, never its content. */
  readonly lockfile: string | null
}

/** One blind-spot reason, and how many subjects had it. The subjects are behind the flag. */
export interface BlindSpotReason {
  readonly reason: string
  readonly count: number
}

/** The failure itself: its code always, its parameters only where they may travel. */
export interface ReportedError {
  readonly code: string
  /** Free text and user input, so ADR 0011 keeps it behind the flag. */
  readonly params?: Readonly<Record<string, unknown>>
  /** Frames inside codedocs' own packages, already package-relative when captured. */
  readonly stack?: readonly string[]
}

/** What the re-run did, and what its envelope said, sorted by ADR 0011's rule. */
export interface ReproductionFacts {
  readonly operation: string | null
  readonly flags: readonly string[]
  /** The command verbatim, including its subject. Repository shape only. */
  readonly command?: readonly string[]
  /** The `SymbolId`s the subject resolved to. Repository shape only. */
  readonly resolved?: readonly string[]
  readonly exitCode: 0 | 1 | 2
  readonly durationMs: number
  readonly error: ReportedError | null
  readonly budget: Budget | null
  readonly dirty: boolean
  readonly analysedAt: string | null
  /** Repository shape only: a commit is a lookup key naming which repository. */
  readonly commit?: string | null
  /** How many blind spots the answer carried, by reason. */
  readonly blindSpots: readonly BlindSpotReason[]
  /** Repository shape only: the files and specifiers behind those reasons. */
  readonly blindSpotSubjects?: readonly string[]
  /** Repository shape only: the `tsconfig` paths the answer touched. */
  readonly conditions?: readonly ProjectConditions[]
}

/** One distinct unresolved specifier, with the sites it stands for. */
export interface SpecifierFact {
  readonly specifier: string
  readonly cause: PreconditionCause
  readonly sites: number
}

/** One project's environment, which is repository content one step removed. */
export interface ProjectEnvironment {
  readonly project: string
  readonly fingerprint: string
  readonly compilerOptions: Readonly<Record<string, unknown>>
}

/** Unresolved specifiers as the histogram 542 of them have to become. */
export interface SpecifierTotals {
  readonly sites: number
  readonly distinct: number
  readonly byCause: Readonly<Record<string, number>>
}

/** How large the index was, and how much of it codedocs could not see. */
export interface IndexFacts {
  readonly projects: number
  readonly files: number
  readonly symbols: number
  readonly callEdges: number
  readonly unresolvedCalls: number
  /** ADR 0011: a distribution rather than a row per project. */
  readonly fidelity: Readonly<Record<Fidelity, number>>
  readonly causes: Readonly<Record<string, number>>
  readonly unresolvedSpecifiers: SpecifierTotals
  /** Repository shape only: the specifier strings themselves. */
  readonly specifiers?: readonly SpecifierFact[]
  /** Repository shape only: the fingerprint's inputs, per project. */
  readonly environment?: readonly ProjectEnvironment[]
}

/**
 * What the report carries, counted by category.
 *
 * In the default shape every count but the first is zero by construction, which
 * is the fact worth printing: the terminal states it, and the file states it
 * again for a reader who has only the file a week later.
 */
export interface Disclosure {
  readonly blindSpotReasons: number
  readonly paths: number
  readonly symbolNames: number
  readonly moduleSpecifiers: number
}

/** `codedocs.jsonc`: which keys are set, and — behind the flag — what they say. */
export interface ConfigReport {
  readonly present: boolean
  readonly readable: boolean
  readonly keys: readonly string[]
  readonly values?: Readonly<Record<string, unknown>>
}

/**
 * One reproduced failure.
 *
 * The two header fields open the file because terminal output does not travel
 * with an attachment pasted a week later: the file has to say what it is.
 */
export interface Report {
  readonly repositoryFacts: 'excluded' | 'included'
  readonly contains: string
  readonly carries: Disclosure
  readonly codedocs: CodedocsFacts
  readonly machine: MachineFacts
  readonly reproduction: ReproductionFacts
  /** `null` where the index could not be opened at all. */
  readonly index: IndexFacts | null
  readonly config: ConfigReport
  /** Repository shape only: the repository's own declared dependencies. */
  readonly dependencies?: Readonly<Record<string, string>>
}

/** What each shape promises, in the file, for a reader who has only the file. */
const CONTAINS: Readonly<Record<'excluded' | 'included', string>> = {
  excluded:
    'codedocs and machine facts only: no file paths, symbol names, module ' +
    'specifiers, dependency versions or commit',
  included:
    'codedocs and machine facts, plus facts that name this repository: file ' +
    'paths, symbol names, module specifiers, dependency versions and the commit',
}

/**
 * The fields the report reads off the re-run's envelope.
 *
 * Read through one shape rather than one `?.` per field, because "there was no
 * envelope at all" is a single state — the command line never parsed to one —
 * and stating it once keeps every reader below from inventing its own default.
 */
interface AnswerFacts {
  readonly error: EnvelopeError | null
  readonly budget: Budget | null
  readonly snapshot: Snapshot
  readonly blindSpots: readonly BlindSpot[]
  readonly resolved: readonly string[]
  readonly conditions: readonly ProjectConditions[]
}

/** What those fields are where no envelope was reached. Nothing is invented. */
const NO_ANSWER: AnswerFacts = {
  error: null,
  budget: null,
  snapshot: { commit: null, dirty: false, analysedAt: null },
  blindSpots: [],
  resolved: [],
  conditions: [],
}

const answerFacts = (envelope: Envelope<unknown> | null): AnswerFacts =>
  envelope === null
    ? NO_ANSWER
    : {
        error: envelope.error ?? null,
        budget: envelope.budget,
        snapshot: envelope.snapshot,
        blindSpots: envelope.blindSpots,
        resolved: envelope.request.resolved,
        conditions: envelope.conditions,
      }

/**
 * A `report-bug` answer, whose result is always there: the operation's finding
 * is that a report exists, so an envelope of it without one is not a state.
 */
export interface ReportEnvelope extends Envelope<Report> {
  readonly result: Report
}

/**
 * Build the report for one reproduced failure.
 *
 * The re-run's exit code is a field and is never propagated: propagating it
 * would make `report-bug` return 1 exactly when the bug reproduced, inverting
 * the meaning exit 1 carries everywhere else. This operation's own finding is
 * that a report exists, and building one succeeded.
 *
 * @param withRepository - ADR 0011's one flag. It adds the facts that name the
 * user's code, and every one of them is an absent key without it.
 */
export function reportBug(
  reproduction: Reproduction,
  withRepository: boolean,
): ReportEnvelope {
  const root = findRepositoryRoot(reproduction.cwd)
  const index = indexFacts(root, withRepository)
  const answer = answerFacts(reproduction.envelope)
  const shape = withRepository ? 'included' : 'excluded'

  const report: Report = {
    repositoryFacts: shape,
    contains: CONTAINS[shape],
    carries: disclosure(answer, index.facts, withRepository),
    codedocs: {
      version: TOOL_VERSION,
      schemaVersion: SCHEMA_VERSION,
      storeSchemaVersion: STORE_SCHEMA_VERSION,
      typescript: typescriptVersion(),
      indexTypescript: index.typescript,
    },
    machine: machineFacts(root),
    reproduction: reproductionFacts(reproduction, answer, withRepository),
    index: index.facts,
    config: configReport(configFacts(root), withRepository),
    ...(withRepository ? { dependencies: dependenciesOf(root) } : {}),
  }

  return {
    operation: 'report-bug',
    schemaVersion: SCHEMA_VERSION,
    // The command it reproduced is in the result, where the shape rule
    // classifies it. Echoing it here would put a subject the user typed outside
    // the one rule that decides whether a subject may travel.
    request: { subject: null, resolved: [], limit: null, depth: null },
    // Deliberately empty, and the one envelope where that is not an omission:
    // this answer is a file, not a question about the code, and every honesty
    // field it could fill is a repository fact the report has already sorted.
    snapshot: { commit: null, dirty: false, analysedAt: null },
    conditions: [],
    blindSpots: [],
    budget: { returned: 1, available: 1, truncated: false },
    result: report,
  }
}

/**
 * Count what the report carries, category by category.
 *
 * Counted from the re-run's own envelope rather than from the report just built,
 * so the header cannot claim one thing while the fields hold another. A blind
 * spot's subject is a path unless it is one of the module specifiers, which is
 * how ADR 0009 files them in the first place.
 */
function disclosure(
  answer: AnswerFacts,
  index: IndexFacts | null,
  withRepository: boolean,
): Disclosure {
  const reasons = new Set(answer.blindSpots.map((spot) => spot.reason)).size
  if (!withRepository) {
    return {
      blindSpotReasons: reasons,
      paths: 0,
      symbolNames: 0,
      moduleSpecifiers: 0,
    }
  }
  const specifiers = new Set(
    (index?.specifiers ?? []).map((found) => found.specifier),
  )
  const paths = answer.blindSpots.filter(
    (spot) => !specifiers.has(spot.subject),
  )
  return {
    blindSpotReasons: reasons,
    paths:
      paths.length +
      answer.conditions.length +
      (index?.environment ?? []).length,
    symbolNames: answer.resolved.length,
    moduleSpecifiers: specifiers.size,
  }
}

/** The re-run's envelope, sorted by ADR 0011's rule. */
function reproductionFacts(
  reproduction: Reproduction,
  answer: AnswerFacts,
  withRepository: boolean,
): ReproductionFacts {
  const failure = answer.error ?? reproduction.error
  return {
    operation: reproduction.operation,
    flags: reproduction.flags,
    exitCode: reproduction.exitCode,
    durationMs: reproduction.durationMs,
    error: failure === null ? null : reportedError(failure, withRepository),
    budget: answer.budget,
    dirty: answer.snapshot.dirty,
    analysedAt: answer.snapshot.analysedAt,
    blindSpots: histogram(answer.blindSpots.map((spot) => spot.reason)).map(
      ([reason, count]) => ({ reason, count }),
    ),
    ...(withRepository ? named(reproduction, answer) : {}),
  }
}

/**
 * The half of the reproduction that names the user's code.
 *
 * One function rather than five conditional keys, so the rule is legible as a
 * rule: everything here is added together or not at all.
 */
function named(
  reproduction: Reproduction,
  answer: AnswerFacts,
): Partial<ReproductionFacts> {
  return {
    command: reproduction.argv,
    resolved: answer.resolved,
    commit: answer.snapshot.commit,
    blindSpotSubjects: answer.blindSpots.map((spot) => spot.subject),
    conditions: answer.conditions,
  }
}

/**
 * The failure, split where ADR 0011 splits it.
 *
 * The stack is in both shapes: `stack.ts` keeps only the frames inside
 * codedocs' own packages and rewrites them package-relative at capture, so what
 * survives names our code and neither the user's nor their machine.
 */
function reportedError(
  error: EnvelopeError,
  withRepository: boolean,
): ReportedError {
  return {
    code: error.code,
    ...(withRepository ? { params: error.params } : {}),
    ...(error.stack === undefined ? {} : { stack: error.stack }),
  }
}

/** The index's own facts, plus the TypeScript version its header names. */
function indexFacts(
  root: string,
  withRepository: boolean,
): { facts: IndexFacts | null; typescript: string | null } {
  let store
  try {
    store = openStore(root)
  } catch {
    // An index that will not open is itself worth reporting, and it is not a
    // reason to write no report: the failure being reported may well be it.
    return { facts: null, typescript: null }
  }
  try {
    const totals = counts(store)
    const projects = readProjects(store)
    const specifiers = specifierFacts(readAllUnresolvedSpecifiers(store))
    const causes = projects
      .map((row) => row.cause)
      .filter((cause) => cause !== null)
    return {
      typescript: readHeader(store).typescriptVersion,
      facts: {
        projects: totals.projects,
        files: totals.files,
        symbols: totals.symbols,
        callEdges: totals.callEdges,
        unresolvedCalls: totals.unresolved,
        fidelity: {
          typed: projects.filter((row) => row.fidelity === 'typed').length,
          syntactic: projects.filter((row) => row.fidelity === 'syntactic')
            .length,
        },
        causes: Object.fromEntries(histogram(causes)),
        unresolvedSpecifiers: {
          sites: specifiers.reduce((total, found) => total + found.sites, 0),
          distinct: specifiers.length,
          byCause: byCause(specifiers),
        },
        ...(withRepository
          ? {
              specifiers,
              environment: projects.map((project) => ({
                project: project.configPath,
                fingerprint: project.fingerprint,
                compilerOptions: compilerOptionsOf(root, project.configPath),
              })),
            }
          : {}),
      },
    }
  } finally {
    store.close()
  }
}

/** Sites per cause, which is the count that says how much one cause is costing. */
function byCause(specifiers: readonly SpecifierFact[]): Record<string, number> {
  const counted: Record<string, number> = {}
  for (const found of specifiers) {
    counted[found.cause] = (counted[found.cause] ?? 0) + found.sites
  }
  return counted
}

/** One row per distinct specifier, whatever its number of sites (ADR 0009). */
function specifierFacts(
  specifiers: readonly { specifier: string; cause: PreconditionCause }[],
): SpecifierFact[] {
  const found = new Map<string, SpecifierFact>()
  for (const { specifier, cause } of specifiers) {
    const key = `${specifier} ${cause}`
    const seen = found.get(key)
    found.set(
      key,
      seen === undefined
        ? { specifier, cause, sites: 1 }
        : { ...seen, sites: seen.sites + 1 },
    )
  }
  return [...found.values()].sort(
    (a, b) => compare(a.specifier, b.specifier) || compare(a.cause, b.cause),
  )
}

/** The machine, and the package manager the repository declares. */
function machineFacts(root: string): MachineFacts {
  const lockfile = lockfileName(root)
  const declared = manifestAt(root)['packageManager']
  const [declaredName, version] =
    typeof declared === 'string' ? declared.split('@') : []
  return {
    node: process.version,
    platform: process.platform,
    release: release(),
    arch: process.arch,
    packageManager: {
      name:
        declaredName ?? (lockfile === null ? null : MANAGERS[lockfile]) ?? null,
      version: version ?? null,
    },
    lockfile,
  }
}

/** Which package manager writes each lockfile, for a repository that declares none. */
const MANAGERS: Readonly<Record<string, string>> = {
  'pnpm-lock.yaml': 'pnpm',
  'yarn.lock': 'yarn',
  'package-lock.json': 'npm',
  'npm-shrinkwrap.json': 'npm',
  'bun.lock': 'bun',
  'bun.lockb': 'bun',
}

/**
 * The repository's own declared dependencies, behind the flag.
 *
 * PRD §29's "relevant dependency versions" resolves to two — TypeScript and the
 * package manager — and both are in the default shape. This is the whole list,
 * which is a repository's stack, its vendors and its private registry scopes,
 * and it is here only for a maintainer who has been sent the flag.
 */
function dependenciesOf(root: string): Record<string, string> {
  const manifest = manifestAt(root)
  const declared: Record<string, string> = {}
  for (const key of ['dependencies', 'devDependencies']) {
    const held = manifest[key]
    if (typeof held !== 'object' || held === null) continue
    for (const [name, range] of Object.entries(held)) {
      if (typeof range === 'string') declared[name] = range
    }
  }
  return declared
}

/** The repository root's `package.json`, or an empty one. */
function manifestAt(root: string): Record<string, unknown> {
  const path = join(root, 'package.json')
  if (!existsSync(path)) return {}
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

/** `codedocs.jsonc`'s keys always, its values only under the flag. */
function configReport(
  facts: ConfigFacts,
  withRepository: boolean,
): ConfigReport {
  return {
    present: facts.present,
    readable: facts.readable,
    keys: facts.keys,
    ...(withRepository ? { values: facts.values } : {}),
  }
}

/** Count each distinct string, most frequent first, then by the string itself. */
function histogram(values: readonly string[]): [string, number][] {
  const counted = new Map<string, number>()
  for (const value of values) counted.set(value, (counted.get(value) ?? 0) + 1)
  return [...counted.entries()].sort(
    (a, b) => b[1] - a[1] || compare(a[0], b[0]),
  )
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
