/**
 * The tables the write-up is made of.
 *
 * Every one of them is derived from the records on disk, so the document can
 * only ever say what was measured. There is no path here for a number that was
 * not run, which is the point: a write-up that prints only its favourable
 * blocks is a brochure, and the way to not write one is to have no way to.
 */

import { type Comparison, runsOf } from './comparisons.ts'
import { levelName, LEVELS, levelOf } from './difficulty.ts'
import {
  byLeadingColumns,
  change,
  num,
  ratio,
  type Row,
  table,
  usd,
} from './markdown.ts'
import { type Cell, counted, summarise } from './summarise.ts'
import type { BenchCase, RunRecord } from './types.ts'

/** One number the two arms are compared on, and how it reads. */
type Metric = {
  /** The column header in the per-case table. */
  short: string
  /** The row label in the headline table. */
  label: string
  of: (cell: Cell) => number
  show: (value: number) => string
}

/**
 * Every cost the benchmark measures, in the order the issue asks for them.
 *
 * Declared once so the wide table and the headline table cannot drift: a column
 * that appears in one and not the other is a document that contradicts itself.
 */
const METRICS: Metric[] = [
  { short: 'req', label: 'requests', of: (c) => c.requests, show: num },
  {
    short: 'in',
    label: 'input tokens, cache included',
    of: (c) => c.tokensInput,
    show: num,
  },
  {
    short: 'out',
    label: 'output tokens',
    of: (c) => c.tokensOutput,
    show: num,
  },
  { short: 'tokens', label: 'total tokens', of: (c) => c.tokens, show: num },
  { short: 'cost', label: 'cost per run', of: (c) => c.costUsd, show: usd },
  { short: 'calls', label: 'tool calls', of: (c) => c.toolCalls, show: num },
  { short: 'files', label: 'files opened', of: (c) => c.files, show: num },
  {
    short: 'lines',
    label: 'lines of source read',
    of: (c) => c.sourceLines,
    show: num,
  },
  { short: 'sec', label: 'seconds', of: (c) => c.seconds, show: num },
]

/** The correctness columns, which are ratios and grades rather than costs. */
function correctnessOf(cell: Cell): string[] {
  return [
    ratio(cell.hits, counted(cell)),
    ratio(cell.fixes, cell.judged),
    cell.similarity ?? '—',
  ]
}

/** The header of the per-case table, cost columns then correctness. */
const WIDE_HEADERS = [
  'case',
  'arm',
  ...METRICS.map((metric) => metric.short),
  'hit',
  'fix',
  'sim',
]

/** One arm's row in the per-case table. */
function armRow(label: string, arm: string, cell: Cell): Row {
  // Every run discarded leaves zeros, and zeros are not measurements: printed
  // as numbers they read as a run that cost nothing.
  const note = cell.invalid > 0 ? ` _(${cell.invalid} discarded)_` : ''
  if (counted(cell) === 0) {
    return [
      label,
      `${arm}${note}`,
      ...METRICS.map(() => '—'),
      ...correctnessOf(cell),
    ]
  }
  return [
    label,
    `${arm}${note}`,
    ...METRICS.map((metric) => metric.show(metric.of(cell))),
    ...correctnessOf(cell),
  ]
}

/**
 * The change between the two arms, on the cost columns only.
 *
 * Correctness is left blank rather than turned into a percentage: `1/1` against
 * `1/1` is not a 0% change in anything, and a hit rate over three replicates is
 * not a quantity a percentage describes honestly.
 */
function changeRow(reference: Cell, contender: Cell): Row {
  // A change needs measurements on both sides. Against a cell whose runs were
  // all discarded every column would read -100%, which says the arm spent
  // nothing rather than that it produced nothing to compare.
  const comparable = counted(reference) > 0 && counted(contender) > 0
  return [
    '',
    '**change**',
    ...METRICS.map((metric) =>
      comparable ? change(metric.of(reference), metric.of(contender)) : '—',
    ),
    '',
    '',
    '',
  ]
}

