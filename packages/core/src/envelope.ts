/**
 * ADR 0006's envelope: one shape, every operation, success and failure alike.
 *
 * Only `result` differs between operations. A single test can therefore assert
 * that every operation names its snapshot and its blind spots, and an agent
 * learns the honesty fields once rather than once per operation.
 */

import type { Scope } from './labels/scope.ts'
import type { Fidelity, FilePath, PreconditionCause } from './model.ts'

/**
 * One integer over the envelope and every result shape.
 *
 * 2: `conditions` gained the cause of a project's fidelity and whether an
 * install script is declared, so a caller can act on a `syntactic` project
 * rather than only being told about it.
 *
 * 3: `error` became a code plus typed parameters. The formatted `message` is
 * gone from the wire, so a caller branches on the code rather than parsing
 * English, and a [[Report]] can carry the code while dropping the parameters.
 *
 * 4: `request` gained the [[Scope]] applied and the count it excluded. ADR 0006
 * always listed the scope as part of the request; it had nothing to hold until
 * the label layer existed, and an answer that filters silently is the one thing
 * the honesty channels exist to prevent.
 *
 * An operation arriving does not bump it: ADR 0006 makes the operation enum
 * additive, so a caller written against 3 still reads every field it knew.
 */
export const SCHEMA_VERSION: number = 4

/**
 * The operation set, widened as each operation lands.
 *
 * `impact` is the only one of Phase 5's three to arrive: ADR 0012 deleted
 * `review` and `plan`, so the enum grows by exactly the operations that exist.
 * `evidence` is what `explain` was renamed to and what is left of `plan`. The
 * two `docs` names carry a space because ADR 0006's table spells them that way
 * and the CLI takes them as two words; the MCP binding transliterates.
 *
 * TODO(#10): widen to ADR 0006's full table as each operation lands.
 */
export type OperationName =
  | 'analyse'
  | 'symbol'
  | 'callers'
  | 'callees'
  | 'references'
  | 'file'
  | 'trace'
  | 'evidence'
  | 'docs check'
  | 'docs affected'
  | 'docs draft'
  | 'impact'
  | 'doctor'
  | 'report-bug'

/**
 * A file or region the analysis could not see, and which could therefore have
 * changed this answer. Named concretely, never summarised as a score.
 */
export interface BlindSpot {
  /** What could not be seen: a file path, or a project's config path. */
  readonly subject: string
  /** Why, in a form the caller can act on. */
  readonly reason: string
}

/** The preflight result stored alongside an index, scoped to one project. */
export interface ProjectConditions {
  readonly project: FilePath
  readonly fidelity: Fidelity
  readonly analysedAt: string
  /**
   * Why the fidelity is `syntactic`, or `null` where it is `typed`.
   *
   * ADR 0001 allows a remediation to be absent, but not the cause: naming a
   * project without saying what is missing leaves the caller to guess between an
   * absent install and a config waiting on codegen, and the two are fixed by
   * different commands.
   */
  readonly cause: PreconditionCause | null
  /** Whether an install script is declared, which sharpens `unprepared`. */
  readonly postinstall: boolean
}

/** The state of the working tree the answer came from. */
export interface Snapshot {
  /** The commit, or `null` in a checkout that is not a repository. */
  readonly commit: string | null
  /** Whether anything is uncommitted on top of that commit. */
  readonly dirty: boolean
  /** ISO timestamp of the most recent analysis in the index. */
  readonly analysedAt: string | null
}

/** The request as codedocs resolved it, which is what makes an answer reproducible. */
export interface ResolvedRequest {
  /** The subject as typed, or `null` for an operation that takes none. */
  readonly subject: string | null
  /** The canonical identifiers the subject resolved to. Several means ambiguous. */
  readonly resolved: readonly string[]
  /** The effective limit, or `null` for unbounded. */
  readonly limit: number | null
  /**
   * The effective semantic bound, or `null` for an operation that has none.
   *
   * Present on every operation so a parser meets one shape. It is separate from
   * `limit` because ADR 0006 splits the two: a limit is a display bound the
   * renderer owns, while a bound that changes the *shape* of the answer belongs
   * to the operation and must be echoed here, or a caller cannot tell a bounded
   * answer from a whole one.
   */
  readonly depth: number | null
  /**
   * The label filter this answer applied, and how much it withheld.
   *
   * Echoed on every answer, including when nothing was excluded: a caller must
   * be able to tell "no test callers" from "test callers, hidden by the default
   * scope". The count is never a blind spot and never truncation — codedocs
   * knows exactly what it withheld, and a blind spot is what it could not see.
   */
  readonly scope: Scope
}

