/**
 * The signals ADR 0003 classifies files by, one function each.
 *
 * They are read in precedence order by `index.ts` and never here: a signal that
 * decided its own precedence would be a signal that has to know about the
 * others.
 */

import { execFileSync } from 'node:child_process'
import { openSync, readSync, closeSync } from 'node:fs'
import { join } from 'node:path'

import type { FilePath } from '../model.ts'

/**
 * Every file git tracks, or `null` where git could not answer.
 *
 * `null` and "the empty set" are different states: a checkout that is not a
 * repository has no untracked files to speak of, while a repository that tracks
 * nothing has every file untracked. Reporting the first as the second would
 * label an entire non-git checkout `generated`.
 */
export function trackedFiles(root: string): ReadonlySet<FilePath> | null {
  try {
    const out = execFileSync('git', ['ls-files', '-z'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      // cal.com tracks 5,025 files; the default 1 MB buffer truncates lists of
      // this size, and a truncated list reads as "untracked" for the remainder.
      maxBuffer: 64 * 1024 * 1024,
    })
    return new Set(out.split('\0').filter((path) => path !== ''))
  } catch {
    return null
  }
}

/** How much of a file the header scan reads. Five lines is ADR 0003's window. */
const HEADER_BYTES = 512
const HEADER_LINES = 5

/**
 * The sentinels a generator writes at the top of a file it owns.
 *
 * `@generated` is the convention Meta's tooling established and the one most
 * generators follow; the two sentences are what the rest write instead. Matched
 * case-insensitively, and only in the first five lines, so a file *discussing*
 * generated code is not itself called generated.
 */
const SENTINEL =
  /@generated|do not edit|automatically generated|auto-generated/i

/**
 * Whether a file's first five lines carry a generated sentinel.
 *
 * Reads a fixed 512 bytes rather than the file: the scan runs over every file in
 * the repository, and a header that has not appeared in five lines is not a
 * header. 0.07 s over cal.com's 5,025 files.
 */
export function hasGeneratedHeader(root: string, path: FilePath): boolean {
  let handle
  try {
    handle = openSync(join(root, path), 'r')
  } catch {
    return false
  }
  try {
    const buffer = Buffer.alloc(HEADER_BYTES)
    const read = readSync(handle, buffer, 0, HEADER_BYTES, 0)
    const head = buffer.toString('utf8', 0, read).split('\n', HEADER_LINES)
    return head.some((line) => SENTINEL.test(line))
  } catch {
    return false
  } finally {
    closeSync(handle)
  }
}

/**
 * Paths a generator is known to write, matched on the path alone.
 *
 * `inferred`, and deliberately: nothing about a name proves what wrote it. Every
 * entry is a convention ADR 0001 measured on a real repository rather than one
 * codedocs invented.
 */
const CODEGEN_PATHS: readonly RegExp[] = [
  /(^|\/)[^/]*\.generated\.[^/]+$/,
  /(^|\/)next-env\.d\.ts$/,
  /(^|\/)\.next\/types\//,
  /(^|\/)\.prisma\//,
  /(^|\/)\.redwood\//,
  /(^|\/)__generated__\//,
]

/** Whether a path is one a generator conventionally writes. */
export const isCodegenPath = (path: FilePath): boolean =>
  CODEGEN_PATHS.some((pattern) => pattern.test(path))

/**
 * The path conventions that name a test.
 *
 * Helpers, mocks and fixtures are `test` too: everything that excludes tests
 * wants them excluded as well, which is why ADR 0003 gives them no role of their
 * own.
 */
const TEST_PATHS: readonly RegExp[] = [
  /(^|\/)[^/]*\.(?:test|spec)\.[^/]+$/,
  /(^|\/)__tests__\//,
  /(^|\/)__mocks__\//,
  /(^|\/)__fixtures__\//,
  /(^|\/)(?:test|tests|e2e)\//,
]

/**
 * The path conventions that name a config file.
 *
 * A config file is still authored source; the axes are orthogonal precisely so
 * that saying "config" does not also say "not written by a person".
 */
const CONFIG_PATHS: readonly RegExp[] = [
  /(^|\/)[^/]*\.config\.[^/]+$/,
  /(^|\/)[^/]*rc\.[cm]?[jt]s$/,
  /(^|\/)(?:vitest|jest|playwright|cypress)\.[^/]+$/,
]

/** The role a path convention gives a file, or `null` where none applies. */
export function roleFromPath(path: FilePath): 'test' | 'config' | null {
  // Tests first: `vitest.config.ts` inside `__tests__` is a test's config, and
  // a repository excluding tests means it to go with them.
  if (TEST_PATHS.some((pattern) => pattern.test(path))) return 'test'
  return CONFIG_PATHS.some((pattern) => pattern.test(path)) ? 'config' : null
}
