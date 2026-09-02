/**
 * Reads `bench/results/` and prints the arm comparison, grouped by difficulty.
 *
 *   node bench/report.ts            the table
 *   node bench/report.ts --json     the same numbers, machine readable
 *
 * The grouping is the point of the table. The claim under test is that the
 * benefit grows with structural complexity, and a delta pooled over every case
 * cannot show that: it averages the case where the file was handed over with
 * the case where the cause was three components away.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { casesById } from './cases.ts'
import { levelName, LEVELS, levelOf } from './difficulty.ts'
import { RESULTS } from './paths.ts'
import { summarise } from './summarise.ts'
import {
  ARMS,
  printArms,
  printHeader,
  printLevelHeading,
  printTotals,
} from './table.ts'
import type { BenchCase, DifficultyLevel, RunRecord } from './types.ts'

/** Every run record on disk. */
function loadRecords(): RunRecord[] {
  return readdirSync(RESULTS)
    .filter((f) => f.endsWith('.json') && !f.endsWith('.stream.jsonl'))
    .map((f) => JSON.parse(readFileSync(join(RESULTS, f), 'utf8')) as RunRecord)
}

/** One level's cases, in id order. `level` is null for records with no case file. */
type Group = {
  level: DifficultyLevel | null
  ids: string[]
}

/**
 * Buckets the cases that have results into levels, lowest first.
 *
 * A level with no results is left out rather than printed empty, and a record
 * whose case file has gone still has numbers in it, so it is grouped as
 * unclassified rather than dropped.
 */
function groupByLevel(ids: string[], cases: Map<string, BenchCase>): Group[] {
  const groups: Group[] = []
  for (const { level } of LEVELS) {
    const inLevel = ids.filter((id) => levelOf(cases.get(id)) === level)
    if (inLevel.length > 0) groups.push({ level, ids: inLevel })
  }
  const unclassified = ids.filter((id) => levelOf(cases.get(id)) === null)
  if (unclassified.length > 0) groups.push({ level: null, ids: unclassified })
  return groups
}

/** The heading above a group: the level and the exploration it demands. */
function headingFor(group: Group): string {
  const cases = `${group.ids.length} case${group.ids.length === 1 ? '' : 's'}`
  return group.level === null
    ? `unclassified · no case file on disk  (${cases})`
    : `level ${group.level} · ${levelName(group.level)}  (${cases})`
}

/** One level: a block per case, then the level's own aggregate. */
function printLevel(
  group: Group,
  records: RunRecord[],
  cases: Map<string, BenchCase>,
): void {
  printLevelHeading(headingFor(group))
  for (const id of group.ids) {
    printArms(
      id,
      cases.get(id)?.shape ?? '?',
      records.filter((r) => r.caseId === id),
    )
    console.log('')
  }
  const label = group.level === null ? 'L?' : `L${group.level}`
  printArms(
    label,
    'all cases',
    records.filter((r) => group.ids.includes(r.caseId)),
  )
  console.log('')
}

/** The `--json` rendering: the same medians, per case and per level. */
function printJson(
  groups: Group[],
  records: RunRecord[],
  cases: Map<string, BenchCase>,
): void {
  const arms = (of: RunRecord[]): Record<string, unknown> =>
    Object.fromEntries(
      ARMS.map((arm) => [arm, summarise(of.filter((r) => r.arm === arm))]),
    )
  console.log(
    JSON.stringify(
      {
        cases: groups.flatMap((group) =>
          group.ids.map((id) => ({
            case: id,
            shape: cases.get(id)?.shape ?? null,
            level: group.level,
            arms: arms(records.filter((r) => r.caseId === id)),
          })),
        ),
        levels: groups.map((group) => ({
          level: group.level,
          cases: group.ids,
          arms: arms(records.filter((r) => group.ids.includes(r.caseId))),
        })),
      },
      null,
      '\t',
    ),
  )
}

function main(): void {
  const records = loadRecords()
  if (records.length === 0) {
    console.log('no results yet — run `node bench/run.ts` first')
    return
  }
  const cases = casesById()
  const ids = [...new Set(records.map((r) => r.caseId))].sort()
  const groups = groupByLevel(ids, cases)

  if (process.argv.includes('--json')) {
    printJson(groups, records, cases)
    return
  }

  printHeader()
  for (const group of groups) printLevel(group, records, cases)
  printTotals(records)
  console.log('')
}

main()
