/**
 * The numbers behind one cell of the report.
 *
 * Medians rather than means throughout: with three replicates one runaway agent
 * loop would drag a mean somewhere the typical run never goes.
 */

import type { RunRecord } from './types.ts'

/** What one arm did over some set of runs — one case, one level, or all of them. */
export type Cell = {
  runs: number
  invalid: number
  /** Runs whose patch changed every ground-truth file. */
  hits: number
  /** Runs whose patch named at least one ground-truth symbol. */
  symbolHits: number
  tokens: number
  toolCalls: number
  /** Tool calls that inspected the repository. */
  steps: number
  files: number
  /** Lines of repository content those inspections returned. */
  sourceLines: number
  seconds: number
  costUsd: number
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

/** Folds the runs of one arm into the cell the report prints. Invalid runs are counted, not measured. */
export function summarise(records: RunRecord[]): Cell {
  const valid = records.filter((r) => r.invalid === null)
  return {
    runs: records.length,
    invalid: records.length - valid.length,
    hits: valid.filter((r) => r.diff?.correct).length,
    symbolHits: valid.filter((r) => (r.diff?.symbolsHit.length ?? 0) > 0)
      .length,
    tokens: Math.round(median(valid.map((r) => r.metrics.tokensTotal))),
    toolCalls: Math.round(median(valid.map((r) => r.metrics.toolCalls))),
    steps: Math.round(median(valid.map((r) => r.metrics.explorationSteps))),
    files: Math.round(median(valid.map((r) => r.metrics.filesOpened.length))),
    sourceLines: Math.round(
      median(valid.map((r) => r.metrics.sourceLinesRead)),
    ),
    seconds: Math.round(median(valid.map((r) => r.metrics.durationMs / 1000))),
    costUsd: median(valid.map((r) => r.metrics.costUsd)),
  }
}

/** Reads a delta as a percentage change from baseline. Negative is a saving. */
export function delta(baseline: number, codedocs: number): string {
  if (baseline === 0) return '—'
  const change = ((codedocs - baseline) / baseline) * 100
  const sign = change > 0 ? '+' : ''
  return `${sign}${change.toFixed(0)}%`
}
