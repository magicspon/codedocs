/**
 * `references` — everything that names a subject without calling it.
 *
 * The half of the relationship set `callers` and `callees` cannot answer, and
 * the reason it is built first: a changed type reaches everything that *names*
 * it, so `impact` cannot be honest without this.
 *
 * Both directions in one answer, because a reference has no natural direction
 * to ask about separately: `callers`/`callees` split because a call graph is
 * walked one way at a time, while "what names `Money`" and "what does `price`
 * name" are the same question about the same edge, and splitting them would
 * make an agent ask twice to learn what one answer holds.
 */

import { answer, type AnswerContext, type Envelope } from '../envelope.ts'
import { applyScope, type Scoping } from '../labels/index.ts'
import type { ReferenceEdge } from '../model.ts'
import {
  byReference,
  readReferencesFrom,
  readReferencesTo,
  type Store,
} from '../store/index.ts'
import { scopeTo } from './scope.ts'
import { noteCollisions, resolveSubject } from './subject.ts'

/**
 * Every non-call reference edge into and out of a subject.
 *
 * An ambiguous subject returns the union across every symbol it resolved to,
 * and `request.resolved` names them, exactly as the call operations do.
 */
export function references(
  store: Store,
  context: AnswerContext,
  subject: string,
  limit: number | null,
  scoping: Scoping,
): Envelope<readonly ReferenceEdge[]> {
  const resolved = resolveSubject(store, subject)
  const subjects = new Set(resolved.map((node) => node.id))
  const outgoing = resolved.flatMap((node) =>
    readReferencesFrom(store, node.id),
  )
  // One edge between two symbols an ambiguous subject both resolved to is read
  // twice — once out of its source and once into its target — and it is one
  // fact. Dropping it from the incoming half is exact where deduplicating the
  // rows would not be: two references to one target on one line are two facts
  // that no stored column tells apart.
  const incoming = resolved
    .flatMap((node) => readReferencesTo(store, node.id))
    .filter((edge) => !subjects.has(edge.from))

  // Re-sorted after the union: each read arrives sorted, and the concatenation
  // of sorted lists is not.
  const { kept: edges, scope } = applyScope(
    scoping,
    [...outgoing, ...incoming].sort(byReference),
    (edge) => edge.file,
  )

  return answer(
    'references',
    {
      subject,
      resolved: resolved.map((node) => node.id),
      limit,
      depth: null,
      scope,
    },
    noteCollisions(
      scopeTo(store, context, [
        ...resolved.map((node) => node.file),
        ...edges.map((edge) => edge.file),
      ]),
      resolved,
    ),
    edges,
  )
}
