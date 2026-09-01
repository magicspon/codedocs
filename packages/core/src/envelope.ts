/**
 * ADR 0006's envelope: one shape, every operation, success and failure alike.
 *
 * Only `result` differs between operations. A single test can therefore assert
 * that every operation names its snapshot and its blind spots, and an agent
 * learns the honesty fields once rather than once per operation.
 */

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
 */
export const SCHEMA_VERSION: number = 3

/**
 * The operation set. Phase 5's names are absent rather than reserved: the
 * skeleton ships four, and adding one is a manifest entry.
 *
 * TODO(#10): widen to ADR 0006's full table as each operation lands.
 */
export type OperationName =
  | 'analyse'
  | 'symbol'
  | 'callers'
  | 'callees'
  | 'trace'

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
  readonly 'limit-invalid': { readonly value: string }
  readonly 'depth-invalid': { readonly value: string }
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
