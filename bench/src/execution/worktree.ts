/**
 * The repository state one run reads: a throwaway checkout at the case's base
 * commit, removed when the run ends.
 *
 * A run gets its own tree because a case is only a real bug at the commit
 * before its fix, and because the tree has to be writable without the next run
 * inheriting the edits. Both fall out of `git worktree`: one checkout per run,
 * cut from the clone's objects, discarded afterwards.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { TARGET, WORKTREES } from '../core/paths.ts'

/** Runs git in the clone, with its progress chatter swallowed. */
function git(args: string[]): string {
  return execFileSync('git', args, {
    cwd: TARGET,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
}

/** Runs git in the clone and says only whether it succeeded. */
function gitOk(args: string[]): boolean {
  try {
    git(args)
    return true
  } catch {
    return false
  }
}

/** True when the commit names a file at that path. */
export function hasFileAt(commit: string, path: string): boolean {
  return gitOk(['cat-file', '-e', `${commit}:${path}`])
}

/**
 * Fetches one commit into the clone, and its parent with it.
 *
 * `repos/vscode` is a depth-1 clone, so nothing but its tip is present and the
 * commits the cases name have to be asked for by hash. Depth 2 is what makes
 * the parent resolvable, which is how the harness checks that a declared base
 * really is the commit before the fix.
 */
export function fetchCommit(commit: string): void {
  git(['fetch', '--depth', '2', '--quiet', 'origin', commit])
}

/** The commit a commit sits on top of, or null when it is not resolvable. */
export function parentOf(commit: string): string | null {
  try {
    return git(['rev-parse', `${commit}^`])
  } catch {
    return null
  }
}

/** A run's own checkout, and the way to get rid of it. */
export type Worktree = {
  /** The directory the agent runs in. */
  root: string
  /** Removes the checkout. Safe to call after a failed run, and after itself. */
  remove: () => void
}

/** Deletes a worktree, whatever state an earlier run left it in. */
function discard(root: string): void {
  if (existsSync(root)) {
    // `--force` because the run under test may have edited or deleted files,
    // and a modified worktree is exactly what git refuses to remove quietly.
    gitOk(['worktree', 'remove', '--force', root])
    rmSync(root, { recursive: true, force: true })
  }
  // Clears the clone's administrative record of any worktree whose directory
  // has gone, which is what a killed run leaves behind.
  gitOk(['worktree', 'prune'])
}

/**
 * Materialises `commit` as a fresh checkout named `name`.
 *
 * Anything an earlier run left at that name is discarded first: a leftover tree
 * carries that run's edits, and reusing it is the leak this exists to prevent.
 */
export function createWorktree(name: string, commit: string): Worktree {
  const root = join(WORKTREES, name)
  discard(root)
  // Detached: no branch is created, so nothing about the clone's refs changes.
  git(['worktree', 'add', '--detach', '--quiet', root, commit])
  return { root, remove: () => discard(root) }
}
