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
