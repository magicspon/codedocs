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

import { existsSync } from 'node:fs'
import { dirname, join, posix } from 'node:path'

import type {
  FilePath,
  PreconditionCause,
  SpecifierSite,
  UnresolvedSpecifier,
} from '../model.ts'
import { asRecord, asStrings, readJsonc, upward } from './fs.ts'
import { type ProjectConfig, readConfig } from './tsconfig.ts'

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
  const key = `${from} ${packageName}`
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
