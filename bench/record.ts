/**
 * Derives the record the report reads from one saved stream.
 *
 * Nothing here spawns an agent: given the lines a run produced, the record is
 * fully determined, which is what lets `--rescore` rebuild every result on disk
 * without spending any quota.
 */

import { extractAnswer, invalidReason, score } from './score.ts'
import { parseStream } from './stream.ts'
import type { ArmName, BenchCase, RunRecord } from './types.ts'

/** Raised when the API refuses a run, so the session stops instead of filing empty records. */
export class RateLimited extends Error {
  constructor(until: number) {
    const when = until
      ? new Date(until * 1000).toISOString()
      : 'an unknown time'
    super(`the API refused the run; the quota frees up at ${when}`)
  }
}

/** Folds one saved stream into the record the report reads. */
export function recordFrom(
  lines: string[],
  bench: BenchCase,
  arm: ArmName,
  replicate: number,
  model: string,
  startedAt: string,
): RunRecord {
  const { metrics, text, usedCodedocs, rateLimitedUntil } = parseStream(lines)
  if (rateLimitedUntil !== null) throw new RateLimited(rateLimitedUntil)
  const extracted = extractAnswer(text)
  return {
    caseId: bench.id,
    arm,
    replicate,
    startedAt,
    model,
    baseCommit: bench.base.commit,
    metrics,
    answer: extracted ? score(extracted, bench) : null,
    invalid: invalidReason(arm, metrics, extracted !== null, usedCodedocs),
  }
}

/** The one-line summary printed as each run lands. */
export function verdictLine(record: RunRecord): string {
  const { metrics, answer, invalid } = record
  const verdict = invalid
    ? `INVALID (${invalid})`
    : answer?.correct
      ? 'hit'
      : 'miss'
  return (
    `${String(metrics.tokensTotal).padStart(9)} tok  ${String(metrics.toolCalls).padStart(3)} calls  ` +
    `${String(metrics.filesOpened.length).padStart(3)} files  ` +
    `${String(Math.round(metrics.durationMs / 1000)).padStart(4)}s  ${verdict}`
  )
}
