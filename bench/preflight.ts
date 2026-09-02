/**
 * The checks that must pass before any quota is spent.
 *
 * Both are about the ground truth: a moved checkout was never the tree the
 * cases were verified against, and a dirty one is not the tree either.
 */

import { execFileSync } from 'node:child_process'
import { CODEDOCS, PINNED_COMMIT, TARGET } from './paths.ts'

/** Refuses to run against a moved checkout or a dirty tree, either of which voids the ground truth. */
export function preflight(): void {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: TARGET,
    encoding: 'utf8',
  }).trim()
  if (head !== PINNED_COMMIT) {
    throw new Error(
      `vscode is at ${head}, but every case was verified against ${PINNED_COMMIT}`,
    )
  }
  const dirty = execFileSync('git', ['status', '--porcelain'], {
    cwd: TARGET,
    encoding: 'utf8',
  }).trim()
  if (dirty) throw new Error(`the vscode checkout is dirty:\n${dirty}`)
  // Warm the index, so the codedocs arm pays the per-question cost and not the
  // cold build. The cold build is reported separately in the README.
  execFileSync(CODEDOCS, ['symbol', '__warm__', '--cwd', TARGET], {
    encoding: 'utf8',
  })
}
