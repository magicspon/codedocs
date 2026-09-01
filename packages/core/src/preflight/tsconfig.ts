/** Reading a `tsconfig`, following its relative `extends` chain. */

import { dirname, resolve } from 'node:path'

import { asRecord, asStrings, readJsonc } from './fs.ts'

/** A `tsconfig` reduced to the three things preflight reads from it. */
export interface ProjectConfig {
  readonly compilerOptions: Record<string, unknown>
  readonly files: readonly string[] | undefined
  readonly include: readonly string[] | undefined
  readonly exclude: readonly string[] | undefined
}

/**
 * Read a `tsconfig`, following relative `extends` chains.
 *
 * A bare `extends` specifier is deliberately not followed: it resolves inside
 * `node_modules`, which nothing in preflight may walk, and a change to it is a
 * change to the lockfile the fingerprint already hashes.
 */
export function readConfig(
  absolute: string,
  seen: Set<string> = new Set(),
): ProjectConfig {
  const empty: ProjectConfig = {
    compilerOptions: {},
    files: undefined,
    include: undefined,
    exclude: undefined,
  }
  if (seen.has(absolute)) return empty // A cyclic `extends` is the repository's bug, not ours.
  seen.add(absolute)

  const raw = readJsonc(absolute)
  if (raw === undefined) return empty

  const inherited = extendsTargets(raw['extends'], dirname(absolute)).map(
    (target) => readConfig(target, seen),
  )

  // TypeScript's own inheritance: `compilerOptions` merge shallowly and the file
  // sets do not — a child that names `include` replaces its base's entirely.
  const compilerOptions: Record<string, unknown> = {}
  for (const base of inherited)
    Object.assign(compilerOptions, base.compilerOptions)
  Object.assign(compilerOptions, asRecord(raw['compilerOptions']))

  const last = <T>(
    pick: (config: ProjectConfig) => T | undefined,
  ): T | undefined => {
    for (const base of [...inherited].reverse()) {
      const found = pick(base)
      if (found !== undefined) return found
    }
    return undefined
  }

  return {
    compilerOptions,
    files: asStrings(raw['files']) ?? last((config) => config.files),
    include: asStrings(raw['include']) ?? last((config) => config.include),
    exclude: asStrings(raw['exclude']) ?? last((config) => config.exclude),
  }
}

/** The absolute paths one `extends` names, ignoring the ones in `node_modules`. */
function extendsTargets(value: unknown, from: string): string[] {
  const named = typeof value === 'string' ? [value] : (asStrings(value) ?? [])
  return named
    .filter((target) => target.startsWith('.') || target.startsWith('/'))
    .map((target) => {
      const absolute = resolve(from, target)
      return absolute.endsWith('.json') ? absolute : `${absolute}.json`
    })
}
