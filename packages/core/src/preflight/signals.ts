/**
 * ADR 0009's signals 1 and 2, and the lockfile facts they and the fingerprint share.
 *
 * Signal 3 is `globbedFiles` in `glob.ts` — kept apart because it walks the
 * shared tree rather than the filesystem directly.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { FilePath } from '../model.ts'
import { asRecord, readJsonc, upward } from './fs.ts'
import { readConfig } from './tsconfig.ts'

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

/** Signal 1: the nearest `node_modules` at or above the project, up to the root. */
export function hasNodeModules(root: string, from: string): boolean {
  return (
    upward(root, from, (directory) =>
      existsSync(join(directory, 'node_modules')) ? true : undefined,
    ) ?? false
  )
}

/** Signal 2: does the nearest `package.json` declare an install script? */
export function declaresInstallScript(root: string, from: string): boolean {
  return (
    upward(root, from, (directory) => {
      const manifest = readJsonc(join(directory, 'package.json'))
      if (manifest === undefined) return undefined
      const scripts = asRecord(manifest['scripts'])
      return INSTALL_SCRIPTS.some((name) => typeof scripts[name] === 'string')
    }) ?? false
  )
}

/**
 * The nearest lockfile's filename, or `null` where a repository has none.
 *
 * The name alone, never its content: ADR 0011 puts the filename in the default
 * [[Report]] because it names the package manager, which is one of the two
 * dependency versions that change what codedocs does.
 */
export function lockfileName(root: string, from: string = root): string | null {
  return (
    upward(root, from, (directory) =>
      LOCKFILES.find((name) => existsSync(join(directory, name))),
    ) ?? null
  )
}

/**
 * The install command for the nearest lockfile, or `null` where there is none.
 *
 * ADR 0010 keeps this out of `codedocs.jsonc` because it is determinable: the
 * lockfile names the package manager, so `unprepared`'s remediation is read
 * rather than declared. A repository with no lockfile gets no command instead of
 * a guessed one — ADR 0001 refuses a remediation that would send a user the
 * wrong way.
 */
export function installCommand(
  root: string,
  from: string = root,
): string | null {
  const lockfile = lockfileName(root, from)
  return lockfile === null ? null : (INSTALL_COMMANDS[lockfile] ?? null)
}

/** The command each lockfile implies. Keyed by the names in `LOCKFILES`. */
const INSTALL_COMMANDS: Readonly<Record<string, string>> = {
  'pnpm-lock.yaml': 'pnpm install',
  'yarn.lock': 'yarn install',
  'package-lock.json': 'npm install',
  'npm-shrinkwrap.json': 'npm install',
  'bun.lock': 'bun install',
  'bun.lockb': 'bun install',
}

/**
 * One project's `compilerOptions`, with its relative `extends` chain followed.
 *
 * Exported for the [[Report]], which carries them behind `--with-repository`:
 * they are the half of the environment fingerprint a maintainer can read.
 */
export function compilerOptionsOf(
  root: string,
  configPath: FilePath,
): Record<string, unknown> {
  return readConfig(join(root, configPath)).compilerOptions
}

/** The nearest lockfile's content hash, or the empty string where there is none. */
export function lockfileHash(
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
