/**
 * The entry points: reading `codedocs.jsonc` off disk, resolved or as written,
 * and looking up the one thing a resolved config is queried for afterwards.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { PreconditionCause } from '../model.ts'
import { parseJsonc } from './jsonc.ts'
import { expectObject, rejectUnknownKeys } from './primitives.ts'
import {
  readBaselines,
  readClassify,
  readDiscover,
  readRemediations,
  readVersion,
} from './schema.ts'
import { CONFIG_FILE, type Config, DEFAULT_CONFIG } from './types.ts'

/**
 * Read the config at the repository root, or return the defaults.
 *
 * Never falls back to the defaults on a file that exists and is wrong: absence
 * and malformed are different states, and only one of them is normal.
 */
export function loadConfig(root: string): Config {
  const path = join(root, CONFIG_FILE)
  if (!existsSync(path)) return DEFAULT_CONFIG
  return parseConfig(readFileSync(path, 'utf8'))
}

/**
 * `codedocs.jsonc` as it is written, rather than as it resolves.
 *
 * ADR 0011 splits the file in two — which keys are set is a fact about codedocs,
 * and what they are set to is a fact about the repository — and `loadConfig`
 * answers neither, because it returns every key with its default filled in. It
 * never throws: a file that cannot be parsed is one of the likelier things a
 * bug report is about, and a report that cannot be written about a broken config
 * is no use.
 */
export interface ConfigFacts {
  readonly present: boolean
  /** Whether it parsed. `false` leaves `keys` and `values` empty. */
  readonly readable: boolean
  /** The top-level keys the file sets, sorted. */
  readonly keys: readonly string[]
  /** What it sets them to. Repository facts, so ADR 0011 puts them behind the flag. */
  readonly values: Readonly<Record<string, unknown>>
}

/** Read `codedocs.jsonc` for its keys and their values, or report it absent. */
export function configFacts(root: string): ConfigFacts {
  const path = join(root, CONFIG_FILE)
  if (!existsSync(path)) {
    return { present: false, readable: true, keys: [], values: {} }
  }
  try {
    const parsed: unknown = parseJsonc(readFileSync(path, 'utf8'))
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return { present: true, readable: false, keys: [], values: {} }
    }
    const values = parsed as Record<string, unknown>
    return {
      present: true,
      readable: true,
      keys: Object.keys(values).sort(),
      values,
    }
  } catch {
    return { present: true, readable: false, keys: [], values: {} }
  }
}

/** Parse config text. Separate from the read so a test needs no file. */
export function parseConfig(text: string): Config {
  const root = expectObject(parseJsonc(text), '')
  rejectUnknownKeys(root, '', [
    'version',
    'classify',
    'baselines',
    'discover',
    'remediations',
  ])
  return {
    version: readVersion(root['version']),
    classify: readClassify(root['classify']),
    baselines: readBaselines(root['baselines']),
    discover: readDiscover(root['discover']),
    remediations: readRemediations(root['remediations']),
  }
}

/**
 * The command that clears one unresolved specifier, or `null`.
 *
 * The cause is a parameter rather than the caller's business because ADR 0010
 * scopes the whole key to `missing-generated`: `unprepared`'s command comes from
 * the lockfile, and `unmapped` and `broken` have none at all. Keeping that rule
 * here means a second caller cannot get it wrong.
 */
export function remediationFor(
  config: Config,
  cause: PreconditionCause,
  specifier: string,
): string | null {
  if (cause !== 'missing-generated') return null
  // First match wins, so an entry can be narrowed by putting it above a broader
  // one — which is why the key is an array and not an object.
  const hit = config.remediations.find((entry) =>
    matchesSpecifier(specifier, entry.specifier),
  )
  return hit?.run ?? null
}

/**
 * Glob-match one module specifier. `*` stops at a `/`, `**` crosses them.
 *
 * Written out rather than delegated to `path.matchesGlob`, because a specifier
 * is not a path: it never has a drive letter, a backslash separator or a `.`
 * segment, and matching must mean the same thing on every platform.
 */
function matchesSpecifier(specifier: string, glob: string): boolean {
  const pattern = glob
    .split(/(\*\*|\*)/)
    .map((part) =>
      part === '**' ? '.*' : part === '*' ? '[^/]*' : escapeRegExp(part),
    )
    .join('')
  return new RegExp(`^${pattern}$`).test(specifier)
}

const escapeRegExp = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
