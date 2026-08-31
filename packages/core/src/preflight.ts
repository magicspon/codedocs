/**
 * Preflight: what the filesystem says about a project before anything is opened.
 *
 * ADR 0009 splits ADR 0001's four signals in two. Signals 1-3 are this module —
 * `node_modules`, a declared `postinstall`, and whether the config's includes
 * match any file — and they run first and unconditionally because they cost
 * microseconds. Signal 4 falls out of extraction and is not here.
 *
 * The module also computes the **environment fingerprint**, which is what stops
 * a stored fidelity being a lie. Fidelity is stored with the facts it describes
 * and never recomputed at query time, so without a fingerprint an index built
 * over a fresh clone would keep answering `typed` the moment an install landed —
 * or worse, keep answering `syntactic` for ever, which is the shipped defect this
 * module closes.
 *
 * Nothing here walks `node_modules`, and nothing here opens a TypeScript program.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, posix, resolve } from 'node:path'

import { toRepoPath } from './discovery.ts'
import type {
  Fidelity,
  FilePath,
  PreconditionCause,
  SpecifierSite,
  UnresolvedSpecifier,
} from './model.ts'

/** Lockfiles, in the order a directory holding several is read. */
const LOCKFILES: readonly string[] = [
  'pnpm-lock.yaml',
  'yarn.lock',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'bun.lock',
  'bun.lockb',
]

/** Scripts whose presence is signal 2. `prepare` is npm's `postinstall` for git deps. */
const INSTALL_SCRIPTS: readonly string[] = ['postinstall', 'prepare']

/**
 * The directories `tsconfig` excludes by default, per TypeScript's own defaults.
 * `outDir` and `declarationDir` are added from the config when it names them.
 */
const DEFAULT_EXCLUDES: readonly string[] = [
  'node_modules',
  'bower_components',
  'jspm_packages',
]

/** What preflight measured about one project. Every field is filesystem-cheap. */
export interface ProjectPreflight {
  readonly configPath: FilePath
  /**
   * The environment fingerprint: lockfile hash, `compilerOptions`, and the count
   * and set-hash of the files the config globs. Part of the cache key, so a
   * project whose fingerprint moved is re-analysed rather than served from the
   * index.
   */
  readonly fingerprint: string
  /** Whether the config file itself is still on disk. */
  readonly present: boolean
  /** Signal 1: a `node_modules` at or above the project's own directory. */
  readonly installed: boolean
  /** Signal 2: an install script declared in the nearest `package.json`. */
  readonly postinstall: boolean
  /** Signal 3: the files the config globs. Empty is the signal. */
  readonly globbed: readonly FilePath[]
}

/**
 * Preflight every project, over the file list the drift walk already produced.
 *
 * The walk is shared rather than repeated: signal 3 needs the tree's files, and
 * ADR 0004's drift detection has just enumerated them.
 */
export function preflightProjects(
  root: string,
  configPaths: readonly FilePath[],
  seenFiles: readonly FilePath[],
): Map<FilePath, ProjectPreflight> {
  // One hash per lockfile rather than one per project: a monorepo's 34 projects
  // share a single lockfile, and cal.com's is 1.3 MB.
  const lockfiles = new Map<string, string>()
  const found = new Map<FilePath, ProjectPreflight>()
  for (const configPath of configPaths) {
    found.set(
      configPath,
      preflightProject(root, configPath, seenFiles, lockfiles),
    )
  }
  return found
}

/** Preflight one project. See `preflightProjects` for the shared-walk argument. */
function preflightProject(
  root: string,
  configPath: FilePath,
  seenFiles: readonly FilePath[],
  lockfiles: Map<string, string>,
): ProjectPreflight {
  const directory = join(root, dirname(configPath))
  const config = readConfig(join(root, configPath))
  const globbed = globbedFiles(root, configPath, config, seenFiles)
  const signals = {
    installed: hasNodeModules(root, directory),
    postinstall: declaresInstallScript(root, directory),
  }

  return {
    configPath,
    present: existsSync(join(root, configPath)),
    fingerprint: fingerprintOf(
      signals,
      lockfileHash(root, directory, lockfiles),
      config.compilerOptions,
      globbed,
    ),
    ...signals,
    globbed,
  }
}

