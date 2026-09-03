/**
 * Builds the index for every commit the running set needs, before any run.
 *
 * The build is the expensive part of a codedocs run and it is the same work for
 * every replicate and every arm at one commit. Doing it here means it happens
 * once, deliberately, at a moment nothing is being measured — rather than N
 * times inside runs that then have to explain why their wall clock includes an
 * hour of indexing.
 *
 * Its own throwaway worktree, discarded afterwards: the cache is the point, not
 * the tree, and a tree left behind is a tree the next run could inherit.
 */

import { isCached, warmIndex } from './warm.ts'
import type { BenchCase } from './types.ts'
import { createWorktree } from './worktree.ts'

/** The commits the cases need, each once, in the order the cases are listed. */
function commitsOf(cases: BenchCase[]): { commit: string; cases: string[] }[] {
  const byCommit = new Map<string, string[]>()
  for (const bench of cases) {
    const ids = byCommit.get(bench.base.commit) ?? []
    ids.push(bench.id)
    byCommit.set(bench.base.commit, ids)
  }
  return [...byCommit].map(([commit, ids]) => ({ commit, cases: ids }))
}

/** Builds and caches the index for one commit, in a worktree of its own. */
function warmOne(commit: string, ids: string[]): void {
  const label = `${commit.slice(0, 10)}  ${ids.join(', ')}`
  if (isCached(commit)) {
    console.log(`  ${label.padEnd(40)}already cached, skipped`)
    return
  }
  process.stdout.write(`  ${label.padEnd(40)}building… `)
  const worktree = createWorktree(`prewarm-${commit.slice(0, 10)}`, commit)
  try {
    const warmed = warmIndex(worktree.root, commit)
    console.log(`${warmed.seconds}s, cached`)
  } finally {
    worktree.remove()
  }
}

/**
 * Warms the cache for every commit the given cases run against.
 *
 * Safe to re-run: a commit already cached is skipped, so this is also the way
 * to fill in whatever a interrupted warm left undone.
 */
export function prewarm(cases: BenchCase[]): void {
  const commits = commitsOf(cases)
  console.log(
    `${commits.length} commit(s) to index for ${cases.length} case(s)\n`,
  )
  for (const { commit, cases: ids } of commits) warmOne(commit, ids)
  console.log('\nevery run at these commits now restores its index in seconds.')
}
