/**
 * `callers` and `callees` — the two directions of the call edge set.
 *
 * One module because they differ only in which column they read: keeping them
 * apart would duplicate the subject resolution, the ambiguity handling and the
 * sort key, which is three chances for the two to disagree.
 */

import { answer, type AnswerContext, type Envelope } from '../envelope.ts'
import type { CallEdge } from '../model.ts'
import { readCalleesOf, readCallersOf, type Store } from '../store.ts'
import { scopeTo } from './scope.ts'
import { resolveSubject } from './subject.ts'

/**
 * Every call edge into the subject.
 *
 * An ambiguous subject returns the union across every symbol it resolved to,
 * and the envelope's `request.resolved` names them, so a caller can tell one
 * `login` from another without a second round trip.
 */
export function callers(
  store: Store,
  context: AnswerContext,
  subject: string,
  limit: number | null,
): Envelope<readonly CallEdge[]> {
  return collect(store, context, subject, limit, 'callers')
}

/** Every call edge out of the subject. */
export function callees(
  store: Store,
  context: AnswerContext,
  subject: string,
  limit: number | null,
): Envelope<readonly CallEdge[]> {
  return collect(store, context, subject, limit, 'callees')
}

function collect(
  store: Store,
  context: AnswerContext,
  subject: string,
  limit: number | null,
  direction: 'callers' | 'callees',
): Envelope<readonly CallEdge[]> {
  const resolved = resolveSubject(store, subject)
  const read = direction === 'callers' ? readCallersOf : readCalleesOf
  const edges = resolved.flatMap((node) => read(store, node.id))

  // Re-sorted after the union because each symbol's rows arrive already sorted
  // but the concatenation of two sorted lists is not.
  edges.sort(
    (a, b) =>
      compare(a.from, b.from) ||
      compare(a.to, b.to) ||
      compare(a.file, b.file) ||
      a.line - b.line,
  )

  return answer(
    direction,
    { subject, resolved: resolved.map((node) => node.id), limit, depth: null },
    scopeTo(store, context, [
      ...resolved.map((node) => node.file),
      ...edges.map((e) => e.file),
    ]),
    edges,
  )
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
