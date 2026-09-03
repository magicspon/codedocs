/**
 * The table itself: column widths, the row a cell becomes, and the delta
 * beneath an arm.
 *
 * Every block of the report — a case, a level, the pooled total — is the same
 * shape, so they are all printed by `printArms`, however many arms ran.
 */

import { armsIn } from './arms.ts'
import { delta, summarise, type Cell } from './summarise.ts'
import type { Arm, RunRecord } from './types.ts'

/** The width of the table body, which every rule spans. */
const RULE = '-'.repeat(103)

/** The label and shape columns an arm row prints before the arm's own name. */
const LEAD = 25

function pad(value: string | number, width: number): string {
  return String(value).padStart(width)
}

/** One arm's row. The label and shape columns print on the first arm only. */
function armRow(label: string, shape: string, arm: string, cell: Cell): string {
  const invalid = cell.invalid > 0 ? ` (${cell.invalid} invalid)` : ''
  const counted = cell.runs - cell.invalid
  return (
    `  ${label.padEnd(10)}${shape.padEnd(15)}${arm.padEnd(22)}` +
    `${pad(cell.tokens.toLocaleString(), 9)}${pad(cell.toolCalls, 7)}${pad(cell.steps, 7)}` +
    `${pad(cell.files, 7)}${pad(cell.sourceLines.toLocaleString(), 8)}${pad(cell.seconds, 6)}` +
    `${pad(`${cell.hits}/${counted}`, 6)}${pad(`${cell.symbolHits}/${counted}`, 6)}${invalid}`
  )
}

/**
 * The delta row beneath one arm, read against the reference arm. Negative is a
 * saving.
 *
 * Which arm the reference is stays out of this row and is stated once, under
 * the header: with several arms the label would not fit the column, and a delta
 * printed directly under the arm it belongs to needs no repeating.
 */
function deltaRow(reference: Cell, arm: Cell): string {
  return (
    `  ${''.padEnd(LEAD)}${'delta'.padEnd(22)}${pad(delta(reference.tokens, arm.tokens), 9)}` +
    `${pad(delta(reference.toolCalls, arm.toolCalls), 7)}${pad(delta(reference.steps, arm.steps), 7)}` +
    `${pad(delta(reference.files, arm.files), 7)}` +
    `${pad(delta(reference.sourceLines, arm.sourceLines), 8)}` +
    `${pad(delta(reference.seconds, arm.seconds), 6)}`
  )
}

/**
 * Prints one block: a row per arm that has runs here, each but the reference
 * followed by its delta.
 *
 * The reference is passed in rather than taken from this block's own arms, so
 * every block in the report reads against the same arm. A block the reference
 * did not run in prints no deltas, which is the honest answer.
 *
 * Returns the cells by arm id, because the pooled block also prints their cost.
 */
export function printArms(
  label: string,
  shape: string,
  records: RunRecord[],
  reference: Arm | undefined,
): Map<string, Cell> {
  const cells = new Map<string, Cell>()
  for (const arm of armsIn(records)) {
    cells.set(arm.id, summarise(records.filter((r) => r.arm.id === arm.id)))
  }
  const base = reference ? cells.get(reference.id) : undefined
  let first = true
  for (const [id, cell] of cells) {
    console.log(armRow(first ? label : '', first ? shape : '', id, cell))
    first = false
    if (base && id !== reference?.id) console.log(deltaRow(base, cell))
  }
  return cells
}

/** The title and column header, which fix the widths every row then follows. */
export function printHeader(reference: Arm | undefined): void {
  console.log('\ncodedocs fix benchmark — microsoft/vscode, medians per cell')
  console.log('  cases grouped by difficulty level; see bench/DIFFICULTY.md')
  console.log(
    `  an arm is a toolset and a model; deltas are against ${reference?.id ?? 'the first arm'}\n`,
  )
  console.log(
    `  ${'case'.padEnd(10)}${'shape'.padEnd(15)}${'arm'.padEnd(22)}${pad('tokens', 9)}` +
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
export function printTotals(
  records: RunRecord[],
  reference: Arm | undefined,
): void {
  // Pooling every valid run means a case with more replicates carries
  // proportionally more weight — which is what pooling should mean.
  console.log(`  ${RULE}`)
  const totals = printArms('ALL', 'every case', records, reference)
  const costs = [...totals].map(
    ([id, cell]) => `${id} $${cell.costUsd.toFixed(3)}`,
  )
  if (costs.length > 0) {
    console.log(`\n  median cost per run: ${costs.join(', ')}`)
  }
}
