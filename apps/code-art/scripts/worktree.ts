/**
 * Lending a worktree the repository's installed packages.
 *
 * An old commit only analyses at `typed` fidelity if its dependencies are
 * there, and installing them per frame would cost more than the whole
 * timeline. The worktree borrows the repository's instead, by symlink.
 */

import type { Dirent } from 'node:fs'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  symlinkSync,
} from 'node:fs'
import { join, relative, sep } from 'node:path'

/** A checkout of one commit, and the repository it came from. */
export interface Tree {
  readonly repo: string
  readonly dir: string
}

/** Worth descending into: a directory, and not one a tool owns. */
function searchable(entry: Dirent): boolean {
  return (
    entry.isDirectory() && entry.name !== '.git' && entry.name !== '.codedocs'
  )
}

/** Every `node_modules` directory near the top of the repo, so a worktree can borrow them. */
export function nodeModules(dir: string, depth = 0): string[] {
  if (depth > 3) return []
  const entries = readdirSync(dir, { withFileTypes: true }).filter(searchable)
  return entries.flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.name === 'node_modules' ? [path] : nodeModules(path, depth + 1)
  })
}

/** A scope directory — `@types`, `@codedocs` — whose packages are mirrored one by one. */
function isScope(entry: Dirent): boolean {
  return entry.name.startsWith('@') && entry.isDirectory()
}

/**
 * A link to the *current* checkout, which pnpm writes for a workspace package.
 * Following one would index today's source inside an old frame.
 */
function isWorkspace(real: string, repo: string): boolean {
  return (
    real.startsWith(repo + sep) && !real.includes(`${sep}node_modules${sep}`)
  )
}

/** What an entry should point at, or null when that commit did not have it. */
function linkTarget(from: string, tree: Tree): string | null {
  const real = realpathSync(from)
  if (!isWorkspace(real, tree.repo)) return from
  const own = join(tree.dir, relative(tree.repo, real))
  return existsSync(own) ? own : null
}

function mirrorEntry(
  entry: Dirent,
  from: string,
  to: string,
  tree: Tree,
): void {
  if (existsSync(to)) return
  if (isScope(entry)) return mirror(from, to, tree)
  const link = linkTarget(from, tree)
  if (link) symlinkSync(link, to)
}

/**
 * Mirrors one `node_modules` directory into the worktree.
 *
 * Third-party packages are linked as they are. A workspace package is pointed
 * at the worktree's own copy instead, or left out if that commit lacked it.
 */
export function mirror(source: string, target: string, tree: Tree): void {
  mkdirSync(target, { recursive: true })
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    mirrorEntry(entry, join(source, entry.name), join(target, entry.name), tree)
  }
}
