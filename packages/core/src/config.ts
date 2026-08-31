/**
 * `codedocs.jsonc`: the facts about a repository codedocs cannot determine.
 *
 * ADR 0010 admits a key only where an ADR found something undetectable, gives
 * every key a default so the file stays optional, and forbids any key that
 * changes what is reported about what was analysed. Parsing is strict on the
 * same reasoning: a file that exists and is wrong means the user's intent is
 * unknown, and guessing at it is how a config produces a confidently wrong
 * answer.
 */

// cspell:ignore exlucde — a deliberate transposition, quoted from ADR 0010

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Authorship, PreconditionCause, Role } from './model.ts'

/** The one file, read from the repository root and nowhere else. */
export const CONFIG_FILE = 'codedocs.jsonc'

/**
 * One `classify` glob and the labels it forces (ADR 0003).
 *
 * Partial by design: a rule may set one axis and leave the other to the signals.
 * Order is the file's own, because ADR 0003 makes the last matching rule win.
 */
export interface ClassifyRule {
  readonly glob: string
  readonly role: Role | null
  readonly authorship: Authorship | null
}

/** One `missing-generated` remediation: the specifier it covers, and the command. */
export interface Remediation {
  /** A glob over the specifier as written, e.g. `@calcom/prisma/*`. */
  readonly specifier: string
  /** The command a user runs. codedocs prints it and never executes it. */
  readonly run: string
}

/** Additions to project discovery. Neither key decides membership (ADR 0003). */
export interface Discover {
  /** Extra config paths or globs, added to what the walk found. */
  readonly projects: readonly string[]
  /** Extra directory names to skip, added to the walk's floor. */
  readonly skip: readonly string[]
}

/** The resolved configuration: the file's keys, or their defaults. */
export interface Config {
  readonly version: number
  readonly classify: readonly ClassifyRule[]
  readonly baselines: number
  readonly discover: Discover
  readonly remediations: readonly Remediation[]
}

/**
 * What codedocs runs on when no file exists, which is the ordinary case.
 *
 * ADR 0010's second test: absence is legal and yields a defensible answer, so a
 * fresh clone never has to be configured before it can be analysed.
 */
export const DEFAULT_CONFIG: Config = {
  version: 1,
  classify: [],
  baselines: 3,
  discover: { projects: [], skip: [] },
  remediations: [],
}

/**
 * A config that exists and cannot be used. Carries an envelope code, because it
 * reaches the caller as ADR 0006's `error` rather than as a stack trace.
 */
export class ConfigError extends Error {
  readonly code: 'config-invalid' | 'config-misplaced'

  constructor(code: ConfigError['code'], message: string) {
    super(message)
    this.name = 'ConfigError'
    this.code = code
  }
}

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

// ---------------------------------------------------------------------------
// JSONC
// ---------------------------------------------------------------------------

/**
 * Read JSON with comments and trailing commas, which is what `.jsonc` promises.
 *
 * Comments and stray commas are blanked rather than removed so that every offset
 * survives, and `JSON.parse`'s own position in a syntax error still points at
 * the character the user wrote.
 */
function parseJsonc(text: string): unknown {
  try {
    return JSON.parse(stripJsonc(text))
  } catch (error) {
    throw invalid(
      `is not valid JSONC — ${error instanceof Error ? error.message : String(error)}`,
      '',
    )
  }
}

/**
 * Blank out comments and trailing commas, preserving every offset.
 *
 * Two passes rather than one: whether a comma is trailing depends on what comes
 * *after* it, and what comes after it may be a comment. Blanking every comment
 * first makes the second pass a question about whitespace alone.
 */
function stripJsonc(text: string): string {
  return blankTrailingCommas(blankComments(text))
}

/** Replace each comment with spaces, leaving newlines and string bodies alone. */
function blankComments(text: string): string {
  const out = units(text)
  let index = 0
  while (index < out.length) {
    if (out[index] === '"') {
      index = endOfString(out, index)
      continue
    }
    if (out[index] === '/' && out[index + 1] === '/') {
      const end = text.indexOf('\n', index)
      index = blank(out, index, end === -1 ? out.length : end)
      continue
    }
    if (out[index] === '/' && out[index + 1] === '*') {
      const end = text.indexOf('*/', index + 2)
      index = blank(out, index, end === -1 ? out.length : end + 2)
      continue
    }
    index += 1
  }
  return out.join('')
}

/** Replace each comma that only a `}` or `]` follows. Comments are already gone. */
function blankTrailingCommas(text: string): string {
  const out = units(text)
  let index = 0
  while (index < out.length) {
    if (out[index] === '"') {
      index = endOfString(out, index)
      continue
    }
    if (out[index] === ',') {
      let next = index + 1
      while (next < out.length && /\s/.test(out[next]!)) next += 1
      if (out[next] === '}' || out[next] === ']') out[index] = ' '
    }
    index += 1
  }
  return out.join('')
}

/**
 * One array element per UTF-16 unit.
 *
 * Not `[...text]`, which yields code points: an astral character would then be
 * one element where `String.prototype.indexOf` counts two, and every offset
 * after the first emoji in a comment would be wrong.
 */
