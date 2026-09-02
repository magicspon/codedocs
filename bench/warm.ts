/**
 * Builds the index the codedocs arm is told it already has.
 *
 * Every run gets a fresh worktree, and a fresh worktree has no index, so the
 * build happens here — before the agent starts, in a process the benchmark is
 * not measuring. Charging the cold build to a run would compare one arm's
 * search against the other's search plus an index build, which is not the
 * question. The build cost is stated in the README instead.
 */

import { execFileSync } from 'node:child_process'
import { CODEDOCS } from './paths.ts'

/** Indexes one worktree, and returns the seconds it took. */
export function warmIndex(root: string): number {
  const started = Date.now()
  // Any query builds the index; a name nothing matches keeps the answer empty
  // and the build the only work done.
  execFileSync(CODEDOCS, ['symbol', '__warm__', '--cwd', root], {
    encoding: 'utf8',
  })
  return Math.round((Date.now() - started) / 1000)
}
