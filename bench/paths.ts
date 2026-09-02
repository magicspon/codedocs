/**
 * Where the benchmark reads and writes, and the checkout it is pinned to.
 *
 * Every module that touches the target repository resolves through here, so
 * moving the checkout is one edit rather than a search.
 */

import { join, relative, resolve } from 'node:path'

/** The `bench/` directory: cases in, results out. */
export const BENCH: string = import.meta.dirname

const REPO_ROOT = resolve(BENCH, '..')

/** The repository under test. */
export const TARGET: string = resolve(REPO_ROOT, 'repos/vscode')

/** The CLI the codedocs arm is given. */
export const CODEDOCS: string = resolve(REPO_ROOT, 'node_modules/.bin/codedocs')

/** One JSON record and one raw stream per run land here. */
export const RESULTS: string = join(BENCH, 'results')

/** The pinned checkout every case was verified against. A different commit invalidates the truth. */
export const PINNED_COMMIT: string = '736a3ed72ebb9533980a2470a71a78a22bd3de4d'

/** Normalises any path the agent used into one repository-relative form, so a file is counted once. */
export function normalise(path: string): string {
  const absolute = path.startsWith('/') ? path : join(TARGET, path)
  return relative(TARGET, absolute)
}
