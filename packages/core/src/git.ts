/**
 * The read-only git probes baselines need.
 *
 * Git is deliberately absent from the drift path — `git status` is 90 ms, cannot
 * see the untracked files a project still globs, and collapses in a checkout
 * that is not a repository. None of that applies here: a [[Baseline]] is an
 * index for a **commit**, which is a question only git can answer, and every
 * probe below runs at most once per `analyse` rather than before every answer.
 *
 * Every one of them answers `null` rather than throwing. A checkout that is not
 * a repository has no ancestors, no merge base and no clean tree, and saying so
 * is how capture stays optional instead of becoming a requirement.
 */

import { execFileSync } from 'node:child_process'

/** Run one git command, or return `null` where git could not answer. */
function git(root: string, args: readonly string[]): string | null {
  try {
    return execFileSync('git', [...args], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

/** The commit a ref names, or `null` where it names none. */
export const resolveRef = (root: string, ref: string): string | null =>
  git(root, ['rev-parse', '--verify', `${ref}^{commit}`])

/**
 * Whether the working tree matches `HEAD` exactly.
 *
 * The gate on capture, and the one place codedocs asks git about the tree: a
 * snapshot is a commit *plus whatever is uncommitted on top of it*, so an index
 * built over anything but a clean tree is an index for no commit at all.
 * Untracked files count — a file a project globs is in the index whether or not
 * git tracks it.
 */
export function isCleanTree(root: string): boolean {
  const status = git(root, ['status', '--porcelain'])
  return status === ''
}

/** Whether one commit is an ancestor of another. */
export function isAncestor(
  root: string,
  ancestor: string,
  descendant: string,
): boolean {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
      cwd: root,
      stdio: 'ignore',
    })
    return true
  } catch {
    // Exit 1 is "not an ancestor" and any other failure is git declining to
    // answer. Both mean the same thing to every caller here.
    return false
  }
}

/** Whether `commit` is an ancestor of `HEAD` — the test retention and selection share. */
export const isAncestorOfHead = (root: string, commit: string): boolean =>
  isAncestor(root, commit, 'HEAD')

/** The commit date of `commit` as an ISO string, or `null`. */
export const commitDate = (root: string, commit: string): string | null =>
  git(root, ['show', '-s', '--format=%cI', commit])

/**
 * The merge base of `HEAD` and `ref`, which is what a comparison usually means.
 *
 * Right for a two-day branch and wrong for a month-old one, which is why it
 * seeds the search rather than deciding it: the answer is the newest stored
 * baseline that is an ancestor of `HEAD`.
 */
export const mergeBase = (root: string, ref: string): string | null =>
  git(root, ['merge-base', 'HEAD', ref])

/** How many commits lie on the path from `from` to `to`, or `null`. */
export function distance(
  root: string,
  from: string,
  to: string,
): number | null {
  const counted = git(root, ['rev-list', '--count', `${from}..${to}`])
  if (counted === null) return null
  const parsed = Number(counted)
  return Number.isInteger(parsed) ? parsed : null
}

/**
 * How far one commit is from another, signed: positive where `to` is ahead.
 *
 * Reported with every substitution — "the baseline you asked for is not here,
 * and the one used is 14 commits ahead of it" is the fact that says whether the
 * answer is still worth having. Signed, because the substitute is usually newer
 * than the request and occasionally older, and a caller must not have to guess
 * which.
 */
export function commitsBetween(
  root: string,
  from: string,
  to: string,
): number | null {
  const ahead = distance(root, from, to)
  if (ahead === null) return null
  if (ahead > 0) return ahead
  const behind = distance(root, to, from)
  return behind === null ? null : -behind
}

/**
 * The default branch's ref, for seeding the merge base.
 *
 * `origin/HEAD` is what a clone records; the local branches are the fallback for
 * a repository with no remote. A repository with none of them gets `null`, and
 * the caller falls back to the newest stored baseline.
 */
