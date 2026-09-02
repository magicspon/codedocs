/**
 * Where the benchmark reads and writes.
 *
 * Every module that touches the target repository resolves through here, so
 * moving the checkout is one edit rather than a search. No commit is named
 * here: each case declares the commit its repository state is built from, and
 * the harness materialises that commit as a worktree per run.
 */

import { join, relative, resolve } from 'node:path'

/** The `bench/` directory: cases in, results out. */
export const BENCH: string = import.meta.dirname

const REPO_ROOT = resolve(BENCH, '..')

/** The clone every worktree is cut from. No run reads it directly. */
export const TARGET: string = resolve(REPO_ROOT, 'repos/vscode')

/**
 * Where a run's throwaway checkout is materialised.
 *
 * Under `repos/`, which is git-ignored and skipped by codedocs' own project
 * discovery — a 91-project vscode checkout anywhere else in this repository
 * would be indexed as part of it.
 */
export const WORKTREES: string = resolve(REPO_ROOT, 'repos/.worktrees')

/** The CLI the codedocs arm is given. */
export const CODEDOCS: string = resolve(REPO_ROOT, 'node_modules/.bin/codedocs')

/** One JSON record and one raw stream per run land here. */
export const RESULTS: string = join(BENCH, 'results')

/** Strips the worktree a run happened in, leaving the path the repository knows. */
const INSIDE_A_WORKTREE = /^.*\/\.worktrees\/[^/]+\//

/**
 * Normalises any path the agent used into one repository-relative form, so a
 * file is counted once.
 *
 * Two roots have to fold to the same answer: the worktree a run reads today,
 * and the clone itself, which is what streams recorded before per-case
 * worktrees name. Both are the same file to the case's ground truth. A
 * relative path is already in that form whichever tree it came from.
 */
export function normalise(path: string): string {
  const absolute = path.startsWith('/') ? path : join(TARGET, path)
  const withoutWorktree = absolute.replace(INSIDE_A_WORKTREE, '')
  if (withoutWorktree !== absolute) return withoutWorktree
  return relative(TARGET, absolute)
}
