/**
 * Naming a subject.
 *
 * ADR 0006: whatever an operation prints as an identifier is accepted as input.
 * Three forms are read — the shorthand with a path (exact), the same without one
 * (which may resolve to several), and a full `SymbolId`, because `--json` emits
 * those and round-tripping must work.
 *
 * While the skeleton's `SymbolId` *is* the shorthand-with-path, the first and
 * third forms coincide. They stop coinciding when ADR 0002's SCIP scheme lands,
 * and this function is where that costs one branch rather than four.
 */

import { readSymbol, readSymbols, type Store } from '../store.ts'
import type { SymbolId, SymbolNode } from '../model.ts'

/**
 * Resolve a subject to the symbols it names.
 *
 * An ambiguous subject is not an error: the candidates are the answer to "which
 * did you mean", and returning them costs one round trip fewer. An empty result
 * means nothing matched.
 */
export function resolveSubject(store: Store, subject: string): SymbolNode[] {
  if (subject.includes('#')) {
    const exact = readSymbol(store, subject as SymbolId)
    return exact === undefined ? [] : [exact]
  }
  // A bare qualified name, e.g. `AuthService.login`. Matched against the dotted
  // path first, then the declared name, so `login` finds a method nobody
  // qualified. Sorted by id for ADR 0006's total order.
  const all = readSymbols(store)
  const qualified = all.filter((symbol) => symbol.qualified === subject)
  const matches =
    qualified.length > 0 ? qualified : all.filter((s) => s.name === subject)
  return matches.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}
