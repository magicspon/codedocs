/**
 * The symbol sweep: every declaration in a file set, collapsed to one `Symbol`
 * node per id, with the collision and durability decisions ADR 0002 makes
 * explicit rather than leaving to the store's `insert or ignore`.
 */

import type { Node } from 'typescript/unstable/ast'

import type { SymbolId, SymbolNode } from '../../model.ts'
import {
  declarationSpace,
  descriptorPath,
  isCallable,
  isDurable,
  NAMED_DECLARATION,
} from './descriptors.ts'
import { declarationKey, lineOf, nameOf } from './shared.ts'
import type { DeclarationSite, OwnedFile } from './types.ts'

/** The symbol table, plus the join index the edge sweep resolves against. */
export interface SymbolSweep {
  readonly nodes: readonly SymbolNode[]
  /**
   * Program path and declaration offset to `SymbolId`. Alive for one extraction
   * and never persisted: ADR 0002 rejected `(path, offset)` as identity, not as
   * a build-time join.
   */
  readonly byDeclaration: ReadonlyMap<string, SymbolId>
  /** The offsets the node rows do not carry. See `AdapterResult.declarations`. */
  readonly declarations: readonly DeclarationSite[]
}

/** One declaration's claim on an id, and the space it claimed it from. */
interface Claim {
  readonly space: Node | undefined
  readonly row: SymbolNode
}

/**
 * Every declaration in the given files, one `Symbol` node per id.
 *
 * Where several declarations claim one id, the adapter decides here whether that
 * is ADR 0002's deliberate collapse or a collision, and says which — rather than
 * leaving the store's `insert or ignore` to merge them silently, which reported
 * the union of 69 unrelated bindings' callers as `deterministic`.
 */
export function sweepSymbols(files: readonly OwnedFile[]): SymbolSweep {
  const nodes: SymbolNode[] = []
  const byDeclaration = new Map<string, SymbolId>()
  const declarations: DeclarationSite[] = []

  for (const { programPath, path, sf } of files) {
    // Per file, because an id carries its file: two files can never claim one id.
    const claimed = new Map<SymbolId, Claim[]>()

    const walk = (node: Node): void => {
      const kind = NAMED_DECLARATION.get(node.kind)
      const name = nameOf(node)
      if (kind !== undefined && name !== undefined) {
        const start = node.getStart(sf)
        const qualified = descriptorPath(node, sf)
        const id = `${path}#${qualified}`
        const claim: Claim = {
          space: declarationSpace(node),
          row: {
            id,
            name,
            qualified,
            kind,
            file: path,
            start,
            line: lineOf(sf, start),
            durable: isDurable(node),
            callable: isCallable(node),
            collisions: 0,
          },
        }
        const claims = claimed.get(id)
        if (claims === undefined) claimed.set(id, [claim])
        else claims.push(claim)
        // Every declaration joins, not only the one that became the node: an
        // edge into the third overload has to find the id the first one claimed.
        byDeclaration.set(declarationKey(programPath, start), id)
      }
      node.forEachChild(walk)
    }
    sf.forEachChild(walk)

    for (const claims of claimed.values()) {
      // First in source order wins the row, which is the declaration the store's
      // `insert or ignore` kept before this decision was made explicit.
      const first = claims[0]!.row
      const spaces = new Set(claims.map((claim) => claim.space))
      nodes.push(
        spaces.size > 1 ? { ...first, collisions: claims.length } : first,
      )
      // The rest lose the row but keep the id, and a call site may land on any
      // of them. Recorded so a later extraction that has none of this file in
      // memory can still join against the one it hit.
      for (const claim of claims.slice(1)) {
        declarations.push({
          file: claim.row.file,
          start: claim.row.start,
          id: first.id,
        })
      }
    }
  }
  return { nodes, byDeclaration, declarations }
}
