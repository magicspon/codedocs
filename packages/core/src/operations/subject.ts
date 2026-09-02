/**
 * Naming a subject.
 *
 * ADR 0006: whatever an operation prints as an identifier is accepted as input.
 * Three forms are read — the shorthand with a path (exact), the same without one
 * (which may resolve to several), and a full `SymbolId`, because `--json` emits
 * those and round-tripping is the only way an agent can feed an answer back in.
 *
 * The scheme prefix is what tells the third form from the first: a `SymbolId`
 * begins `codedocs `, and neither of the other two may contain a space before a
 * path. Nothing here guesses — a subject that parses as an id is looked up as
 * one, and a subject that does not is a shorthand.
 */

import type { AnswerContext } from '../envelope.ts'
import {
  readSymbol,
  readSymbols,
  readSymbolsShorthand,
  type Store,
} from '../store/index.ts'
import type { SymbolId, SymbolNode } from '../model.ts'
import { compare } from '../store/shared.ts'
import { isSymbolId, shorthandOf, splitShorthand } from '../symbol-id.ts'

/**
 * Resolve a subject to the symbols it names.
 *
 * An ambiguous subject is not an error: the candidates are the answer to "which
 * did you mean", and returning them costs one round trip fewer. An empty result
 * means nothing matched.
 */
export function resolveSubject(store: Store, subject: string): SymbolNode[] {
  if (isSymbolId(subject)) {
    const exact = readSymbol(store, subject as SymbolId)
    return exact === undefined ? [] : [exact]
  }
  if (subject.includes('#')) {
    // The shorthand with a path. Exact in ADR 0005's sense — it names one
    // descriptor path in one file — but the descriptors it projects from can be
    // claimed by more than one declaration, which is a collision the answer
    // reports rather than a choice it makes.
    const [path, dotted] = splitShorthand(subject)
    return readSymbolsShorthand(store, path, dotted)
  }
  // A bare qualified name, e.g. `AuthService.login`. Matched against the dotted
  // path first, then the declared name, so `login` finds a method nobody
  // qualified. Sorted by id for ADR 0006's total order.
  const all = readSymbols(store)
  const qualified = all.filter((symbol) => symbol.qualified === subject)
  const matches =
    qualified.length > 0 ? qualified : all.filter((s) => s.name === subject)
  return matches.sort((a, b) => compare(a.id, b.id))
}

/**
 * Name every subject whose id unrelated declarations also claim.
 *
 * ADR 0001: an answer is complete or it names its blind spots. A collided id's
 * edges really are the union of every binding claiming it, so an operation that
 * walks them over-reports — and the honest form of an over-report is one that
 * says so rather than one presented as `deterministic`.
 *
 * Only the edge-walking operations call this. `symbol` lists its rows rather
 * than taking their union, and each row carries `collisions` itself, so a blind
 * spot there would repeat a fact the answer already contains.
 */
export function noteCollisions(
  context: AnswerContext,
  subjects: readonly SymbolNode[],
): AnswerContext {
  const collided = subjects.filter((node) => node.collisions > 0)
  if (collided.length === 0) return context
  return {
    ...context,
    blindSpots: [
      ...context.blindSpots,
      ...collided.map((node) => ({
        // The shorthand, because a blind spot is read: `request.resolved`
        // already carries the id the answer is round-tripped through.
        subject: shorthandOf(node.id),
        reason:
          `${node.collisions} declarations in ${node.file} claim this id, so ` +
          'this answer is their union. Same-named locals in sibling blocks ' +
          'share a descriptor path when the blocks carry no name to tell them ' +
          'apart; read the file at the sites listed to see which was meant.',
      })),
    ],
  }
}
