/**
 * Low-level helpers with no dependency on the rest of the store: the string
 * form of an interned node, and the total-order comparator every sorted read
 * uses.
 */

import type { CallSource, FilePath } from '../model.ts'
import type { Naming } from '../naming.ts'
import { parseSymbolId } from '../symbol-id.ts'

/**
 * The string form of an interned node.
 *
 * A file used as a call source is the node whose descriptors are empty, and it
 * keeps the path as its identity per ADR 0002's node table — so one table
 * addresses both halves of `CallSource` and `call_edge` needs no column saying
 * which namespace an endpoint came from.
 */
export const idOf = (
  naming: Naming,
  path: string,
  descriptors: string,
): CallSource => (descriptors === '' ? path : naming.idOf(path, descriptors))

/**
 * Split a `CallSource` back into its file and its descriptors.
 *
 * A `SymbolId` carries both; anything else is a `FilePath`, which is a file
 * node and has no descriptors. Nothing here consults a package: the id says
 * which file it belongs to, which is what makes the write side able to intern
 * an id it did not build.
 */
export function partsOf(id: CallSource): [FilePath, string] {
  const parts = parseSymbolId(id)
  return parts === undefined ? [id, ''] : [parts.file, parts.descriptors]
}

export const compare = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0