/**
 * The fidelity preflight's first three signals support, and why it is not `typed`.
 *
 * Signal 2 is deliberately not a cause of its own: once `node_modules` exists,
 * `postinstall` has already run, so it only sharpens signal 1's remediation.
 * Signal 1 is reported ahead of signal 3 where both fire, because an install can
 * itself produce the files signal 3 is missing.
 */
export function fidelityOf(preflight: ProjectPreflight): {
  fidelity: Fidelity
  cause: PreconditionCause | null
} {
  if (!preflight.installed)
    return { fidelity: 'syntactic', cause: 'unprepared' }
  // A config whose includes match nothing on disk is usually waiting on codegen,
  // which ADR 0001 measured is not an install step.
  if (preflight.globbed.length === 0) {
    return { fidelity: 'syntactic', cause: 'missing-generated' }
  }
  return { fidelity: 'typed', cause: null }
}

/** Signal 1: the nearest `node_modules` at or above the project, up to the root. */
function hasNodeModules(root: string, from: string): boolean {
  return (
    upward(root, from, (directory) =>
      existsSync(join(directory, 'node_modules')) ? true : undefined,
    ) ?? false
  )
}

/** Signal 2: does the nearest `package.json` declare an install script? */
function declaresInstallScript(root: string, from: string): boolean {
  return (
    upward(root, from, (directory) => {
      const manifest = readJsonc(join(directory, 'package.json'))
      if (manifest === undefined) return undefined
      const scripts = asRecord(manifest['scripts'])
      return INSTALL_SCRIPTS.some((name) => typeof scripts[name] === 'string')
    }) ?? false
  )
}

/** The nearest lockfile's content hash, or the empty string where there is none. */
function lockfileHash(
  root: string,
  from: string,
  cache: Map<string, string>,
): string {
  return (
    upward(root, from, (directory) => {
      for (const name of LOCKFILES) {
        const absolute = join(directory, name)
        const cached = cache.get(absolute)
        if (cached !== undefined) return cached
        if (!existsSync(absolute)) continue
        const hash = createHash('sha256')
          .update(readFileSync(absolute))
          .digest('hex')
        cache.set(absolute, hash)
        return hash
      }
      return undefined
    }) ?? ''
  )
}

/**
 * Walk from a directory up to the repository root, taking the first answer.
 *
 * The root is included and the walk stops there: above it is the user's home
 * directory, whose `node_modules` says nothing about this repository.
 */
function upward<T>(
  root: string,
  from: string,
  at: (directory: string) => T | undefined,
): T | undefined {
  let directory = resolve(from)
  const stop = resolve(root)
  for (;;) {
    const found = at(directory)
    if (found !== undefined) return found
    if (directory === stop) return undefined
    const parent = dirname(directory)
    if (parent === directory) return undefined
    directory = parent
  }
}

/**
 * The fingerprint inputs, hashed into one string.
 *
 * ADR 0009 names three: the lockfile hash, the project's `compilerOptions`, and
 * the count and set-hash of the files its config globs. Two refinements, both
 * forced by the shipped code rather than chosen:
 *
 * **Signals 1 and 2 join it.** An install over a fresh clone changes none of the
 * three — the lockfile is already committed, no config moves, no source file
 * appears — so the fingerprint would miss the one case ADR 0001 named when it
 * required a fingerprint at all. `existsSync` on `node_modules` is not walking
 * it, which is the constraint ADR 0009 actually placed on these inputs.
 *
 * **Only the declaration files of the glob set are hashed**, plus whether the
 * set is empty. Hashing every globbed path makes creating one ordinary file a
 * full re-analysis of its project — 2,316 files on cal.com's `apps/web` where
 * the wave repairs one — and a new module is content drift, which ADR 0004
 * repairs file by file by design. What the wave *cannot* repair is a declaration
 * file, because nothing imports it: it retypes files that never mention it, so
 * its arrival has to invalidate the project. Every codegen ADR 0001 measured —
 * Redwood's `.redwood/types`, Next's `next-env.d.ts` and `.next/types`, Prisma's
 * client — lands as declarations, so this is the same signal at a lower cost.
 */
