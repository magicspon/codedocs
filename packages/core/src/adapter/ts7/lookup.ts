/**
 * Matching a resolved checker symbol back to the symbol table.
 *
 * Shared by the call and reference sweeps, which ask the same question of
 * different nodes: the in-memory join covers the files this extraction swept,
 * and anything else falls through to the index — which is what lets a wave of
 * three files produce edges into the thousands it did not look at.
 */

import type { Project, Symbol as CheckerSymbol } from 'typescript/unstable/sync'

import type { SymbolId } from '../../model.ts'
import { declarationKey } from './shared.ts'
import type { DeclarationResolver, View } from './types.ts'

/** The `SymbolId` a checker symbol's declarations name, or `undefined`. */
function lookup(
  project: Project,
  symbol: CheckerSymbol,
  view: View,
  byDeclaration: ReadonlyMap<string, SymbolId>,
  resolve: DeclarationResolver | undefined,
): SymbolId | undefined {
  for (const declaration of symbol.declarations) {
    const node = declaration.resolve(project)
    if (!node) continue
    const sf = project.program.getSourceFile(declaration.path)
    if (!sf) continue
    const start = node.getStart(sf)
    const hit = byDeclaration.get(declarationKey(declaration.path, start))
    if (hit !== undefined) return hit
    if (resolve === undefined) continue
    const path = view.repoPathOf.get(String(declaration.path).toLowerCase())
    if (path === undefined) continue
    const stored = resolve(path, start)
    if (stored !== undefined) return stored
  }
  return undefined
}

/**
 * The same lookup, following an alias once.
 *
 * An import or re-export binding resolves to the alias symbol, so a target
 * absent from the symbol table is followed through `getAliasedSymbol` before
 * being called external.
 */
export function lookupDeclaration(
  project: Project,
  symbol: CheckerSymbol,
  view: View,
  byDeclaration: ReadonlyMap<string, SymbolId>,
  resolve: DeclarationResolver | undefined,
): SymbolId | undefined {
  const direct = lookup(project, symbol, view, byDeclaration, resolve)
  if (direct !== undefined) return direct
  try {
    const aliased = project.checker.getAliasedSymbol(symbol)
    return aliased
      ? lookup(project, aliased, view, byDeclaration, resolve)
      : undefined
  } catch {
    // Not an alias, so the target is simply outside the repository.
    return undefined
  }
}
