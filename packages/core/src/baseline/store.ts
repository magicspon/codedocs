/**
 * Baselines on disk: capture, retention, and opening one to read.
 *
 * ADR 0008: a baseline is **recorded by normal use, never constructed, and never
 * leaves the machine**. Rebuilding one is not slow, it is impossible at usable
 * fidelity — a `git worktree` of an old commit has no `node_modules`, and ADR
 * 0001 forbids running the install, so every file in it would be `syntactic`
 * and diffed against a typed working tree.
 *
 * So there is no `baseline save` operation. A baseline exists only because
 * codedocs analysed that commit while it was the working tree.
 */

import { DatabaseSync } from 'node:sqlite'
import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

import {
  commitDate,
  isAncestor,
  isAncestorOfHead,
  isCleanTree,
  resolveRef,
} from '../git.ts'
import { namingFor } from '../naming.ts'
import { STORE_SCHEMA_VERSION, type Store } from '../store/index.ts'

/** Where baselines live, beside the index they were copied from. */
export const BASELINE_DIR = 'base'

/** One stored baseline, as the directory listing describes it. */
export interface StoredBaseline {
  readonly commit: string
  readonly path: string
  /** The commit's own date, or `null` where git no longer knows the commit. */
  readonly committedAt: string | null
  /** Whether it is an ancestor of `HEAD`, which is what makes it usable. */
  readonly ancestor: boolean
  readonly bytes: number
}

/** The directory baselines are kept in, created on demand. */
const directoryFor = (root: string): string =>
  join(root, '.codedocs', BASELINE_DIR)

/**
 * Every stored baseline, newest commit first.
 *
 * Ancestry and commit date come from git rather than from the file: a baseline
 * is named by its commit, and the file's mtime says when it was copied rather
 * than what it describes.
 */
export function listBaselines(root: string): StoredBaseline[] {
  let entries: string[]
  try {
    entries = readdirSync(directoryFor(root))
  } catch {
    return [] // No directory yet, which is the ordinary case.
  }
  const found = entries
    .filter((name) => name.endsWith('.db'))
    .map((name) => {
      const commit = name.slice(0, -'.db'.length)
      const path = join(directoryFor(root), name)
      return {
        commit,
        path,
        committedAt: commitDate(root, commit),
        ancestor: isAncestorOfHead(root, commit),
        bytes: sizeOf(path),
      }
    })
  return found.sort(byNewest(root))
}

/**
 * Newest commit first, with a baseline git no longer knows sorting last.
 *
 * Commit dates have second granularity, so two commits made in the same second
 * tie — and the tie is broken by ancestry, because eviction reads the tail of
 * this list and getting it backwards would evict the newest baseline.
 */
const byNewest =
  (root: string) =>
  (a: StoredBaseline, b: StoredBaseline): number =>
    byDate(a, b) || byAncestry(root, a, b)

/** Newest date first; a commit git no longer knows has no date and sorts last. */
function byDate(a: StoredBaseline, b: StoredBaseline): number {
  if (a.committedAt === b.committedAt) return 0
  if (a.committedAt === null) return 1
  if (b.committedAt === null) return -1
  return a.committedAt < b.committedAt ? 1 : -1
}

/**
 * Descendant first, falling back to the id.
 *
 * The lexical fallback is only for two commits with no ancestry between them,
 * where "newer" means nothing and the order only has to be total.
 */
function byAncestry(
  root: string,
  a: StoredBaseline,
  b: StoredBaseline,
): number {
  if (isAncestor(root, a.commit, b.commit)) return 1
  if (isAncestor(root, b.commit, a.commit)) return -1
  return a.commit < b.commit ? -1 : 1
}

const sizeOf = (path: string): number => {
  try {
    return statSync(path).size
  } catch {
    return 0
  }
}

/** What one capture did, so `analyse` can report it rather than doing it silently. */
export interface Capture {
  /** The commit captured, or `null` where nothing was. */
  readonly commit: string | null
  /** Why nothing was captured, or `null` where something was. */
  readonly declined: string | null
  /** The baselines evicted to stay inside the cap. */
  readonly evicted: readonly string[]
  readonly bytes: number
}

