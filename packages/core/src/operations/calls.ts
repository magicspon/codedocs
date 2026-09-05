/**
 * `callers` and `callees` — the two directions of the call edge set.
 *
 * One module because they differ only in which column they read: keeping them
 * apart would duplicate the subject resolution, the ambiguity handling and the
 * sort key, which is three chances for the two to disagree.
 *
 * ADR 0014: several subjects may be given at once, and `result` is one entry
 * per subject, keyed the same way whether one was given or many.
 */

import {
  batchedAnswer,
  type AnswerContext,
  type BatchedEnvelope,
} from '../envelope.ts'
import { applyScope, type Scoping } from '../labels/index.ts'
import type { CallEdge, SymbolNode } from '../model.ts'
import { readCalleesOf, readCallersOf, type Store } from '../store/index.ts'
import { scopeTo } from './scope.ts'
import { noteCollisions, resolveSubject } from './subject.ts'

/**
 * Every call edge into each subject, one entry per subject.
 *
 * An ambiguous subject returns the union across every symbol it resolved to,
 * and the envelope's `request.resolved` names them, so a caller can tell one
 * `login` from another without a second round trip.
 */
export function callers(
  store: Store,
  context: AnswerContext,
  subjects: readonly string[],
  limit: number | null,
  scoping: Scoping,
): BatchedEnvelope<readonly CallEdge[]> {
  return collect(store, context, subjects, limit, scoping, 'callers')
}

/** Every call edge out of each subject, one entry per subject. */
export function callees(
  store: Store,
  context: AnswerContext,
  subjects: readonly string[],
  limit: number | null,
  scoping: Scoping,
): BatchedEnvelope<readonly CallEdge[]> {
  return collect(store, context, subjects, limit, scoping, 'callees')
}

/**
 * Every call edge one direction from a set of already-resolved symbols.
 *
 * Split out for `evidence`, which reports both directions about one subject and
 * must read them by the same union and the same sort key these operations do —
 * two answers about one symbol disagreeing about order is the failure ADR 0006's
 * sort key exists to forbid.
 */
export function callEdgesOf(
  store: Store,
  resolved: readonly SymbolNode[],
  direction: 'callers' | 'callees',
): CallEdge[] {
  const read = direction === 'callers' ? readCallersOf : readCalleesOf
  // Re-sorted after the union because each symbol's rows arrive already sorted
  // but the concatenation of two sorted lists is not.
  return resolved
    .flatMap((node) => read(store, node.id))
    .sort(
      (a, b) =>
        compare(a.from, b.from) ||
        compare(a.to, b.to) ||
        compare(a.file, b.file) ||
        a.line - b.line,
    )
}

function collect(
  store: Store,
  context: AnswerContext,
  subjects: readonly string[],
  limit: number | null,
  scoping: Scoping,
  direction: 'callers' | 'callees',
): BatchedEnvelope<readonly CallEdge[]> {
  const entries = subjects.map((subject) => {
    const resolved = resolveSubject(store, subject)
    // The site's file is the join: for `callers` that is the caller's own
    // file, which is what "which of these callers are in test files" asks
    // about.
    const { kept: edges, scope } = applyScope(
      scoping,
      callEdgesOf(store, resolved, direction),
      (edge) => edge.file,
    )
    const subjectContext = noteCollisions(
      scopeTo(store, context, [
        ...resolved.map((node) => node.file),
        ...edges.map((e) => e.file),
      ]),
      resolved,
    )
    return {
      subject,
      resolved: resolved.map((node) => node.id),
      excluded: scope.excluded,
      blindSpots: subjectContext.blindSpots,
      conditions: subjectContext.conditions,
      items: edges,
    }
  })
  return batchedAnswer(
    direction,
    context.snapshot,
    limit,
    scoping.scope,
    entries,
  )
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
