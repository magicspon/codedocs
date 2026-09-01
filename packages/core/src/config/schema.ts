/** Reading each top-level key of `codedocs.jsonc`, or falling back to its default. */

import type { Authorship, Role } from '../model.ts'
import { invalid } from './errors.ts'
import {
  describe,
  expectObject,
  readEnum,
  readString,
  readStringArray,
  rejectUnknownKeys,
} from './primitives.ts'
import {
  type ClassifyRule,
  type Discover,
  DEFAULT_CONFIG,
  type Remediation,
} from './types.ts'

const ROLES: readonly Role[] = ['source', 'test', 'config']
const AUTHORSHIPS: readonly Authorship[] = ['authored', 'generated']

export function readVersion(value: unknown): number {
  if (value === undefined) return DEFAULT_CONFIG.version
  if (!Number.isInteger(value)) {
    throw invalid(`must be an integer, got ${describe(value)}`, 'version')
  }
  return value as number
}

/**
 * `baselines` is a count, not a size — ADR 0008 denominates the cap in work
 * sessions — and `0` legitimately means "capture nothing".
 */
export function readBaselines(value: unknown): number {
  if (value === undefined) return DEFAULT_CONFIG.baselines
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw invalid(
      `must be a non-negative integer, got ${describe(value)}`,
      'baselines',
    )
  }
  return value as number
}

export function readDiscover(value: unknown): Discover {
  if (value === undefined) return DEFAULT_CONFIG.discover
  const block = expectObject(value, 'discover')
  rejectUnknownKeys(block, 'discover', ['projects', 'skip'])
  return {
    projects: readStringArray(block['projects'], 'discover.projects'),
    skip: readStringArray(block['skip'], 'discover.skip'),
  }
}

/**
 * `classify` is an object because ADR 0003 keys it by glob; the file's own key
 * order is the rule order, and the last matching rule wins.
 */
export function readClassify(value: unknown): readonly ClassifyRule[] {
  if (value === undefined) return DEFAULT_CONFIG.classify
  const block = expectObject(value, 'classify')
  return Object.entries(block).map(([glob, raw]) => {
    const key = `classify[${JSON.stringify(glob)}]`
    const rule = expectObject(raw, key)
    rejectUnknownKeys(rule, key, ['role', 'authorship'])
    const role = readEnum(rule['role'], ROLES, `${key}.role`)
    const authorship = readEnum(
      rule['authorship'],
      AUTHORSHIPS,
      `${key}.authorship`,
    )
    if (role === null && authorship === null) {
      throw invalid('must set `role`, `authorship` or both', key)
    }
    return { glob, role, authorship }
  })
}

export function readRemediations(value: unknown): readonly Remediation[] {
  if (value === undefined) return DEFAULT_CONFIG.remediations
  if (!Array.isArray(value)) {
    throw invalid(
      `must be an array — order is the precedence — got ${describe(value)}`,
      'remediations',
    )
  }
  return value.map((raw, index) => {
    const key = `remediations[${index}]`
    const entry = expectObject(raw, key)
    rejectUnknownKeys(entry, key, ['specifier', 'run'])
    return {
      specifier: readString(entry['specifier'], `${key}.specifier`),
      run: readString(entry['run'], `${key}.run`),
    }
  })
}
