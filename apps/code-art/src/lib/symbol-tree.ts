import { KINDS, type FileSymbols } from './atlas.ts'

/**
 * A file's symbols as a tree: what is declared directly in the file (the
 * planets), and what each symbol declares inside it (its moons).
 */
export interface SymbolTree {
  readonly symbols: FileSymbols
  /** Top-level symbols, in source order. */
  readonly roots: readonly number[]
  /** Each symbol's own children, in source order. */
  readonly children: readonly (readonly number[])[]
}

/** Builds the tree from each symbol's parent. */
export function treeOf(symbols: FileSymbols): SymbolTree {
  const roots: number[] = []
  const children: number[][] = symbols.names.map(() => [])
  symbols.parents.forEach((parent, i) => {
    ;(parent < 0 ? roots : children[parent])?.push(i)
  })
  return { symbols, roots, children }
}

/** `members` split by kind, one list per `KINDS` entry, keeping their order. */
export function byKind(
  symbols: FileSymbols,
  members: readonly number[],
): number[][] {
  const lists: number[][] = KINDS.map(() => [])
  for (const i of members) lists[symbols.kinds[i]!]?.push(i)
  return lists
}
