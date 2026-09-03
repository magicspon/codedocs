/**
 * The numbers behind one cell of the report.
 *
 * Medians rather than means throughout: with three replicates one runaway agent
 * loop would drag a mean somewhere the typical run never goes.
 */

import { SIMILARITY } from './rubric.ts'
import type { RunJudgement, RunRecord, Similarity } from './types.ts'

/** What one arm did over some set of runs — one case, one level, or all of them. */
export type Cell = {
  runs: number
  invalid: number
  /**
   * How many runs each reason threw out. Counting them is not enough on its
   * own: "the agent left no patch" and "baseline reached for codedocs" say very
   * different things about a set, and a single total hides which happened.
   */
  invalidReasons: Record<string, number>
  /** Runs whose patch changed every ground-truth file. */
  hits: number
  /** Runs whose patch named at least one ground-truth symbol. */
  symbolHits: number
  /** Turns the loop took — one request to the model each. */
  requests: number
  tokens: number
  /**
   * Every token the model read: the uncached remainder, the cache writes and
   * the cache reads together.
   *
   * Deliberately not `usage.input_tokens` on its own, which counts only the
   * remainder — a few dozen tokens against a million on a long loop. Printed
   * beside a total it does not add up to, it reads as a broken table rather
   * than as the narrow thing it is. As counted here, input plus output is the
   * total.
   */
  tokensInput: number
  tokensOutput: number
  toolCalls: number
  /** Tool calls that inspected the repository. */
  steps: number
  files: number
  /** Lines of repository content those inspections returned. */
  sourceLines: number
  seconds: number
  costUsd: number
  /** Valid runs a judge has read. The rest are counted, never guessed at. */
  judged: number
  /** Of those, the ones judged to fix the bug. */
  fixes: number
  /** Of those, the ones judged to fix part of it. */
  partials: number
  /** The similarity grade most of them were given. */
  similarity: Similarity | null
  /** Median share of readings that agreed, over the judged runs. */
  agreement: number
  /**
   * What judging this cell cost, summed rather than medianed: the judge's spend
   * is a bill to be stated, not a typical run to be compared.
   */
  judgeCostUsd: number
}

/**
 * Runs behind a cell's numbers — the ones that counted.
 *
 * A cell whose every run was discarded has no numbers, only zeros, and those
 * zeros are not measurements. Nothing may render or compare against a cell this
 * returns 0 for.
 */
export function counted(cell: Cell): number {
  return cell.runs - cell.invalid
}

/** The middle value, averaging the two middles on an even count. */
function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? (sorted[mid] ?? 0)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
}

/**
 * The similarity grade most of a cell's judged runs were given.
 *
 * Ties break toward the earlier grade in the rubric's scale, which is ordered
 * most conservative first, so a split cell never reads as the closer match.
 */
function modalSimilarity(grades: Similarity[]): Similarity | null {
  if (grades.length === 0) return null
  const count = (grade: Similarity): number =>
    grades.filter((g) => g === grade).length
  return [...SIMILARITY].reduce((a, b) => (count(b) > count(a) ? b : a))
}

/**
 * What a set of judgements actually cost, counted once per judgement.
 *
 * Judgements are cached by what the judge was shown, so two runs that produced
 * the same patch carry the same judgement and it was only paid for once.
 * Summing per run would bill the second one again.
 */
export function judgeSpend(judgements: RunJudgement[]): number {
  const paid = new Map(judgements.map((j) => [j.key, j.costUsd]))
  return [...paid.values()].reduce((sum, cost) => sum + cost, 0)
}

/** Tallies why runs were thrown out, so a total never stands in for the reasons. */
function reasonsIn(records: RunRecord[]): Record<string, number> {
  const reasons: Record<string, number> = {}
  for (const record of records) {
    if (record.invalid === null) continue
    reasons[record.invalid] = (reasons[record.invalid] ?? 0) + 1
  }
  return reasons
}

/** Folds the runs of one arm into the cell the report prints. Invalid runs are counted, not measured. */
export function summarise(records: RunRecord[]): Cell {
  const valid = records.filter((r) => r.invalid === null)
  const judged = valid.flatMap((r) => (r.judgement ? [r.judgement] : []))
  return {
    runs: records.length,
    invalid: records.length - valid.length,
    invalidReasons: reasonsIn(records),
    hits: valid.filter((r) => r.diff?.correct).length,
    symbolHits: valid.filter((r) => (r.diff?.symbolsHit.length ?? 0) > 0)
      .length,
    requests: Math.round(median(valid.map((r) => r.metrics.turns))),
    tokens: Math.round(median(valid.map((r) => r.metrics.tokensTotal))),
    tokensInput: Math.round(
      median(
        valid.map(
          (r) =>
            r.metrics.tokensInput +
            r.metrics.tokensCacheRead +
            r.metrics.tokensCacheCreation,
        ),
      ),
    ),
    tokensOutput: Math.round(median(valid.map((r) => r.metrics.tokensOutput))),
    toolCalls: Math.round(median(valid.map((r) => r.metrics.toolCalls))),
    steps: Math.round(median(valid.map((r) => r.metrics.explorationSteps))),
    files: Math.round(median(valid.map((r) => r.metrics.filesOpened.length))),
    sourceLines: Math.round(
      median(valid.map((r) => r.metrics.sourceLinesRead)),
    ),
    seconds: Math.round(median(valid.map((r) => r.metrics.durationMs / 1000))),
    costUsd: median(valid.map((r) => r.metrics.costUsd)),
    judged: judged.length,
    fixes: judged.filter((j) => j.correctness === 'correct').length,
    partials: judged.filter((j) => j.correctness === 'partial').length,
    similarity: modalSimilarity(judged.map((j) => j.similarity)),
    // Both axes in one figure: the weaker of the two, so an arm's agreement is
    // never read off whichever axis happened to be the steadier.
    agreement: median(
      judged.map((j) =>
        Math.min(j.agreement.correctness, j.agreement.similarity),
      ),
    ),
    judgeCostUsd: judgeSpend(judged),
  }
}

/** Reads a delta as a percentage change from the reference arm. Negative is a saving. */
export function delta(reference: number, arm: number): string {
  if (reference === 0) return '—'
  const change = ((arm - reference) / reference) * 100
  const sign = change > 0 ? '+' : ''
  return `${sign}${change.toFixed(0)}%`
}
