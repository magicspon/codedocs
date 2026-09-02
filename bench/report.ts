/**
 * Reads `bench/results/` and prints the arm comparison.
 *
 *   node bench/report.ts            the table
 *   node bench/report.ts --json     the same numbers, machine readable
 *
 * Medians rather than means throughout: with three replicates one runaway
 * agent loop would drag a mean somewhere the typical run never goes.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { casesById } from './cases.ts'
import { RESULTS } from './paths.ts'
import type { ArmName, BenchCase, RunRecord } from './types.ts'

/** The middle value, averaging the two middles on an even count. */
function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? (sorted[mid] ?? 0)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
}

/** What one arm did on one case, across its replicates. */
type Cell = {
  runs: number
  invalid: number
  hits: number
  symbolHits: number
  tokens: number
  toolCalls: number
  files: number
  seconds: number
  costUsd: number
}

function summarise(records: RunRecord[]): Cell {
  const valid = records.filter((r) => r.invalid === null)
  return {
    runs: records.length,
    invalid: records.length - valid.length,
    hits: valid.filter((r) => r.answer?.correct).length,
    symbolHits: valid.filter((r) => r.answer?.symbolHit).length,
    tokens: Math.round(median(valid.map((r) => r.metrics.tokensTotal))),
    toolCalls: Math.round(median(valid.map((r) => r.metrics.toolCalls))),
    files: Math.round(median(valid.map((r) => r.metrics.filesOpened.length))),
    seconds: Math.round(median(valid.map((r) => r.metrics.durationMs / 1000))),
    costUsd: median(valid.map((r) => r.metrics.costUsd)),
  }
}

/** Reads a delta as a percentage change from baseline. Negative is a saving. */
function delta(baseline: number, codedocs: number): string {
  if (baseline === 0) return '—'
  const change = ((codedocs - baseline) / baseline) * 100
  const sign = change > 0 ? '+' : ''
  return `${sign}${change.toFixed(0)}%`
}

function pad(value: string | number, width: number): string {
  return String(value).padStart(width)
}

/** Every run record on disk. */
function loadRecords(): RunRecord[] {
  return readdirSync(RESULTS)
    .filter((f) => f.endsWith('.json') && !f.endsWith('.stream.jsonl'))
    .map((f) => JSON.parse(readFileSync(join(RESULTS, f), 'utf8')) as RunRecord)
}

/** One arm's row. The case and shape columns print on the first arm only. */
function armRow(
  label: string,
  shape: string,
  arm: ArmName,
  cell: Cell,
): string {
  const invalid = cell.invalid > 0 ? ` (${cell.invalid} invalid)` : ''
  const counted = cell.runs - cell.invalid
  return (
    `  ${label.padEnd(10)}${shape.padEnd(15)}${arm.padEnd(11)}` +
    `${pad(cell.tokens.toLocaleString(), 9)}${pad(cell.toolCalls, 7)}${pad(cell.files, 7)}${pad(cell.seconds, 6)}` +
    `${pad(`${cell.hits}/${counted}`, 6)}${pad(`${cell.symbolHits}/${counted}`, 6)}${invalid}`
  )
}

/** The delta row beneath a pair of arms. Negative is a saving. */
function deltaRow(base: Cell, cd: Cell): string {
  return (
    `  ${''.padEnd(21)}${'delta'.padEnd(11)}${pad(delta(base.tokens, cd.tokens), 9)}` +
    `${pad(delta(base.toolCalls, cd.toolCalls), 7)}${pad(delta(base.files, cd.files), 7)}` +
    `${pad(delta(base.seconds, cd.seconds), 6)}`
  )
}

const ARMS: ArmName[] = ['baseline', 'codedocs']

/** Prints one case: a row per arm, then the delta between them. */
function printCase(id: string, shape: string, records: RunRecord[]): void {
  const cells = new Map<ArmName, Cell>()
  for (const arm of ARMS) {
    const runs = records.filter((r) => r.caseId === id && r.arm === arm)
    if (runs.length === 0) continue
    const cell = summarise(runs)
    cells.set(arm, cell)
    console.log(
      armRow(
        arm === 'baseline' ? id : '',
        arm === 'baseline' ? shape : '',
        arm,
        cell,
      ),
    )
  }
  const base = cells.get('baseline')
  const cd = cells.get('codedocs')
  if (base && cd) console.log(deltaRow(base, cd))
  console.log('')
}

/** The `--json` rendering: the same medians, without the table. */
function printJson(
  ids: string[],
  records: RunRecord[],
  cases: Map<string, BenchCase>,
): void {
  const payload = ids.map((id) => ({
    case: id,
    shape: cases.get(id)?.shape ?? null,
    arms: Object.fromEntries(
      ARMS.map((arm) => [
        arm,
        summarise(records.filter((r) => r.caseId === id && r.arm === arm)),
      ]),
    ),
  }))
  console.log(JSON.stringify(payload, null, '\t'))
}

/** The pooled line across every case, and the delta beneath it. */
function printTotals(records: RunRecord[]): void {
  // Pooling every valid run means a case with more replicates carries
  // proportionally more weight — which is what pooling should mean.
  console.log(`  ${'-'.repeat(77)}`)
  const totals = new Map<ArmName, Cell>()
  for (const arm of ARMS) {
    const cell = summarise(records.filter((r) => r.arm === arm))
    if (cell.runs === 0) continue
    totals.set(arm, cell)
    console.log(armRow('ALL', '', arm, cell))
  }
  const base = totals.get('baseline')
  const cd = totals.get('codedocs')
  if (!base || !cd) return
  console.log(deltaRow(base, cd))
  console.log(
    `\n  median cost per run: baseline $${base.costUsd.toFixed(3)}, codedocs $${cd.costUsd.toFixed(3)}`,
  )
}

/** The table header, which fixes the column widths every row then follows. */
function printHeader(): void {
  console.log(
    '\ncodedocs localization benchmark — microsoft/vscode, medians per cell\n',
  )
  console.log(
    `  ${'case'.padEnd(10)}${'shape'.padEnd(15)}${'arm'.padEnd(11)}${pad('tokens', 9)}` +
      `${pad('calls', 7)}${pad('files', 7)}${pad('sec', 6)}${pad('hit', 6)}${pad('sym', 6)}`,
  )
  console.log(`  ${'-'.repeat(77)}`)
}

function main(): void {
  const records = loadRecords()
  if (records.length === 0) {
    console.log('no results yet — run `node bench/run.ts` first')
    return
  }
  const cases = casesById()
  const ids = [...new Set(records.map((r) => r.caseId))].sort()

  if (process.argv.includes('--json')) {
    printJson(ids, records, cases)
    return
  }

  printHeader()
  for (const id of ids) printCase(id, cases.get(id)?.shape ?? '?', records)
  printTotals(records)
  console.log('')
}

main()
