/**
 * Drift: the difference between the working tree and the snapshot the index
 * describes. Detected before every answer, and either repaired or named.
 *
 * Git is deliberately absent from this path. `git status` is 90 ms and cannot
 * see untracked or ignored files that a project still globs — 183 of them on the
 * fixtures — and the whole scheme collapses in a checkout that is not a
 * repository. The stat signature costs less and knows more.
 */

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { toRepoPath } from './discovery.ts'
import type { FileNode, FilePath } from './model.ts'

/** Directories never walked. Kept in step with `discovery.ts` deliberately. */
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
  '.yarn',
])

/** Extensions the TypeScript projects can glob. */
const SOURCE_EXTENSIONS = /\.(?:[cm]?[jt]sx?)$/

/** What changed between the working tree and the indexed snapshot. */
export interface Drift {
  readonly changed: readonly FilePath[]
  readonly deleted: readonly FilePath[]
  readonly added: readonly FilePath[]
}

/** Whether anything at all moved. */
export function hasDrift(drift: Drift): boolean {
  return (
    drift.changed.length > 0 ||
    drift.deleted.length > 0 ||
    drift.added.length > 0
  )
}

/** Every drifted path with why it drifted, sorted, for naming blind spots. */
export function driftedPaths(
  drift: Drift,
): { path: FilePath; reason: string }[] {
  return [
    ...drift.changed.map((path) => ({
      path,
      reason: 'changed since the index was built',
    })),
    ...drift.deleted.map((path) => ({
      path,
      reason: 'deleted since the index was built',
    })),
    ...drift.added.map((path) => ({
      path,
      reason: 'appeared since the index was built',
    })),
  ].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}

/** The content hash stored per file, and compared when the stat signature moves. */
function hashFile(absolute: string): string {
  return createHash('sha256').update(readFileSync(absolute)).digest('hex')
}

/** Stat one file into the shape the index stores, or `undefined` if it is gone. */
export function statFile(root: string, path: FilePath): FileNode | undefined {
  const absolute = join(root, path)
  try {
    const stats = statSync(absolute)
    return {
      path,
      contentHash: hashFile(absolute),
      size: stats.size,
      mtimeMs: stats.mtimeMs,
    }
  } catch {
    return undefined
  }
}

/** Every source file under the root, repository-relative. */
export function walkSourceFiles(root: string): FilePath[] {
  const found: FilePath[] = []
  const walk = (directory: string): void => {
    let entries
    try {
      entries = readdirSync(directory, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const absolute = join(directory, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(absolute)
      } else if (SOURCE_EXTENSIONS.test(entry.name)) {
        found.push(toRepoPath(root, absolute))
      }
    }
  }
  walk(root)
  return found
}

/**
 * Compare the working tree against the indexed snapshot.
 *
 * Size and mtime flag a candidate; only the flagged files are hashed. Hashing
 * everything costs 280 ms to learn what 17 ms of `stat` already tells us, and
 * hashing the flagged ones stops a touched-but-unchanged file starting a rebuild.
 */
export function detectDrift(
  root: string,
  indexed: readonly FileNode[],
  seen: ReadonlySet<FilePath>,
): Drift {
  const changed: FilePath[] = []
  const deleted: FilePath[] = []
  const known = new Set<FilePath>()

  for (const file of indexed) {
    known.add(file.path)
    let stats
    try {
      stats = statSync(join(root, file.path))
    } catch {
      deleted.push(file.path)
      continue
    }
    if (stats.size === file.size && stats.mtimeMs === file.mtimeMs) continue
    if (hashFile(join(root, file.path)) !== file.contentHash)
      changed.push(file.path)
  }

  // Compared against every file the last walk *saw*, not against the files a
  // project globbed. A config script or a vendored bundle is in neither the
  // index nor any project, and comparing against the index alone would report
  // it as new on every query — making drift permanent and a rebuild
  // unconditional.
  const added = walkSourceFiles(root).filter(
    (path) => !known.has(path) && !seen.has(path),
  )

  return {
    changed: changed.sort(),
    deleted: deleted.sort(),
    added: added.sort(),
  }
}