/** The three rows one set of runs becomes: each arm, and the change between them. */
function block(
  label: string,
  records: RunRecord[],
  comparison: Comparison,
): Row[] {
  const reference = summarise(runsOf(records, comparison.reference))
  const contender = summarise(runsOf(records, comparison.contender))
  // A block neither arm ran in is left out rather than printed as a row of
  // zeros, which would read as a run that cost nothing.
  if (reference.runs === 0 && contender.runs === 0) return []
  return [
    armRow(label, comparison.reference.id, reference),
    armRow('', comparison.contender.id, contender),
    changeRow(reference, contender),
  ]
}

/** The cases that have runs, bucketed by level, lowest first. */
export function levelsWithRuns(
  records: RunRecord[],
  cases: Map<string, BenchCase>,
): { level: number | null; ids: string[] }[] {
  const ids = [...new Set(records.map((r) => r.caseId))].sort()
  const groups = LEVELS.map(({ level }) => ({
    level: level as number | null,
    ids: ids.filter((id) => levelOf(cases.get(id)) === level),
  })).filter((group) => group.ids.length > 0)
  const loose = ids.filter((id) => levelOf(cases.get(id)) === null)
  return loose.length > 0 ? [...groups, { level: null, ids: loose }] : groups
}

/** One level's table: a block per case, then the level's own aggregate. */
export function levelTable(
  level: number | null,
  ids: string[],
  records: RunRecord[],
  comparison: Comparison,
): string {
  const rows = ids.flatMap((id) =>
    block(
      id,
      records.filter((r) => r.caseId === id),
      comparison,
    ),
  )
  const label = level === null ? 'L?' : `L${level}`
  // A level holding one case aggregates to that case, and printing the same
  // three rows twice invites the reader to look for a difference there is none.
  const pooled =
    ids.length > 1
      ? block(
          `**${label}**`,
          records.filter((r) => ids.includes(r.caseId)),
          comparison,
        )
      : []
  return table(WIDE_HEADERS, [...rows, ...pooled])
}

/** The heading above one level's table. */
export function levelHeading(level: number | null, ids: string[]): string {
  const cases = `${ids.length} case${ids.length === 1 ? '' : 's'}`
  return level === null
    ? `Unclassified — no case file on disk (${cases})`
    : `Level ${level} — ${levelName(level as 1 | 2 | 3 | 4)} (${cases})`
}

/**
 * The headline: every metric over every case, the two arms side by side.
 *
 * Pooled across the whole set, which means a case with more replicates weighs
 * proportionally more — which is what pooling should mean.
 */
export function headlineTable(
  records: RunRecord[],
  comparison: Comparison,
): string {
  const reference = summarise(runsOf(records, comparison.reference))
  const contender = summarise(runsOf(records, comparison.contender))
  if (reference.runs === 0 || contender.runs === 0) return ''
  // Same rule as the per-case rows: no measurement on one side, no change.
  const comparable = counted(reference) > 0 && counted(contender) > 0
  const show = (metric: Metric, cell: Cell): string =>
    counted(cell) === 0 ? '—' : metric.show(metric.of(cell))
  const costs = METRICS.map((metric) => [
    metric.label,
    show(metric, reference),
    show(metric, contender),
    comparable ? change(metric.of(reference), metric.of(contender)) : '—',
  ])
  const [refHit, refFix, refSim] = correctnessOf(reference)
  const [armHit, armFix, armSim] = correctnessOf(contender)
  return table(
    ['', comparison.reference.id, comparison.contender.id, 'change'],
    [
      ...costs,
      ['changed every ground-truth file', refHit ?? '—', armHit ?? '—', ''],
      ['judged to fix the bug', refFix ?? '—', armFix ?? '—', ''],
      ['closeness to the upstream fix', refSim ?? '—', armSim ?? '—', ''],
    ],
  )
}

/** What the judge cost, and how much it agreed with itself. */
export function judgeTable(records: RunRecord[]): string {
  const rows: Row[] = []
  for (const arm of new Set(records.map((r) => r.arm.id))) {
    const cell = summarise(records.filter((r) => r.arm.id === arm))
    if (cell.judged === 0) continue
    rows.push([
      arm,
      String(cell.judged),
      cell.agreement.toFixed(2),
      usd(cell.judgeCostUsd),
    ])
  }
  return table(
    ['arm', 'runs judged', 'median agreement', 'judging cost'],
    rows.sort(byLeadingColumns),
  )
}