function fingerprintOf(
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
  for (const path of globbed) {
    if (!DECLARATION.test(path)) continue
    hash.update(path)
    hash.update('\n')
  }
  return hash.digest('hex')
}

/** Declaration files, which retype files that never import them. */
const DECLARATION = /\.d\.[cm]?ts$/

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

/** A `tsconfig` reduced to the three things preflight reads from it. */
interface ProjectConfig {
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
function readConfig(
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

/**
 * The files a project's config globs, taken from the tree walk.
 *
 * This is codedocs' own reading of `include`/`exclude`/`files`, not the
 * TypeScript server's file list, and it does not have to agree with it. Its job
 * is to be a **deterministic function of the working tree**, computed the same
 * way when the index is built and when a query checks whether the environment
 * moved. The server's list is not available at query time at all: getting it
 * costs an open program, which is the 3.7 s per project ADR 0009 refuses to
 * spend on a diagnostic.
 */
function globbedFiles(
  root: string,
  configPath: FilePath,
  config: ProjectConfig,
  seenFiles: readonly FilePath[],
): FilePath[] {
  const base = dirname(configPath) === '.' ? '' : `${dirname(configPath)}/`
  const excludes = [
    ...(config.exclude ?? DEFAULT_EXCLUDES),
    ...outputDirectories(config.compilerOptions),
  ].map((pattern) => matcher(base, pattern))

  // A config with neither `files` nor `include` globs everything beneath itself.
  const includes = (
    config.include ?? (config.files === undefined ? ['**/*'] : [])
  ).map((pattern) => matcher(base, pattern))
  const named = new Set(
    (config.files ?? []).map((file) =>
      toRepoPath(root, resolve(root, base, file)),
    ),
  )

  // Includes first: most of a monorepo's files belong to some other project, so
  // the cheap rejection is the one that runs on every path.
  return seenFiles.filter((path) => {
    if (!named.has(path) && !includes.some((include) => include.test(path))) {
      return false
    }
    return !excludes.some((exclude) => exclude.test(path))
  })
}

/** Build output a config names, which TypeScript excludes without being told to. */
function outputDirectories(compilerOptions: Record<string, unknown>): string[] {
  return ['outDir', 'declarationDir']
    .map((key) => compilerOptions[key])
    .filter((value): value is string => typeof value === 'string')
}

/**
 * One `include`/`exclude` pattern as a regular expression over repository paths.
 *
 * TypeScript's glob vocabulary is small and closed: `*` and `?` stop at a
 * separator, `**` crosses them, and a pattern naming no file extension is a
 * directory standing for everything beneath it. Patterns are resolved against
 * the config's own directory first, because cal.com writes both `"."` and
 * `"../types/next-auth.d.ts"` and neither is a path until it is joined.
 */
function matcher(base: string, pattern: string): RegExp {
  const joined = posix
    .normalize(`${base}${pattern.startsWith('/') ? pattern.slice(1) : pattern}`)
    .replace(/\/+$/, '')
  // `normalize` leaves a lone `.`, which stands for every file under the config.
  const rooted = joined === '.' ? '' : joined
  const directory = !/[*?]/.test(rooted) && !/\.[^./]+$/.test(rooted)
  const segments = `${rooted}${rooted === '' ? '' : '/'}`
    .concat(directory ? '**/*' : '')
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.')

  let source = ''
  for (const segment of segments) {
    source +=
      segment === '**'
        ? '(?:[^/]+/)*'
        : `${segment
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '[^/]*')
            .replace(/\?/g, '[^/]')}/`
  }
  // A pattern ending in `**` names everything below it, so it still owes a file
  // name; one ending in a literal segment has already consumed it.
  source = source.endsWith('/') ? source.slice(0, -1) : `${source}[^/]+`
  return new RegExp(`^${source}$`)
}

/** Parse a JSON file that is allowed comments and trailing commas, or `undefined`. */
function readJsonc(absolute: string): Record<string, unknown> | undefined {
  let text
  try {
    text = readFileSync(absolute, 'utf8')
  } catch {
    return undefined // Absent, or unreadable: the same answer either way.
  }
  try {
    return asRecord(JSON.parse(stripJsonc(text)))
  } catch {
    // A config codedocs cannot parse is not a reason to refuse an answer. It
    // fingerprints as an empty config, so an edit that makes it parse again
    // moves the fingerprint and re-analyses the project.
    return undefined
  }
}

/** Remove comments and trailing commas, leaving string literals untouched. */
function stripJsonc(text: string): string {
  let out = ''
  let index = 0
  while (index < text.length) {
    const character = text[index]!
    if (character === '"') {
      const end = endOfString(text, index)
      out += text.slice(index, end)
      index = end
      continue
    }
    if (character === '/' && text[index + 1] === '/') {
      const end = text.indexOf('\n', index)
      index = end === -1 ? text.length : end
      continue
    }
    if (character === '/' && text[index + 1] === '*') {
      const end = text.indexOf('*/', index + 2)
      index = end === -1 ? text.length : end + 2
      continue
    }
    out += character
    index += 1
  }
  return out.replace(/,(\s*[}\]])/g, '$1')
}

