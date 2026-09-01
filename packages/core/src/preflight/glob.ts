/** Reproducing which files a project's `tsconfig` globs, from the shared tree walk. */

import { dirname, posix, resolve } from 'node:path'

import { toRepoPath } from '../discovery.ts'
import type { FilePath } from '../model.ts'
import type { ProjectConfig } from './tsconfig.ts'

/**
 * The directories `tsconfig` excludes by default, per TypeScript's own defaults.
 * `outDir` and `declarationDir` are added from the config when it names them.
 */
const DEFAULT_EXCLUDES: readonly string[] = [
  'node_modules',
  'bower_components',
  'jspm_packages',
]

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
export function globbedFiles(
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
