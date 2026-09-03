/**
 * Proves a restored index is the index a build would have produced.
 *
 *   node bench/verify-cache.ts
 *
 * The cache is only worth having if what it hands a run is indistinguishable
 * from a fresh build, so this checks the two things that could go wrong and
 * would otherwise go wrong silently:
 *
 *   1. **It is fast.** A restore that quietly re-analyses has saved nothing, and
 *      would look identical from outside except for the clock.
 *   2. **It answers.** A restored index that is present but stale, truncated or
 *      keyed to the tree it was built in would answer nothing and read as a
 *      repository with no such symbol — which is exactly what a codedocs arm
 *      failing to find anything looks like.
 *
 * Runs no agent and spends no quota.
 */

import { execFileSync } from 'node:child_process'
import { loadCases } from './cases.ts'
import { CODEDOCS } from './paths.ts'
import { isCached, warmIndex } from './warm.ts'
import { createWorktree } from './worktree.ts'

/** Asks the restored index for a symbol the case's ground truth names. */
function ask(root: string, symbol: string): string {
  return execFileSync(
    CODEDOCS,
    ['symbol', symbol, '--cwd', root, '--limit', '3'],
    {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  )
}

function main(): void {
  let failures = 0
  for (const bench of loadCases()) {
    const label = `${bench.id}  ${bench.base.commit.slice(0, 10)}`
    if (!isCached(bench.base.commit)) {
      console.log(`  ${label}  NOT CACHED — run \`node bench/run.ts --warm\``)
      failures += 1
      continue
    }
    const worktree = createWorktree(`verify-${bench.id}`, bench.base.commit)
    try {
      const warmed = warmIndex(worktree.root, bench.base.commit)
      // A ground-truth symbol: the index must know the code the case is about,
      // not merely open without error.
      const symbol = bench.truth.symbols[0]
      const answer = symbol ? ask(worktree.root, symbol) : ''
      const found = symbol ? answer.includes(symbol) : false
      const how = warmed.fromCache ? 'restored' : 'REBUILT'
      console.log(
        `  ${label}  ${how} in ${warmed.seconds}s  ` +
          `${symbol ?? '(no truth symbol)'} → ${found ? 'found' : 'NOT FOUND'}`,
      )
      if (!warmed.fromCache || !found) failures += 1
    } finally {
      worktree.remove()
    }
  }
  console.log(
    failures === 0
      ? '\nevery case restores from cache and answers from it.'
      : `\n${failures} case(s) failed.`,
  )
  if (failures > 0) process.exitCode = 1
}

main()
