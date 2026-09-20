/**
 * The tables that keep the comparison honest about itself.
 *
 * A codedocs run that never called codedocs is thrown out, because counting a
 * run with no tool in it as evidence about the tool measures nothing. That rule
 * is right and it has a bias in it, and the bias runs towards codedocs: on an
 * easy case the correct move is *not* to reach for the tool, so the runs
 * discarded are the ones where the agent judged it unnecessary, and the
 * surviving codedocs runs are the ones where it judged it worth using.
 *
 * The decision taken against that (issue #112) is to report it rather than to
 * repair it, in two parts:
 *
 *   take-up   how often each arm reached for codedocs at all, per level. This
 *             turns the discard from missing data into a measurement, and
 *             answers a question the benchmark otherwise cannot: when does an
 *             agent reach for structural facts?
 *   basis     every pooled figure says which cases each side of it rests on,
 *             wherever those two sets differ. A pooled row over two baseline
 *             cases against one codedocs case is not a like-for-like delta, and
 *             the number must not be readable as though it were.
 *
 * Both are additive: no run is dropped, no figure is re-weighted, and the
 * discard counts stay where they were.
 */

import { armsIn } from '../core/arms.ts'
import type { Comparison } from '../reporting/comparisons.ts'
import { levelOf, LEVELS } from '../cases/difficulty.ts'
import {
  byLeadingColumns,
  ratio,
  type Row,
  table,
} from '../reporting/markdown.ts'
import { summarise } from '../reporting/summarise.ts'
import type { BenchCase, RunRecord } from '../core/types.ts'

/** The label a level is printed under, or `L?` for a case with no file on disk. */
function levelLabel(level: number | null): string {
  return level === null ? 'L?' : `L${level}`
}

/** The level each record belongs to, resolved once. */
function levelIn(
  record: RunRecord,
  cases: Map<string, BenchCase>,
): number | null {
  return levelOf(cases.get(record.caseId))
}

/**
 * How often each arm reached for codedocs, per level and pooled.
 *
 * Both arms appear. On the codedocs arm the figure is take-up, and a rate below
 * 1 is the finding — the agent had the tool and did not want it. On the
 * baseline arm the same figure is contamination, and anything above 0 means a
 * run that was never the arm it claimed to be. One table, because they are the
 * same measurement read from opposite sides.
 */
export function takeUpTable(
  records: RunRecord[],
  cases: Map<string, BenchCase>,
): string {
  const known = records.filter((r) => r.usedCodedocs !== undefined)
  if (known.length === 0) return ''
  const levels: (number | null)[] = [
    ...LEVELS.map(({ level }) => level as number | null),
    null,
  ]
  const rows: Row[] = []
  const row = (arm: string, label: string, of: RunRecord[]): Row => {
    const cell = summarise(of)
    return [
      arm,
      label,
      String(cell.takeUpKnown),
      ratio(cell.tookUp, cell.takeUpKnown),
    ]
  }
  // Report order — baselines first, then by model — rather than the order the
  // result files happened to be read in, so the document is stable.
  for (const { id: arm } of armsIn(known)) {
    const mine = known.filter((r) => r.arm.id === arm)
    const spanned = levels.filter((level) =>
      mine.some((r) => levelIn(r, cases) === level),
    )
    for (const level of spanned) {
      rows.push(
        row(
          arm,
          levelLabel(level),
          mine.filter((r) => levelIn(r, cases) === level),
        ),
      )
    }
    // An arm inside one level aggregates to that level, and the same figure
    // printed twice invites the reader to look for a difference there is none.
    if (spanned.length > 1) rows.push(row(arm, '**all**', mine))
  }
  return table(['arm', 'level', 'runs', 'called codedocs'], rows)
}

/**
 * Runs that were thrown out, and why.
 *
 * Broken down by arm, by level and by reason. The total alone hides both
 * differences that matter: an arm that left no patch failed at the task while
 * an arm that reached for the wrong toolset was never the arm it claimed to be,
 * and a discard on a level 1 control says something a discard on a level 4 case
 * does not.
 */
export function discardedTable(
  records: RunRecord[],
  cases: Map<string, BenchCase>,
): string {
  const rows: Row[] = []
  for (const arm of new Set(records.map((r) => r.arm.id))) {
    const mine = records.filter((r) => r.arm.id === arm)
    for (const level of new Set(mine.map((r) => levelIn(r, cases)))) {
      const here = mine.filter((r) => levelIn(r, cases) === level)
      const cell = summarise(here)
      for (const [reason, count] of Object.entries(cell.invalidReasons)) {
        rows.push([
          arm,
          levelLabel(level),
          reason,
          String(count),
          String(cell.runs),
        ])
      }
    }
  }
  return table(
    ['arm', 'level', 'reason', 'runs', 'out of'],
    rows.sort(byLeadingColumns),
  )
}

/** The cases an arm has runs the report is allowed to measure. */
function countedCases(records: RunRecord[], armId: string): string[] {
  return [
    ...new Set(
      records
        .filter((r) => r.arm.id === armId && r.invalid === null)
        .map((r) => r.caseId),
    ),
  ].sort()
}

/** A list of case ids as prose: `329610 and 333230`. */
function listed(ids: string[]): string {
  if (ids.length === 0) return 'no case'
  if (ids.length === 1) return `\`${ids[0]}\` alone`
  const all = ids.map((id) => `\`${id}\``)
  return `${all.slice(0, -1).join(', ')} and ${all[all.length - 1]}`
}

/**
 * What a pooled figure rests on, stated whenever the two arms do not rest on
 * the same cases.
 *
 * A pooled row is a median over whatever survived, and when one arm's runs on a
 * case were all discarded that case leaves its side of the row and stays on the
 * other. The delta beside it is then a comparison between different sets of
 * cases, which is not the comparison the column claims to make. It is not
 * suppressed — deleting the row would hide the very discard this is about — so
 * it is labelled instead, immediately under the number.
 *
 * Returns null when both arms pooled over the same cases, which is the case
 * that needs no note.
 */
export function pooledBasis(
  records: RunRecord[],
  comparison: Comparison,
): string | null {
  const reference = countedCases(records, comparison.reference.id)
  const contender = countedCases(records, comparison.contender.id)
  if (reference.join() === contender.join()) return null
  const both = [...new Set([...reference, ...contender])]
  // Nothing measured on one side is a missing block, not a mismatched one: the
  // tables already print dashes rather than a delta, so a note would repeat it.
  if (reference.length === 0 || contender.length === 0) return null
  return (
    `_**Not like for like.** Pooled over ${both.length} case${both.length === 1 ? '' : 's'}, ` +
    `\`${comparison.reference.id}\` counts ${listed(reference)} and ` +
    `\`${comparison.contender.id}\` counts ${listed(contender)}. The change column ` +
    `above compares different sets of cases; see [Tool take-up](#tool-take-up) for why._`
  )
}
