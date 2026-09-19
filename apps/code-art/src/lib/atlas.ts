/**
 * The shape `scripts/export.ts` writes and every scene reads.
 *
 * Aggregated to one row per file rather than per symbol: vscode holds 527,160
 * symbols and 728,717 call edges, and the art needs their distribution, not
 * their names. Arrays of numbers keep a vscode export in the tens of MB.
 */

/** Symbol kinds, in the index's stored order (`packages/core/src/store/enums.ts`). */
export const KINDS: readonly string[] = [
  'function',
  'class',
  'interface',
  'typeAlias',
  'enum',
  'variable',
  'method',
  'namespace',
]

/** File roles, in the order the `role` label stores them. */
export const ROLES: readonly string[] = ['source', 'test', 'config']

/** One file, flattened to what a scene can turn into position, size and colour. */
export interface FileDatum {
  /** Repository-relative path. */
  readonly path: string
  /** Bytes on disk. */
  readonly size: number
  /** Symbol counts, indexed by `KINDS`. */
  readonly kinds: readonly number[]
  /** Index into `ROLES`; `0` when the index predates labels. */
  readonly role: number
  readonly generated: boolean
  /** Index into `Atlas.projects`, or `-1` for a file no tsconfig claims. */
  readonly project: number
  /** Resolved calls landing on symbols in this file, from other files. */
  readonly callsIn: number
  /** Resolved calls made from this file to other files. */
  readonly callsOut: number
  /** Calls that stay inside the file. */
  readonly callsSelf: number
  /** References of any kind landing on this file's symbols. */
  readonly refsIn: number
  /** Calls the analysis could not resolve: the file's blind spots. */
  readonly unresolved: number
}

/** A weighted file-to-file relation: `[fromIndex, toIndex, count]`. */
export type Link = readonly [number, number, number]

/** One exported index. */
export interface Atlas {
  /** The repository's directory name. */
  readonly name: string
  readonly commit: string
  readonly analysedAt: string
  /** tsconfig paths, which `FileDatum.project` indexes. */
  readonly projects: readonly string[]
  readonly files: readonly FileDatum[]
  /** Cross-file calls, heaviest first, capped by the exporter. */
  readonly calls: readonly Link[]
  /** Resolved imports, weight always `1`. */
  readonly imports: readonly Link[]
}

/** Total symbols in one file. */
export function symbolCount(file: FileDatum): number {
  let total = 0
  for (const n of file.kinds) total += n
  return total
}

/** One commit a timeline frame was analysed at. */
export interface Commit {
  readonly sha: string
  /** ISO commit date. */
  readonly date: string
  /** The commit message's first line. */
  readonly subject: string
}

/** A repository at several commits, oldest first: one atlas per frame. */
export interface Timeline {
  readonly name: string
  readonly commits: readonly Commit[]
  readonly frames: readonly Atlas[]
}