function units(text: string): string[] {
  return Array.from({ length: text.length }, (_, index) => text[index]!)
}

/** The index just past the closing quote of the string starting at `from`. */
function endOfString(out: readonly string[], from: number): number {
  let index = from + 1
  while (index < out.length && out[index] !== '"') {
    index += out[index] === '\\' ? 2 : 1
  }
  return index + 1
}

/** Overwrite `[from, to)` with spaces, keeping newlines so positions still read. */
function blank(out: string[], from: number, to: number): number {
  for (let i = from; i < to; i += 1) if (out[i] !== '\n') out[i] = ' '
  return to
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const ROLES: readonly Role[] = ['source', 'test', 'config']
const AUTHORSHIPS: readonly Authorship[] = ['authored', 'generated']

function readVersion(value: unknown): number {
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
function readBaselines(value: unknown): number {
  if (value === undefined) return DEFAULT_CONFIG.baselines
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw invalid(
      `must be a non-negative integer, got ${describe(value)}`,
      'baselines',
    )
  }
  return value as number
}

function readDiscover(value: unknown): Discover {
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
function readClassify(value: unknown): readonly ClassifyRule[] {
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

function readRemediations(value: unknown): readonly Remediation[] {
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

// ---------------------------------------------------------------------------
// Primitives, and the errors they raise
// ---------------------------------------------------------------------------

/** A plain JSON object, which is the one thing `typeof value === 'object'` is not. */
function expectObject(value: unknown, key: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalid(`must be an object, got ${describe(value)}`, key)
  }
  return value as Record<string, unknown>
}

function readString(value: unknown, key: string): string {
  if (typeof value !== 'string' || value === '') {
    throw invalid(`must be a non-empty string, got ${describe(value)}`, key)
  }
  return value
}

function readStringArray(value: unknown, key: string): readonly string[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    throw invalid(`must be an array of strings, got ${describe(value)}`, key)
  }
  return value.map((entry, index) => readString(entry, `${key}[${index}]`))
}

function readEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  key: string,
): T | null {
  if (value === undefined) return null
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw invalid(
      `must be one of ${allowed.map((one) => `\`${one}\``).join(', ')}, got ${describe(value)}`,
      key,
    )
  }
  return value as T
}

/**
 * Refuse a key the schema does not know, naming its nearest valid neighbour.
 *
 * ADR 0010 accepts the cost — a config written for a later codedocs fails on an
 * earlier one — because the alternative is `exlucde`, which under lenient
 * parsing parses, excludes nothing, and says nothing about either.
 */
function rejectUnknownKeys(
  block: Record<string, unknown>,
  prefix: string,
  allowed: readonly string[],
): void {
  for (const key of Object.keys(block)) {
    if (allowed.includes(key)) continue
    const near = nearest(key, allowed)
    throw invalid(
      near === null
        ? `is not a key codedocs knows. Valid keys here: ${allowed.map((one) => `\`${one}\``).join(', ')}`
        : `is not a key codedocs knows — did you mean \`${near}\`?`,
      prefix === '' ? key : `${prefix}.${key}`,
    )
  }
}

/**
 * The closest valid key, or `null` when nothing is close enough to name.
 *
 * A wrong guess is worse than none: `exclude` is nearest to `discover` only in
 * the sense that something has to be, and pointing there sends the user to a
 * key that would not have done what they meant.
 */
function nearest(key: string, allowed: readonly string[]): string | null {
  let best: string | null = null
  let bestDistance = Infinity
  for (const candidate of allowed) {
    const distance = editDistance(key, candidate)
    if (distance < bestDistance) {
      best = candidate
      bestDistance = distance
    }
  }
  const budget = Math.min(3, Math.floor(key.length / 2))
  return bestDistance <= budget ? best : null
}

/** Levenshtein distance, one row at a time. */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i]
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(
        previous[j]! + 1,
        row[j - 1]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    previous = row
  }
  return previous[b.length]!
}

/**
 * What was found where a value was expected.
 *
 * A scalar is quoted back because it is what the user typed; a container is
 * named by its type, because printing a whole object at someone explains
 * nothing they did not already write.
 */
function describe(value: unknown): string {
  if (value === null) return '`null`'
  if (Array.isArray(value)) return 'an array'
  if (typeof value === 'object') return 'an object'
  return `\`${JSON.stringify(value)}\``
}

/** Every message names the file first, then the key, then the expectation. */
function invalid(expectation: string, key: string): ConfigError {
  const subject = key === '' ? 'the file' : `\`${key}\``
  return new ConfigError(
    'config-invalid',
    `${CONFIG_FILE}: ${subject} ${expectation}`,
  )
}

/**
 * A second config below the root.
 *
 * Not a merge and not nearest-wins: ADR 0004 gives one index per working tree,
 * so a file in one package would silently govern an index spanning every other.
 */
export function misplacedConfig(root: string, found: string): ConfigError {
  return new ConfigError(
    'config-misplaced',
    `${found} is below the repository root — codedocs reads one ${CONFIG_FILE}, at ${join(root, CONFIG_FILE)}. Move its keys there, or delete it.`,
  )
}