export function defaultBranch(root: string): string | null {
  const remote = git(root, [
    'symbolic-ref',
    '--quiet',
    'refs/remotes/origin/HEAD',
  ])
  if (remote !== null && remote !== '') return remote
  for (const name of ['main', 'master']) {
    if (resolveRef(root, name) !== null) return name
  }
  return null
}

/**
 * Git's rename detection limit, as a codedocs constant.
 *
 * ADR 0007: every git knob is a codedocs constant and is never read from the
 * user's `gitconfig`, or the same question answers differently on two machines
 * and ADR 0006's byte-identical reproducibility is a fiction. The default
 * silently loses 39% of renames — over 2,000 cal.com commits git reports 352
 * and prints `exhaustive rename detection was skipped`, where this finds 574 —
 * at 1.9 s against 0.16 s, which is a cost continuity pays once per unresolved
 * subject rather than once per answer.
 */
const RENAME_LIMIT = 20000

/**
 * The last commit that touched a path, which for a vanished path is the one
 * that removed it.
 *
 * The first half of ADR 0007's two-step probe, measured at 14 ms on cal.com.
 * `git log --follow` costs 465 ms and answers a different question.
 */
export const lastCommitTouching = (
  root: string,
  path: string,
): string | null => {
  const found = git(root, ['rev-list', '-1', 'HEAD', '--', path])
  return found === null || found === '' ? null : found
}

/** One rename git reported, carrying git's own similarity score and never codedocs'. */
export interface GitRename {
  readonly from: string
  readonly to: string
  /** Git's `-M` score, 0-100. The one threshold codedocs inherits, named as git's. */
  readonly similarity: number
}

/**
 * Every rename one commit performed.
 *
 * The second half of the probe, 153 ms on cal.com. Asking one commit what it did
 * returns the destination path with no stored state at all, which is what lets
 * subject matching need no [[Baseline]].
 */
export function renamesIn(root: string, commit: string): GitRename[] {
  const output = git(root, [
    '-c',
    `diff.renameLimit=${RENAME_LIMIT}`,
    'show',
    '--name-status',
    '--diff-filter=R',
    '--find-renames',
    '--format=',
    commit,
  ])
  if (output === null || output === '') return []
  const renames: GitRename[] = []
  for (const line of output.split('\n')) {
    // `R075\told/path.ts\tnew/path.ts`
    const [status, from, to] = line.split('\t')
    if (status === undefined || from === undefined || to === undefined) continue
    const score = Number(status.slice(1))
    if (!Number.isInteger(score)) continue
    renames.push({ from, to, similarity: score })
  }
  return renames
}

/**
 * Every path git reports as different from `ref`, plus everything uncommitted.
 *
 * Both halves of the change: what the commits did, and what is uncommitted on
 * top of them. A [[Snapshot]] is a commit plus whatever is uncommitted, so an
 * answer that read only the first would miss the work in front of the user.
 *
 * A `null` ref asks only about the uncommitted half, which is what an operation
 * that was given no base wants.
 *
 * **`--no-renames`, so a rename is both of its paths.** Git's rename detection
 * would name only the destination, and the source is the path that a document's
 * claim and an earlier index still hold — the case where the answer matters most
 * is the one detection would hide. Pairing a rename is [[Continuity]]'s job and
 * has its own probe; this set is only "which paths differ".
 */
export function changedPaths(root: string, ref: string | null): string[] {
  const names = new Set<string>()
  const collect = (args: readonly string[]): void => {
    const out = git(root, args)
    if (out === null) return
    for (const line of out.split('\n')) {
      if (line !== '') names.add(line)
    }
  }
  if (ref !== null) {
    collect(['diff', '--name-only', '--no-renames', `${ref}...HEAD`])
  }
  collect(['diff', '--name-only', '--no-renames', 'HEAD'])
  collect(['ls-files', '--others', '--exclude-standard'])
  return [...names].sort()
}