/** The offset just past the string literal starting at `start`. */
function endOfString(text: string, start: number): number {
  let index = start + 1
  while (index < text.length) {
    const character = text[index]
    if (character === '\\') index += 2
    else if (character === '"') return index + 1
    else index += 1
  }
  return text.length
}

/** A value as an object, or an empty one. Config files are user input. */
function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/** A value as a string array, or `undefined` where the key was absent or wrong. */
function asStrings(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter((entry): entry is string => typeof entry === 'string')
}

/**
 * Why each unresolved specifier resolved to nothing.
 *
 * ADR 0009's signal 4 is measured by the adapter, which knows the program, and
 * caused here, which knows the filesystem. The four causes split on questions a
 * checker cannot answer: is the package on disk, is it declared, and does the
 * config already name the place its target would have been written?
 *
 * The measured cases the rules are cut around, all three fixtures:
 *
 * | Specifier                     | Cause               | Because                                    |
 * | ----------------------------- | ------------------- | ------------------------------------------ |
 * | `@calcom/prisma/enums` (×302) | `missing-generated` | the package is on disk, the subpath is not |
 * | `types/graphql` (Redwood ×9)  | `missing-generated` | `paths` names `./types/*`, which is absent |
 * | `crypto-js`                   | `unmapped`          | installed, and carries no types            |
 * | `@/app/global.css`            | `unmapped`          | an alias only a bundler resolves           |
 *
 * `broken` is what is left, and it stays narrow on purpose: ADR 0001 forbids
 * rendering a remediation for it, so anything that might be a missing artefact
 * must not land there.
 */
export function classifySpecifiers(
  root: string,
  sites: readonly SpecifierSite[],
  projectOf: ReadonlyMap<FilePath, FilePath>,
): UnresolvedSpecifier[] {
  const lookups: Lookups = {
    declared: new Map(),
    present: new Map(),
    configs: new Map(),
    exists: new Map(),
  }
  return sites.map((site) => ({
    ...site,
    cause: causeOf(root, site, projectOf.get(site.file), lookups),
  }))
}

/** The lookups a classification run shares across every site it decides. */
interface Lookups {
  /** Directory to the dependency names the nearest `package.json` declares. */
  readonly declared: Map<string, ReadonlySet<string>>
  /** Directory and package name to where that package is on disk, or `false`. */
  readonly present: Map<string, string | false>
  /** Config path to the config, for its `paths` and `baseUrl`. */
  readonly configs: Map<FilePath, ProjectConfig>
  /** Repository-relative path to whether it is on disk. */
  readonly exists: Map<string, boolean>
}

