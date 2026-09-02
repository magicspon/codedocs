/**
 * The table itself: column widths, the row a cell becomes, and the delta
 * beneath a pair of arms.
 *
 * Every block of the report — a case, a level, the pooled total — is the same
 * shape, so they are all printed by `printArms`.
 */

import { delta, summarise, type Cell } from './summarise.ts'
import type { ArmName, RunRecord } from './types.ts'

/** The width of the table body, which every rule spans. */
const RULE = '-'.repeat(92)

export const ARMS: ArmName[] = ['baseline', 'codedocs']

function pad(value: string | number, width: number): string {
  return String(value).padStart(width)
}

/** One arm's row. The label and shape columns print on the first arm only. */
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
    `${pad(cell.tokens.toLocaleString(), 9)}${pad(cell.toolCalls, 7)}${pad(cell.steps, 7)}` +
    `${pad(cell.files, 7)}${pad(cell.sourceLines.toLocaleString(), 8)}${pad(cell.seconds, 6)}` +
    `${pad(`${cell.hits}/${counted}`, 6)}${pad(`${cell.symbolHits}/${counted}`, 6)}${invalid}`
  )
}

/**
 * The delta row beneath a pair of arms. Negative is a saving.
 *
 * The 25 matches the label and shape columns an arm row prints (10 + 15), so
 * the percentages land under the numbers they are about.
 */
function deltaRow(base: Cell, cd: Cell): string {
  return (
    `  ${''.padEnd(25)}${'delta'.padEnd(11)}${pad(delta(base.tokens, cd.tokens), 9)}` +
    `${pad(delta(base.toolCalls, cd.toolCalls), 7)}${pad(delta(base.steps, cd.steps), 7)}` +
    `${pad(delta(base.files, cd.files), 7)}` +
    `${pad(delta(base.sourceLines, cd.sourceLines), 8)}` +
    `${pad(delta(base.seconds, cd.seconds), 6)}`
  )
}

/**
 * Prints one block: a row per arm over the records given, then the delta.
 * Returns the cells, because the pooled block also prints their cost.
 */
export function printArms(
  label: string,
  shape: string,
  records: RunRecord[],
): Map<ArmName, Cell> {
  const cells = new Map<ArmName, Cell>()
  for (const arm of ARMS) {
    const runs = records.filter((r) => r.arm === arm)
    if (runs.length === 0) continue
    const cell = summarise(runs)
    cells.set(arm, cell)
    console.log(
      armRow(
        arm === 'baseline' ? label : '',
        arm === 'baseline' ? shape : '',
        arm,
        cell,
      ),
    )
  }
  const base = cells.get('baseline')
  const cd = cells.get('codedocs')
  if (base && cd) console.log(deltaRow(base, cd))
  return cells
}

/** The title and column header, which fix the widths every row then follows. */
export function printHeader(): void {
  console.log('\ncodedocs fix benchmark — microsoft/vscode, medians per cell')
  console.log('  cases grouped by difficulty level; see bench/DIFFICULTY.md\n')
  console.log(
    `  ${'case'.padEnd(10)}${'shape'.padEnd(15)}${'arm'.padEnd(11)}${pad('tokens', 9)}` +
      `${pad('calls', 7)}${pad('steps', 7)}${pad('files', 7)}${pad('src', 8)}` +
      `${pad('sec', 6)}${pad('hit', 6)}${pad('sym', 6)}`,
  )
}

/** The rule that opens a level, and the level's heading. */
export function printLevelHeading(heading: string): void {
  console.log(`  ${RULE}`)
  console.log(`  ${heading}\n`)
}

/** The pooled block across every case, and the median cost beneath it. */
export function printTotals(records: RunRecord[]): void {
  // Pooling every valid run means a case with more replicates carries
  // proportionally more weight — which is what pooling should mean.
  console.log(`  ${RULE}`)
  const totals = printArms('ALL', 'every case', records)
  const base = totals.get('baseline')
  const cd = totals.get('codedocs')
  if (!base || !cd) return
  console.log(
    `\n  median cost per run: baseline $${base.costUsd.toFixed(3)}, codedocs $${cd.costUsd.toFixed(3)}`,
  )
}