/** Results returned against results available, and whether any were withheld. */
export interface Budget {
  readonly returned: number
  readonly available: number
  readonly truncated: boolean
}

/**
 * Every reason codedocs cannot answer, and the parameters each one carries.
 *
 * ADR 0011: an error message is free text and no field rule can classify it —
 * `--limit lots` interpolates whatever was typed, and a resolver error
 * interpolates a `SymbolId`. Splitting the sentence into a closed `code` and
 * typed `params` makes the classification structural: `report-bug`'s default
 * shape keeps every code and drops every parameter, and that stays true as
 * errors are added rather than needing a scrubbing rule kept in step.
 *
 * A parameter may therefore hold free text — `detail`, `expectation` — because
 * a parameter is the half that does not travel. A code may not.
 */
export interface ErrorParams {
  /** No operation was named, or `--help` was asked for. */
  readonly usage: Record<string, never>
  /** A flag the parser does not know. `detail` is Node's own sentence. */
  readonly 'unknown-flag': { readonly detail: string }
  readonly 'unknown-operation': { readonly name: string }
  /** An operation that needs a subject was given none. */
  readonly 'subject-required': {
    readonly operation: string
    /** What the operation calls its subject, e.g. `subject`, `pattern`. */
    readonly noun: string
  }
  readonly 'too-many-arguments': {
    readonly operation: string
    readonly noun: string
    /** How many were given, against the one that is allowed. */
    readonly got: number
  }
  /** `--depth` on an operation with no semantic depth. */
  readonly 'depth-unsupported': { readonly operation: string }
  /** A per-operation flag given to an operation that does not declare it. */
  readonly 'flag-unsupported': {
    /** The flag as spelled, without its `--`. */
    readonly flag: string
    readonly operation: string
  }
  readonly 'limit-invalid': { readonly value: string }
  /**
   * `--claims` without `--json`, which is the only renderer that carries them.
   *
   * Refused rather than ignored, for the reason every per-operation flag is: a
   * flag that does nothing reads as a flag that was honoured, and here it would
   * leave a caller believing an answer held claim expressions it never had.
   */
  readonly 'claims-requires-json': Record<string, never>
  /** A `--label` or `--exclude-label` that is not an `axis=value` codedocs knows. */
  readonly 'label-invalid': {
    /** The flag as spelled, without its `--`. */
    readonly flag: string
    readonly value: string
    readonly expectation: string
  }
  readonly 'depth-invalid': { readonly value: string }
  /** `--fail-on` given something that is not one of ADR 0005's verdicts. */
  readonly 'verdict-invalid': {
    readonly value: string
    readonly expectation: string
  }
  /** `codedocs.jsonc` exists and cannot be used. `key` is `''` for the file. */
  readonly 'config-invalid': {
    readonly key: string
    readonly expectation: string
  }
  /** A second `codedocs.jsonc` below the repository root. */
  readonly 'config-misplaced': {
    readonly found: string
    readonly expected: string
  }
  /** The index could not be opened at all, so there is no snapshot to name. */
  readonly 'index-unavailable': { readonly detail: string }
  /** The index opened and the operation threw. */
  readonly 'operation-failed': { readonly detail: string }
  /** `report-bug` given itself to reproduce, which writes two reports over one path. */
  readonly 'report-recursive': Record<string, never>
  /**
   * `report-bug` reproduced the failure and could not write the report.
   *
   * The one thing that operation owes, so it is the one thing that makes it
   * exit 2 — the reproduced failure is a field, never a reason to fail.
   */
  readonly 'report-unwritable': {
    readonly out: string
    readonly detail: string
  }
  /**
   * `docs draft --out` was pointed at a path that already holds a file.
   *
   * ADR 0013 gives it no `--force`: the file it would destroy is a document
   * somebody wrote by hand, and deleting one is a gesture that names its own
   * consequence. The draft itself is on stdout by the time this is raised, so
   * nothing that was computed is lost.
   */
  readonly 'draft-exists': { readonly out: string }
  /** `docs draft --out` could not write, for a reason `node:fs` gave. */
  readonly 'draft-unwritable': {
    readonly out: string
    readonly detail: string
  }
}