/**
 * Copy the finished index into a baseline, and evict down to the cap.
 *
 * Called after the analysis has committed and before anything else writes, so
 * the copy is an index for exactly the commit it is named after. A tree that is
 * not clean is declined rather than captured under a name it does not deserve —
 * a snapshot is a commit plus whatever is uncommitted on top of it, and a
 * baseline is an index for a commit.
 *
 * The commit is read here rather than taken from the caller, and read from git
 * rather than from the index header. The header records the commit that was
 * checked out when the index was last *repaired*, and committing changes no
 * file — so a commit made after an analysis would otherwise name its baseline
 * after its parent.
 *
 * @param cap - `codedocs.jsonc`'s `baselines`. `0` disables capture entirely.
 */
export function capture(root: string, store: Store, cap: number): Capture {
  const nothing = { commit: null, evicted: [], bytes: 0 }
  if (cap <= 0) return { ...nothing, declined: 'baselines are disabled' }
  const commit = resolveRef(root, 'HEAD')
  if (commit === null) {
    return { ...nothing, declined: 'this checkout is not a git repository' }
  }
  if (!isCleanTree(root)) {
    return {
      ...nothing,
      declined: 'the working tree is not clean, so this index is for no commit',
    }
  }

  const directory = directoryFor(root)
  mkdirSync(directory, { recursive: true })
  const path = join(directory, `${commit}.db`)
  try {
    // The index runs in WAL mode, so the pages this analysis wrote may still be
    // in the log rather than in the file a copy would take. A checkpoint first
    // is the difference between a baseline and an older index wearing a new
    // commit's name.
    store.db.exec('pragma wal_checkpoint(truncate)')
    copyFileSync(join(store.directory, 'index.db'), path)
  } catch (error) {
    return {
      ...nothing,
      declined: `the index could not be copied: ${message(error)}`,
    }
  }

  return {
    commit,
    declined: null,
    evicted: evict(root, cap),
    bytes: sizeOf(path),
  }
}

/**
 * Evict down to the cap: non-ancestors first, then oldest by commit date.
 *
 * Evicting non-ancestors first *is* the whole branch-switching story — a
 * baseline for yesterday's abandoned branch tip is an ancestor of nothing, so it
 * is worthless to the selection rule and leaves first. That is why there is no
 * branch tracking anywhere in codedocs.
 */
function evict(root: string, cap: number): string[] {
  const held = listBaselines(root)
  if (held.length <= cap) return []
  // Newest-first among ancestors, then the non-ancestors, so the tail of this
  // list is exactly what leaves.
  const ordered = [
    ...held.filter((one) => one.ancestor),
    ...held.filter((one) => !one.ancestor),
  ]
  const evicted: string[] = []
  for (const baseline of ordered.slice(cap)) {
    try {
      rmSync(baseline.path, { force: true })
      evicted.push(baseline.commit)
    } catch {
      // A baseline that cannot be deleted is not a reason to fail an analysis;
      // the next capture tries again.
    }
  }
  return evicted.sort()
}

/**
 * Open a stored baseline read-only.
 *
 * Read-only because ADR 0008 makes a baseline written once and thereafter read
 * or deleted, never updated — and because a schema mismatch must not silently
 * rewrite an index that cannot be rebuilt. A baseline from another schema is
 * refused rather than migrated: an upgrade discards every baseline, and that
 * cost is stated rather than engineered away.
 */
export function openBaseline(root: string, path: string): Store | null {
  let db: DatabaseSync
  try {
    db = new DatabaseSync(path, { readOnly: true })
  } catch {
    return null
  }
  // The version read is guarded for the same reason the open is: sqlite opens
  // the file lazily, so a `.db` that is not a database — a truncated copy, a
  // half-written file left by a killed process — fails here rather than above.
  // A baseline is optional, so an unreadable one degrades the answer to the
  // no-baseline path rather than failing it.
  let version: number
  try {
    const row = db.prepare('pragma user_version').get() as
      | { user_version?: number }
      | undefined
    version = row?.user_version ?? 0
  } catch {
    db.close()
    return null
  }
  if (version !== STORE_SCHEMA_VERSION) {
    db.close()
    return null
  }
  // Handed back as a `Store` so every existing read works against a baseline
  // unchanged: an index is an index, and the only thing that makes this one
  // different is that nothing may write to it.
  // The naming comes from the working tree rather than from the baseline: a
  // baseline holds the same two halves of an id, and the manifests that say
  // which package a file is in are the ones on disk now.
  return {
    db,
    directory: dirname(path),
    naming: namingFor(root),
    discarded: null,
    close: () => db.close(),
  }
}

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)
