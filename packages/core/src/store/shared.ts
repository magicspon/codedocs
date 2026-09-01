/**
 * Low-level helpers with no dependency on the rest of the store: the string
 * form of an interned node, and the total-order comparator every sorted read
 * uses.
 */

import type { CallSource, FilePath } from '../model.ts'

/**
 * The string form of an interned node.
 *
 * A file used as a call source is the node whose descriptor path is empty, so
 * one table addresses both halves of `CallSource` and `call_edge` needs no
 * column saying which namespace an endpoint came from.
 */
export const idOf = (path: string, qualified: string): CallSource =>
  qualified === '' ? path : `${path}#${qualified}`

/**
 * Split a `CallSource` back into its file and its descriptor path.
 *
 * On the first `#`, which is what `resolveSubject` already assumes: a descriptor
 * path may contain one inside a string literal, a repository path may not.
 */
export function partsOf(id: CallSource): [FilePath, string] {
  const at = id.indexOf('#')
  return at === -1 ? [id, ''] : [id.slice(0, at), id.slice(at + 1)]
}

export const compare = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0
