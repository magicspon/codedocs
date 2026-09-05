/**
 * Derives the record the report reads from one run's saved stream and patch.
 *
 * Nothing here spawns an agent: given the lines a run produced and the diff it
 * left, the record is fully determined, which is what lets `--rescore` rebuild
 * every result on disk without spending any quota.
 */

import { parseDiff } from './diff.ts'
import { invalidReason, scoreDiff } from './score.ts'
import { parseStream } from './stream.ts'
import type { Arm, BenchCase, RunJudgement, RunRecord } from '../core/types.ts'

/** Raised when the API refuses a run, so the session stops instead of filing empty records. */
export class RateLimited extends Error {
  constructor(until: number) {
    const when = until
      ? new Date(until * 1000).toISOString()
      : 'an unknown time'
    super(`the API refused the run; the quota frees up at ${when}`)
  }
}

/** Everything one finished run left behind, and what it was run as. */
export type RunInputs = {
  /** The agent's stream, line by line. */
  lines: string[]
  /** The patch left in the run's worktree, as unified diff text. */
  patch: string
  bench: BenchCase
  arm: Arm
  replicate: number
  startedAt: string
  /**
   * What a judge made of the patch, where one has been obtained. Passed in
   * rather than fetched here: judging is asynchronous and costs money, and this
   * function has to stay a pure fold so `--rescore` can replay it for nothing.
   */
  judgement?: RunJudgement | null
}

/** Folds one run's stream and patch into the record the report reads. */
export function recordFrom(inputs: RunInputs): RunRecord {
  const { lines, patch, bench, arm, replicate, startedAt } = inputs
  const { metrics, usedCodedocs, rateLimitedUntil } = parseStream(lines)
  if (rateLimitedUntil !== null) throw new RateLimited(rateLimitedUntil)
  const changed = parseDiff(patch)
  return {
    caseId: bench.id,
    arm,
    replicate,
    startedAt,
    baseCommit: bench.base.commit,
    metrics,
    diff: changed.length > 0 ? scoreDiff(changed, bench) : null,
    usedCodedocs,
    invalid: invalidReason(
      arm.toolset,
      metrics,
      changed.length > 0,
      usedCodedocs,
    ),
    judgement: inputs.judgement ?? null,
  }
}

/** The one-line summary printed as each run lands. */
export function verdictLine(record: RunRecord): string {
  const { metrics, diff, invalid, judgement } = record
  const verdict = invalid
    ? `INVALID (${invalid})`
    : diff?.correct
      ? 'hit'
      : 'miss'
  // The judge's two grades sit behind the structural verdict rather than
  // replacing it: one says the patch changed the right code, the other says the
  // change is right, and the benchmark reports both.
  const judged = judgement
    ? ` · ${judgement.correctness}/${judgement.similarity}`
    : ''
  return (
    `${String(metrics.tokensTotal).padStart(9)} tok  ${String(metrics.toolCalls).padStart(3)} calls  ` +
    `${String(metrics.filesOpened.length).padStart(3)} files  ` +
    `${String(diff?.files.length ?? 0).padStart(2)} patched  ` +
    `${String(Math.round(metrics.durationMs / 1000)).padStart(4)}s  ${verdict}${judged}`
  )
}
