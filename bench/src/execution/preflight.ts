/**
 * The checks that must pass before any quota is spent.
 *
 * All of them are about ground truth. A case is only a real bug at the commit
 * before its fix, so the harness verifies that the commit a case declares is
 * exactly that one, and that the files the fix touched exist in its tree.
 * Either check failing means a run would measure a search for code that is not
 * there, which is worse than not running at all.
 */

import { existsSync } from 'node:fs'
import { TARGET } from '../core/paths.ts'
import type { BenchCase } from '../core/types.ts'
import { fetchCommit, hasFileAt, parentOf } from './worktree.ts'

/**
 * Makes sure the clone can resolve the fix's parent, fetching the fix if it
 * cannot.
 *
 * `repos/vscode` is a depth-1 clone, so the commits the cases name are normally
 * absent and have to be asked for by hash. One fetch at depth 2 brings the fix
 * and the commit under it, which is the state the case runs against.
 */
function ensureFixIsResolvable(bench: BenchCase): void {
  if (parentOf(bench.fix.commit) !== null) return
  process.stdout.write(`  fetching the state case ${bench.id} runs against… `)
  try {
    fetchCommit(bench.fix.commit)
  } catch (error) {
    console.log('failed')
    throw new Error(
      `case ${bench.id} needs commit ${bench.fix.commit} and its parent, and fetching them failed: ${(error as Error).message}`,
    )
  }
  console.log('done')
}

/** Refuses any case whose declared repository state is not the commit before its fix. */
function checkCase(bench: BenchCase): void {
  ensureFixIsResolvable(bench)
  const parent = parentOf(bench.fix.commit)
  if (parent !== bench.base.commit) {
    throw new Error(
      `case ${bench.id} declares base ${bench.base.commit}, but the commit before its fix is ${parent}`,
    )
  }
  // A truth file the base tree does not carry means the case is asking for code
  // that was not there yet, and no answer to it could be right.
  for (const path of bench.truth.files) {
    if (!hasFileAt(bench.base.commit, path)) {
      throw new Error(
        `case ${bench.id} names ${path} as ground truth, and ${bench.base.commit} has no such file`,
      )
    }
  }
}

/** Refuses to run when any case's repository state would void its ground truth. */
export function preflight(cases: BenchCase[]): void {
  if (!existsSync(TARGET)) {
    throw new Error(
      `${TARGET} is missing; clone microsoft/vscode into it first`,
    )
  }
  for (const bench of cases) checkCase(bench)
}
