/**
 * Giving a fresh worktree the index the codedocs arm is told it already has.
 *
 * Every run gets its own worktree, and a fresh worktree has no index, so one
 * has to be there before the agent starts — in a process the benchmark is not
 * measuring. Charging the cold build to a run would compare one arm's search
 * against the other's search plus an index build, which is not the question.
 *
 * Building it every time is the same work over and over. An index is a pure
 * function of the tree it describes, and every replicate of a case reads the
 * same commit, so the build is done once per commit and kept in
 * `repos/.index-cache/<commit>/`.
 *
 * That is not the state-leak the per-run worktree exists to prevent. A cached
 * index is only ever taken from a tree that no agent has touched — this module
 * runs before the agent starts, and copies out immediately after building —
 * so what a later run receives is byte-for-byte what a fresh build at that
 * commit would have produced, and never anything an earlier run wrote.
 */

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { CODEDOCS, INDEX_CACHE } from '../core/paths.ts'

/** The directory codedocs keeps a working tree's index in. */
const STORE = '.codedocs'

/** What it cost to give one worktree its index, and where that index came from. */
export type Warmed = {
  seconds: number
  /** True when the index was copied from the cache rather than built. */
  fromCache: boolean
}

/** Where one commit's index is kept. */
function cacheFor(commit: string): string {
  return join(INDEX_CACHE, commit)
}

/**
 * Asks codedocs one question, which is what builds or revalidates the index.
 *
 * A name nothing matches keeps the answer empty, so the only work done is the
 * work of having an index to answer from.
 */
function query(root: string): void {
  execFileSync(CODEDOCS, ['symbol', '__warm__', '--cwd', root], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
}

/**
 * Puts a cached index into a worktree and revalidates it.
 *
 * The revalidation is not optional. A fresh checkout writes every file with a
 * new mtime, so the stat signature of every file differs from the one the index
 * recorded, and codedocs hashes each of them to find that the content is
 * identical. That pass costs seconds where a rebuild costs an hour — but it has
 * to happen here, before the agent starts, or the run under test would pay for
 * it.
 */
function restore(root: string, commit: string): number {
  const started = Date.now()
  cpSync(join(cacheFor(commit), STORE), join(root, STORE), {
    recursive: true,
  })
  query(root)
  return Math.round((Date.now() - started) / 1000)
}

/**
 * Builds the index in a worktree, and keeps a copy for the next run at this
 * commit.
 *
 * Copied out the moment the build finishes, while the tree is still exactly the
 * commit — the one point at which what is on disk is a pure function of the
 * commit and nothing else.
 */
function build(root: string, commit: string): number {
  const started = Date.now()
  query(root)
  const seconds = Math.round((Date.now() - started) / 1000)
  const cache = cacheFor(commit)
  // Written to a fresh directory: a half-copied cache from an interrupted run
  // would be restored as a valid index and answer from a truncated database.
  rmSync(cache, { recursive: true, force: true })
  mkdirSync(cache, { recursive: true })
  cpSync(join(root, STORE), join(cache, STORE), { recursive: true })
  return seconds
}

/** True when a commit's index has already been built and kept. */
export function isCached(commit: string): boolean {
  return existsSync(join(cacheFor(commit), STORE, 'index.db'))
}

/**
 * Gives `root` an index for `commit`, from the cache where there is one.
 *
 * Returns what it cost either way, so the harness can print the price of the
 * tree it handed the agent rather than hiding it. No metric reads either
 * number: this is the harness's cost, not the run's.
 */
export function warmIndex(root: string, commit: string): Warmed {
  mkdirSync(INDEX_CACHE, { recursive: true })
  return isCached(commit)
    ? { seconds: restore(root, commit), fromCache: true }
    : { seconds: build(root, commit), fromCache: false }
}