/** One specifier's cause. See `classifySpecifiers` for the cases it is cut for. */
function causeOf(
  root: string,
  site: SpecifierSite,
  configPath: FilePath | undefined,
  lookups: Lookups,
): PreconditionCause {
  if (site.specifier.startsWith('.') || site.specifier.startsWith('/')) {
    return relativeCause(root, site, lookups)
  }
  const packageName = packageOf(site.specifier)
  const fromPackage =
    packageName === null ? null : packageCause(root, site, packageName, lookups)
  if (fromPackage !== null) return fromPackage

  const mapped = mappedTarget(root, site.specifier, configPath, lookups)
  if (mapped !== null) return mapped

  // A bare specifier whose first segment is a real directory under the project
  // is the framework-resolution case: cal.com's `app/…` imports sit beside an
  // `apps/web/app` that exists, and only Next's own resolver finds them.
  const first = site.specifier.split('/')[0]!
  const bases = [baseOf(root, configPath, lookups), dirname(site.file), '']
  return bases.some((base) => onDisk(root, posix.join(base, first), lookups))
    ? 'unmapped'
    : 'broken'
}

/**
 * A relative import's cause, which turns on one question.
 *
 * A target that is on disk and still did not resolve is a file type codedocs
 * does not read — a component importing its own `./index.css` — and only a
 * target that is not there at all is `broken`. The wave keeps its own row for it
 * either way, because the file that would fix it may appear later.
 */
function relativeCause(
  root: string,
  site: SpecifierSite,
  lookups: Lookups,
): PreconditionCause {
  const target = posix.normalize(posix.join(dirname(site.file), site.specifier))
  return onDisk(root, target, lookups) ? 'unmapped' : 'broken'
}

/**
 * What the package a bare specifier names says about it, or `null` for silence.
 *
 * On disk with nothing asked of it: installed and carrying no types, and the
 * command that would fix that is a guess rather than a remediation. On disk with
 * a subpath that is there too: codedocs did not resolve what is in front of it.
 * On disk with a subpath that is not: one codegen away, which is
 * `@calcom/prisma/enums` × 306 on cal.com. Not on disk but declared: an install
 * has not run.
 */
function packageCause(
  root: string,
  site: SpecifierSite,
  packageName: string,
  lookups: Lookups,
): PreconditionCause | null {
  const from = join(root, dirname(site.file))
  const installed = installedPackage(root, from, packageName, lookups.present)
  if (installed !== false) {
    if (packageName === site.specifier) return 'unmapped'
    const subpath = site.specifier.slice(packageName.length + 1)
    return resolves(join(installed, subpath)) ? 'unmapped' : 'missing-generated'
  }
  return dependencyNames(root, from, lookups.declared).has(packageName)
    ? 'unprepared'
    : null
}

/**
 * What the project's own `paths` say about a specifier, or `null` for silence.
 *
 * A mapped specifier whose every target directory is absent is the codegen case
 * ADR 0001's third signal names at the level of a whole config: Redwood maps
 * `types/*` at `./types/*`, and nothing has written that directory yet. Where
 * the directory does exist, codedocs simply did not resolve what the config
 * describes, which is `unmapped` rather than an accusation.
 */
function mappedTarget(
  root: string,
  specifier: string,
  configPath: FilePath | undefined,
  lookups: Lookups,
): PreconditionCause | null {
  if (configPath === undefined) return null
  const config = configFor(root, configPath, lookups)
  const paths = asRecord(config.compilerOptions['paths'])
  const base = posix.join(
    dirname(configPath) === '.' ? '' : dirname(configPath),
    typeof config.compilerOptions['baseUrl'] === 'string'
      ? config.compilerOptions['baseUrl']
      : '.',
  )

  for (const [pattern, targets] of Object.entries(paths)) {
    const tail = matchPattern(pattern, specifier)
    if (tail === null) continue
    const directories = (asStrings(targets) ?? []).map((target) =>
      posix.normalize(posix.join(base, dirname(target.replace('*', tail)))),
    )
    return directories.some((directory) => onDisk(root, directory, lookups))
      ? 'unmapped'
      : 'missing-generated'
  }
  return null
}

