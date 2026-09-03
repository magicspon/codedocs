/**
 * Writes `bench/RESULTS.md` from the records on disk.
 *
 *   node bench/writeup.ts            rewrite RESULTS.md
 *   node bench/writeup.ts --stdout   print it instead
 *
 * The write-up is the thing the benchmark exists to produce, and it is
 * generated rather than written so that it cannot drift from the runs. Every
 * number in it comes from `bench/results/`; the prose around them states what
 * the set does and does not support, computed from the same records.
 *
 * The two questions are reported in separate blocks. A like-for-like block
 * varies only the toolset. A cross-model block varies the model too, which is
 * where the "can a cheaper model with structural facts do the dearer one's
 * work" question lives. Pooling them would answer neither.
 */

import { writeFileSync } from 'node:fs'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { armsIn, readRecord } from './arms.ts'
import { has } from './argv.ts'
import { casesById, loadProspects } from './cases.ts'
import {
  type Comparison,
  comparisonsIn,
  questionOf,
  runsOf,
} from './comparisons.ts'
import { LEVELS } from './difficulty.ts'
import { heading, sections } from './markdown.ts'
import { BENCH, RESULTS } from './paths.ts'
import {
  colophon,
  type Coverage,
  howToRead,
  limits,
  provenance,
  question,
  standing,
} from './writeup-prose.ts'
import {
  headlineTable,
  judgeTable,
  levelHeading,
  levelsWithRuns,
  levelTable,
} from './writeup-tables.ts'
import { discardedTable, pooledBasis, takeUpTable } from './writeup-honesty.ts'
import type { RunRecord } from './types.ts'

/** Every run record on disk. */
function loadRecords(): RunRecord[] {
  return readdirSync(RESULTS)
    .filter((f) => f.endsWith('.json') && !f.endsWith('.stream.jsonl'))
    .map((f) => readRecord(readFileSync(join(RESULTS, f), 'utf8')))
}

/** What the set on disk covers, which the prose states before any table is read. */
function coverageOf(
  records: RunRecord[],
  cases: ReturnType<typeof casesById>,
): Coverage {
  const judged = records.filter((r) => r.judgement)
  const ran = new Set(records.map((r) => r.caseId))
  // Levels the *run* cases fall in, not the levels the running set defines: a
  // level whose case is promoted but not yet run supports nothing either.
  const levels = new Set(
    [...ran].flatMap((id) => {
      const level = cases.get(id)?.difficulty.level
      return level === undefined ? [] : [level]
    }),
  )
  return {
    runs: records.length,
    valid: records.filter((r) => r.invalid === null).length,
    cases: ran.size,
    casesDefined: cases.size,
    prospects: loadProspects().length,
    levels: levels.size,
    levelsDefined: LEVELS.length,
    replicates: records.reduce((most, r) => Math.max(most, r.replicate), 0),
    arms: armsIn(records),
    judgeModel: judged[0]?.judgement?.model ?? null,
    judged: judged.length,
  }
}

/** One comparison: the headline, then a table per difficulty level. */
function comparisonSection(
  comparison: Comparison,
  records: RunRecord[],
  cases: ReturnType<typeof casesById>,
): string {
  // Only the runs of the two arms being compared. A third arm's numbers in this
  // block would be read as part of a pairing it is not in.
  const mine = [
    ...runsOf(records, comparison.reference),
    ...runsOf(records, comparison.contender),
  ]
  const headline = pooledBasis(mine, comparison)
  const levels = levelsWithRuns(mine, cases).map((group) => {
    const here = mine.filter((r) => group.ids.includes(r.caseId))
    // Only a level holding more than one case prints a pooled row, so only
    // that one can pool the two arms over different sets of cases. A set inside
    // one level says the same thing twice, so the level defers to the headline.
    const basis = group.ids.length > 1 ? pooledBasis(here, comparison) : null
    return sections([
      heading(4, levelHeading(group.level, group.ids)),
      levelTable(group.level, group.ids, mine, comparison),
      basis === headline ? '' : (basis ?? ''),
    ])
  })
  return sections([
    heading(3, comparison.id),
    `_${questionOf(comparison.kind)}._`,
    headlineTable(mine, comparison),
    headline ?? '',
    ...levels,
  ])
}

/** Every comparison of one kind, under one heading. */
function kindSection(
  title: string,
  note: string,
  comparisons: Comparison[],
  records: RunRecord[],
  cases: ReturnType<typeof casesById>,
): string {
  if (comparisons.length === 0) return ''
  return sections([
    heading(2, title),
    note,
    ...comparisons.map((c) => comparisonSection(c, records, cases)),
  ])
}

/** The document. */
function build(records: RunRecord[]): string {
  const cases = casesById()
  const coverage = coverageOf(records, cases)
  const comparisons = comparisonsIn(records)
  const of = (kind: Comparison['kind']): Comparison[] =>
    comparisons.filter((c) => c.kind === kind)

  return `${sections([
    heading(1, 'codedocs fix benchmark — results'),
    '_Generated by `node bench/writeup.ts`. Do not edit by hand._',
    question(),
    provenance(coverage),
    standing(coverage),
    howToRead(),
    kindSection(
      'Like for like',
      `One model, holding the tool and not holding it. This is the claim codedocs
is sold on: the same reasoning capacity, asked the same question, with and
without a structural interface to the repository.`,
      of('like-for-like'),
      records,
      cases,
    ),
    kindSection(
      'A cheaper model holding the tool',
      `Two different models, one on each side. This block asks the second
question — whether structural facts let a cheaper model do work that otherwise
needs a dearer one — and its deltas carry both the toolset's effect and the
models' difference. That is why it is reported apart from the block above and
never averaged with it: pooled together, the two answer neither question.`,
      of('cross-model'),
      records,
      cases,
    ),
    heading(2, 'Tool take-up'),
    `How often each arm reached for codedocs at all. On the codedocs arm this is
take-up, and a rate below 1 is a result rather than a hole: the agent held the
tool and did not want it, which on a level 1 control is the _correct_ move. On
the baseline arm the same figure is contamination, and anything above 0 is a run
that was never the arm it claimed to be.`,
    `This table exists because the discard rule below has a bias in it that runs
towards codedocs — the runs it throws out are the ones where the agent judged
the tool unnecessary, so the runs that survive are the ones where it judged the
tool worth using. Reporting take-up does not remove that bias. It makes the
thing the discard was hiding into a measurement, and it is the figure to read
before any pooled delta.`,
    takeUpTable(records, cases) ||
      '_No run has recorded whether it called codedocs._',
    heading(2, 'Discarded runs'),
    `A run is thrown out, never silently counted, when the baseline reached for
codedocs anyway, when the codedocs arm never called it, or when the agent left
no patch at all. Each of those means the comparison would have stopped being
between the two things it claims to compare.`,
    discardedTable(records, cases) || '_No run has been discarded._',
    heading(2, 'The judge'),
    judgeTable(records) || '_No run has been judged._',
    limits(coverage),
    colophon(),
  ])}\n`
}

function main(): void {
  const records = loadRecords()
  if (records.length === 0) {
    console.error('no results yet — run `node bench/run.ts` first')
    process.exitCode = 1
    return
  }
  const document = build(records)
  if (has('stdout')) {
    console.log(document)
    return
  }
  const path = join(BENCH, 'RESULTS.md')
  writeFileSync(path, document, 'utf8')
  console.log(`wrote ${path} from ${records.length} run(s).`)
}

main()
