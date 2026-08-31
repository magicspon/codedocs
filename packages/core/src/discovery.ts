/**
 * Finding the repository root and the projects in it.
 *
 * A `Project` is one tsconfig and the files it globs. ADR 0002 keeps it distinct
 * from a `Package` because cal.com has 34 tsconfigs and no root config, so
 * neither one can stand in for the other.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

import type { FilePath } from './model.ts'

/**
 * Directories never walked when looking for projects. `node_modules` dominates
 * the cost; the rest are build output that would yield duplicate projects.
 */
const SKIP_DIRS: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.turbo',
  '.cache',
  '.codedocs',
])

/** Convert an absolute path to the repository-relative, `/`-separated form ids use. */
export function toRepoPath(root: string, absolute: string): FilePath {
  return relative(root, absolute).split(sep).join('/')
}

/**
 * Walk upward for the nearest directory holding a `.git` or a `package.json`.
 *
 * Falls back to `from` so codedocs still works in a checkout that is not a
 * repository — ADR 0004 requires the index to, and git is not on the drift path.
 */
export function findRepositoryRoot(from: string): string {
  let current = resolve(from)
  for (;;) {
    if (
      existsSync(join(current, '.git')) ||
      existsSync(join(current, 'package.json'))
    ) {
      return current
    }
    const parent = dirname(current)
    if (parent === current) return resolve(from)
    current = parent
  }
}

/**
 * Every `tsconfig.json` under the root, repository-relative and sorted by path.
 *
 * Exact-name matching only: variants like `tsconfig.base.json` are usually
 * shared fragments rather than projects, and opening one yields a project with
 * no root files.
 *
 * TODO(#19): let `codedocs.jsonc` name extra project paths for repositories that
 * do not follow the convention.
 */
export function discoverProjects(root: string): FilePath[] {
  const found: FilePath[] = []
  const walk = (directory: string): void => {
    let entries
    try {
      entries = readdirSync(directory, { withFileTypes: true })
    } catch {
      return // Unreadable directory: not a project, and not worth failing over.
    }
    for (const entry of entries) {
      const absolute = join(directory, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(absolute)
      } else if (entry.name === 'tsconfig.json') {
        found.push(toRepoPath(root, absolute))
      }
    }
  }
  walk(root)
  return found.sort()
}

/**
 * The commit the working tree sits on, or `null` outside a repository.
 *
 * Git records the snapshot's commit and nothing else. It is deliberately absent
 * from drift detection, which has to see untracked and ignored files that a
 * project still globs.
 */
export function currentCommit(root: string): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}
