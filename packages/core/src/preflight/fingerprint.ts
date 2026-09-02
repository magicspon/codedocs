/** The environment fingerprint: the fact set that decides whether a stored fidelity still holds. */

import { createHash } from 'node:crypto'

import type { FilePath } from '../model.ts'

/** Declaration files, which retype files that never import them. */
const DECLARATION = /\.d\.[cm]?ts$/

/**
 * The fingerprint inputs, hashed into one string.
 *
 * ADR 0009 names five: preflight's signals 1 and 2, the lockfile hash, the
 * project's `compilerOptions`, and whether the config globs anything plus the
 * set-hash of the declaration files among what it globs. The two that are not
 * obvious are argued there — signals 1 and 2 because an install over a fresh
 * clone moves none of the others, and declarations alone because a new source
 * file is drift the wave already repairs while nothing imports a declaration
 * file.
 */
export function fingerprintOf(
  signals: { installed: boolean; postinstall: boolean },
  lockfile: string,
  compilerOptions: Record<string, unknown>,
  globbed: readonly FilePath[],
): string {
  const hash = createHash('sha256')
  hash.update(signals.installed ? 'installed' : 'unprepared')
  hash.update('\0')
  hash.update(signals.postinstall ? 'postinstall' : 'none')
  hash.update('\0')
  hash.update(lockfile)
  hash.update('\0')
  hash.update(canonical(compilerOptions))
  hash.update('\0')
  hash.update(globbed.length === 0 ? 'empty' : 'globbing')
  hash.update('\0')
  // Sorted, because `globbed` arrives in the drift walk's `readdirSync` order:
  // unsorted, a directory reordering under an unchanged declaration set would
  // read as a moved environment and re-analyse the project for nothing.
  const declarations = globbed.filter((path) => DECLARATION.test(path)).sort()
  for (const path of declarations) {
    hash.update(path)
    hash.update('\n')
  }
  return hash.digest('hex')
}

/** JSON with object keys sorted, so a reordered config is not a changed one. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object')
    return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([left], [right]) => (left < right ? -1 : left > right ? 1 : 0),
  )
  return `{${entries.map(([key, held]) => `${JSON.stringify(key)}:${canonical(held)}`).join(',')}}`
}
