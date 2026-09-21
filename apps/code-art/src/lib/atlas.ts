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
  /** What fallow says about the file; absent when fallow did not run. */
  readonly health?: FileHealth
}

/**
 * One file's reading from fallow. Every file gets one when fallow ran: cycles,
 * copies and dead code are checked across the whole repo, so a file missing
 * from those lists truly has none.
 */
export interface FileHealth {
  /** Absent when fallow's health pass skipped the file (unreachable or ignored). */
  readonly score?: FileScore
  /** Hotspot score, 0–100: complexity times recent churn. `0` when not a hotspot. */
  readonly hotspot: number
  /** Commits in fallow's churn window; `0` when not a hotspot. */
  readonly commits: number
  /** Hotspot trend: `-1` cooling, `0` stable, `1` accelerating. */
  readonly trend: number
  /** Lines that belong to a clone group. */
  readonly duplicated: number
  /** Part of an import cycle. */
  readonly cyclic: boolean
  /** Reachable from no entry point. Only read when the repo has a fallow config. */
  readonly unused?: boolean
  /** Exports nothing imports. Only read when the repo has a fallow config. */
  readonly unusedExports?: number
}

/** fallow's complexity measures for one file. */
export interface FileScore {
  /** Maintainability index, 0–100: higher is easier to change. */
  readonly maintainability: number
  /** Cyclomatic complexity per line. */
  readonly density: number
  readonly cyclomatic: number
  readonly cognitive: number
  /** The worst function's CRAP score: complexity weighed against missing tests. */
  readonly crap: number
}

/** Which fallow produced an atlas's `health` readings, and how far to trust them. */
export interface FallowMeta {
  readonly version: string
  /**
   * Whether `unused` and `unusedExports` were read. Dead code depends on the
   * repo's entry points, which only a fallow config names; without one the
   * guesses are too often wrong to draw as fact.
   */
  readonly deadCode: boolean
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
  /** Present when fallow ran over the repo at export. */
  readonly fallow?: FallowMeta
  /** Files that share copied code, weighted by lines shared, heaviest first. */
  readonly clones?: readonly Link[]
}

/**
 * Symbol names, kept out of the atlas and read only once a file is picked:
 * vscode's half a million names would double what every page load parses.
 * Keyed by path, so one set serves a repository's index and its timeline;
 * per file, one list per `KINDS` entry, in source order.
 */
export type SymbolNames = Readonly<
  Record<string, readonly (readonly string[])[]>
>

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
