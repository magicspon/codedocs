/**
 * What a `package.json` declares, and what of it is on disk.
 *
 * Two callers share these: `specifiers.ts` decides whether an unresolved bare
 * specifier is `unprepared`, and `doctor --measure` re-runs signal 1 at the
 * granularity that catches the blind spot the fingerprint accepts — a
 * hand-modified `node_modules` under an unchanged lockfile.
 *
 * Nothing here walks `node_modules`: a declared name is asked for by path, which
 * is the constraint ADR 0009 placed on every preflight input.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { asRecord, readJsonc, upward } from './fs.ts'

/** The four dependency blocks a manifest may declare a package in. */
const BLOCKS: readonly string[] = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
]

/**
 * Every dependency the nearest `package.json` declares, by name.
 *
 * @param cache - Keyed by the directory asked from, for a caller deciding many
 * specifiers at once. Absent for a caller asking once.
 */
export function declaredDependencies(
  root: string,
  from: string,
  cache?: Map<string, ReadonlySet<string>>,
): ReadonlySet<string> {
  const cached = cache?.get(from)
  if (cached !== undefined) return cached
  const found =
    upward(root, from, (directory) => {
      const manifest = readJsonc(join(directory, 'package.json'))
      if (manifest === undefined) return undefined
      return new Set(
        BLOCKS.flatMap((block) => Object.keys(asRecord(manifest[block]))),
      )
    }) ?? new Set<string>()
  cache?.set(from, found)
  return found
}

/**
 * Where a package is on disk in any `node_modules` above `from`, or `false`.
 *
 * @param cache - Keyed by directory and name; see `declaredDependencies`.
 */
export function installedPackage(
  root: string,
  from: string,
  packageName: string,
  cache?: Map<string, string | false>,
): string | false {
  const key = `${from} ${packageName}`
  const cached = cache?.get(key)
  if (cached !== undefined) return cached
  const found =
    upward(root, from, (directory) => {
      const absolute = join(directory, 'node_modules', packageName)
      return existsSync(absolute) ? absolute : undefined
    }) ?? false
  cache?.set(key, found)
  return found
}

/**
 * The declared dependencies that are in no `node_modules` above `from`, sorted.
 *
 * Signal 1 asks whether a `node_modules` exists at all, which is what makes it
 * cost microseconds and what makes it blind to an install that is present and
 * incomplete. This asks the same question once per declared name — still no
 * walk, still no program — and it is the only thing `doctor --measure` can see
 * that the stored signals cannot.
 */
export function absentDependencies(root: string, from: string): string[] {
  return [...declaredDependencies(root, from)]
    .filter((name) => installedPackage(root, from, name) === false)
    .sort()
}