/** The closed set of error codes. A caller may branch on it exhaustively. */
export type ErrorCode = keyof ErrorParams

/**
 * An operation that could not answer. Carried instead of `result`, never beside
 * it.
 *
 * `stack` holds only the frames that resolve inside codedocs' own packages, each
 * one already rewritten to a package-relative path. Both halves of that matter:
 * a frame below ours is in the user's code, and the absolute prefix above ours
 * names the machine the user is on. Neither is a codedocs fact, so neither is
 * ever captured — the unfiltered stack does not travel far enough to be leaked.
 */
export type EnvelopeError = {
  [TCode in ErrorCode]: {
    readonly code: TCode
    readonly params: ErrorParams[TCode]
    readonly stack?: readonly string[]
  }
}[ErrorCode]

/** The fixed wrapper every answer carries, whatever the operation. */
export interface Envelope<TResult> {
  readonly operation: OperationName
  readonly schemaVersion: number
  readonly request: ResolvedRequest
  readonly snapshot: Snapshot
  /** Conditions for only the projects this answer touched, not the whole index. */
  readonly conditions: readonly ProjectConditions[]
  readonly blindSpots: readonly BlindSpot[]
  readonly budget: Budget
  readonly result?: TResult
  readonly error?: EnvelopeError
}

/** Everything an operation needs to fill the envelope's honesty fields. */
export interface AnswerContext {
  readonly snapshot: Snapshot
  readonly conditions: readonly ProjectConditions[]
  readonly blindSpots: readonly BlindSpot[]
}

/**
 * Build a success envelope, applying the limit and reporting what it withheld.
 *
 * The limit is applied here rather than in each operation so that truncation
 * cannot be reported inconsistently, and so `--json`'s unbounded default is one
 * decision rather than four.
 */
export function answer<TResult>(
  operation: OperationName,
  request: ResolvedRequest,
  context: AnswerContext,
  results: readonly TResult[],
): Envelope<readonly TResult[]> {
  const { limit } = request
  const returned = limit === null ? results : results.slice(0, limit)
  return {
    operation,
    schemaVersion: SCHEMA_VERSION,
    request,
    snapshot: context.snapshot,
    conditions: context.conditions,
    blindSpots: context.blindSpots,
    budget: {
      returned: returned.length,
      available: results.length,
      truncated: returned.length < results.length,
    },
    result: returned,
  }
}

/**
 * Build a success envelope around a result the envelope cannot bound itself.
 *
 * `answer` owns the limit because one list has one budget. `evidence` returns
 * several lists at once and ADR 0006 gives it **one `--limit` per kind**, so the
 * bounding happens before the envelope is built and the budget arrives already
 * counted. Everything else about the envelope is identical, which is the point
 * of it being built here rather than in the operation.
 */
export function assembled<TResult>(
  operation: OperationName,
  request: ResolvedRequest,
  context: AnswerContext,
  result: TResult,
  budget: Budget,
): Envelope<TResult> {
  return {
    operation,
    schemaVersion: SCHEMA_VERSION,
    request,
    snapshot: context.snapshot,
    conditions: context.conditions,
    blindSpots: context.blindSpots,
    budget,
    result,
  }
}

/**
 * Build a failure envelope. A genuine failure returns the same shape carrying
 * `error` instead of `result`, so a parser never meets a second shape.
 */
export function failure(
  operation: OperationName,
  request: ResolvedRequest,
  context: AnswerContext,
  error: EnvelopeError,
): Envelope<never> {
  return {
    operation,
    schemaVersion: SCHEMA_VERSION,
    request,
    snapshot: context.snapshot,
    conditions: context.conditions,
    blindSpots: context.blindSpots,
    budget: { returned: 0, available: 0, truncated: false },
    error,
  }
}
