/**
 * Low-level helpers with no dependency on the rest of the adapter: reading a
 * declared name off a node, filtering the program's own files from
 * `node_modules`, rendering a line number, and the join key between a checker
 * declaration and the symbol table.
 */

import type { Node, SourceFile } from 'typescript/unstable/ast'

/** A node that carries a declared name. The AST types do not narrow this for us. */
interface NamedNode extends Node {
  readonly name?: { readonly text?: string }
}

export const nameOf = (node: Node): string | undefined =>
  (node as NamedNode).name?.text

/**
 * A file the repository owns. `node_modules` and the default libraries are
 * walked by the program but are never nodes: cal.com's sweep left 92,673 call
 * sites crossing into `node_modules` against 26,091 resolved in-repo.
 */
export const isRepoFile = (path: string): boolean =>
  !path.includes('/node_modules/') && !/\/lib\.[a-z0-9.]*d\.ts$/.test(path)

/** 1-based line of a position, for rendering `file:line`. */
export const lineOf = (sourceFile: SourceFile, position: number): number =>
  sourceFile.getLineAndCharacterOfPosition(position).line + 1

/**
 * The join key between a resolved checker symbol and the symbol table.
 *
 * Lower-cased on both sides because `NodeHandle.path` is case-normalised on
 * macOS while `Program.getSourceFileNames()` is not. Left unnormalised, this
 * presents as a total edge disagreement that is purely a casing artefact.
 */
export const declarationKey = (path: string, start: number): string =>
  `${path.toLowerCase()}:${start}`
