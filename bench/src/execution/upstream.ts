/**
 * The fix the maintainers wrote, as the judge is shown it.
 *
 * Read from the clone rather than stored on the case, so it is the commit the
 * case names and not a copy of it that may have drifted. `preflight.ts` has
 * already fetched that commit and checked its files exist, so by the time a
 * judge asks for one there is nothing new that can fail.
 */

import { execFileSync } from 'node:child_process'
import { TARGET } from '../core/paths.ts'
import type { BenchCase } from '../core/types.ts'

/**
 * The upstream fix for a case, as unified diff text.
 *
 * Narrowed to `truth.files`, which is exactly what the case declares a correct
 * answer touches: the non-test source the fix modified. Tests and anything else
 * the commit happened to carry stay out, so the judge reads the same fix the
 * run was scored against and no more of it.
 */
export function upstreamFix(bench: BenchCase): string {
  return execFileSync(
    'git',
    [
      'show',
      // No commit message: the maintainers' own description of the bug would be
      // a second issue text, and only the case's issue is part of the task.
      '--format=',
      '--no-color',
      '--no-ext-diff',
      bench.fix.commit,
      '--',
      ...bench.truth.files,
    ],
    {
      cwd: TARGET,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  )
}