/** One project's config, read once per classification run. */
function configFor(
  root: string,
  configPath: FilePath,
  lookups: Lookups,
): ProjectConfig {
  const cached = lookups.configs.get(configPath)
  if (cached !== undefined) return cached
  const config = readConfig(join(root, configPath))
  lookups.configs.set(configPath, config)
  return config
}

/** What a `paths` pattern's `*` stood for, or `null` where it did not match. */
function matchPattern(pattern: string, specifier: string): string | null {
  const star = pattern.indexOf('*')
  if (star === -1) return pattern === specifier ? '' : null
  const head = pattern.slice(0, star)
  const tail = pattern.slice(star + 1)
  if (!specifier.startsWith(head) || !specifier.endsWith(tail)) return null
  return specifier.slice(head.length, specifier.length - tail.length)
}

/** Whether a repository-relative path is on disk, asked once per path. */
function onDisk(root: string, relative: string, lookups: Lookups): boolean {
  const cached = lookups.exists.get(relative)
  if (cached !== undefined) return cached
  const found = relative !== '' && existsSync(join(root, relative))
  lookups.exists.set(relative, found)
  return found
}

/**
 * The package a bare specifier names, or `null` where it names no package.
 *
 * `@scope/name` takes two segments and everything else takes one. A specifier
 * that starts with a character no package name may start with is an alias, and
 * the caller reads `null` as exactly that.
 */
function packageOf(specifier: string): string | null {
  if (/^[~#]/.test(specifier)) return null
  const segments = specifier.split('/')
  if (specifier.startsWith('@')) {
    // `@/components/x` is an alias wearing a scope: a real scope has a name.
    if (segments[0] === '@' || segments.length < 2 || segments[1] === '') {
      return null
    }
    return `${segments[0]}/${segments[1]}`
  }
  return segments[0] === '' ? null : segments[0]!
}

/** Whether a package is on disk in any `node_modules` above the importer. */
function installedPackage(
  root: string,
  from: string,
  packageName: string,
  cache: Map<string, string | false>,
): string | false {
  const key = `${from}\u0000${packageName}`
  const cached = cache.get(key)
  if (cached !== undefined) return cached
  const found =
    upward(root, from, (directory) => {
      const absolute = join(directory, 'node_modules', packageName)
      return existsSync(absolute) ? absolute : undefined
    }) ?? false
  cache.set(key, found)
  return found
}

/** The extensions a subpath may be spelled without. */
const IMPLIED: readonly string[] = [
  '',
  '.ts',
  '.tsx',
  '.d.ts',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '/index.ts',
  '/index.d.ts',
  '/index.js',
]

/** Whether something is at this absolute path, under any implied extension. */
const resolves = (absolute: string): boolean =>
  IMPLIED.some((extension) => existsSync(`${absolute}${extension}`))

/** The directory a project's specifiers are resolved against, if it names one. */
function baseOf(
  root: string,
  configPath: FilePath | undefined,
  lookups: Lookups,
): string {
  if (configPath === undefined) return ''
  const config = configFor(root, configPath, lookups)
  const baseUrl = config.compilerOptions['baseUrl']
  const directory = dirname(configPath) === '.' ? '' : dirname(configPath)
  return typeof baseUrl === 'string'
    ? posix.normalize(posix.join(directory, baseUrl))
    : directory
}

/** Every dependency the nearest `package.json` declares, by name. */
function dependencyNames(
  root: string,
  from: string,
  cache: Map<string, ReadonlySet<string>>,
): ReadonlySet<string> {
  const cached = cache.get(from)
  if (cached !== undefined) return cached
  const found =
    upward(root, from, (directory) => {
      const manifest = readJsonc(join(directory, 'package.json'))
      if (manifest === undefined) return undefined
      return new Set([
        ...Object.keys(asRecord(manifest['dependencies'])),
        ...Object.keys(asRecord(manifest['devDependencies'])),
        ...Object.keys(asRecord(manifest['peerDependencies'])),
        ...Object.keys(asRecord(manifest['optionalDependencies'])),
      ])
    }) ?? new Set<string>()
  cache.set(from, found)
  return found
}
