/**
 * ADR 0006's envelope: one shape, every operation, success and failure alike.
 *
 * Only `result` differs between operations. A single test can therefore assert
 * that every operation names its snapshot and its blind spots, and an agent
 * learns the honesty fields once rather than once per operation.
 */

import type { Fidelity, FilePath } from './model.ts'

/** One integer over the envelope and every result shape. */
export const SCHEMA_VERSION: number = 1

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

/** An operation that could not answer. Carried instead of `result`, never beside it. */
export interface EnvelopeError {
  readonly code: string
  readonly message: string
}

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
