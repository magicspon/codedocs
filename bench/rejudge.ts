/**
 * Fills in the judgements the runs on disk are missing.
 *
 * A run and its judgement are bought separately: the run's stream and patch are
 * the expensive part and they are already banked, so a judge that failed, a
 * session that ran with `--no-judge`, or a set measured before there was a
 * judge at all can each be brought up to date for the price of the judging
 * alone. Readings already cached are reused, so this is safe to re-run.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { readRecord } from './arms.ts'
import { JudgeFailed } from './judge.ts'
import { judgeRun, type JudgePlan } from './judgement.ts'
import { RESULTS } from './paths.ts'
import type { BenchCase, RunRecord } from './types.ts'

/** A saved record, and the stem its stream and patch sit under. */
type Saved = { stem: string; record: RunRecord }

/** Every record on disk that still parses, with its stem. */
function savedRecords(): Saved[] {
  const saved: Saved[] = []
  for (const file of readdirSync(RESULTS).sort()) {
    if (!file.endsWith('.json') || file.endsWith('.stream.jsonl')) continue
    const stem = join(RESULTS, file.replace(/\.json$/, ''))
    try {
      saved.push({
        stem,
        record: readRecord(readFileSync(`${stem}.json`, 'utf8')),
      })
    } catch {
      continue
    }
  }
  return saved
}

/**
 * Why a run is left alone, or null when it should be judged.
 *
 * A run already judged under the same plan is skipped by `judgeRun` itself,
 * which reuses its cached readings; what is refused here is a run there is
 * nothing to judge, or nothing worth judging.
 */
function skipReason(
  record: RunRecord,
  bench: BenchCase | undefined,
): string | null {
  // Either the case file has gone, or `--cases` narrowed this run out. Both
  // mean there is no ground truth here to judge against.
  if (!bench) return 'its case is not among the ones selected'
  if (record.invalid !== null) return `invalid (${record.invalid})`
  if (record.diff === null) return 'no patch'
  return null
}

/** The line printed for one run, whichever way it went. */
function cell(record: RunRecord): string {
  return `${record.caseId}/${record.arm.id}/r${record.replicate}`.padEnd(34)
}

/** Judges one saved run and rewrites its record. Returns false when the judge failed. */
async function judgeSaved(
  saved: Saved,
  bench: BenchCase,
  plan: JudgePlan,
): Promise<boolean> {
  const patch = readFileSync(`${saved.stem}.diff`, 'utf8')
  try {
    const judgement = await judgeRun(bench, patch, plan)
    const record: RunRecord = { ...saved.record, judgement }
    writeFileSync(
      `${saved.stem}.json`,
      `${JSON.stringify(record, null, '\t')}\n`,
      'utf8',
    )
    const spread = `${judgement.agreement.correctness.toFixed(2)}/${judgement.agreement.similarity.toFixed(2)}`
    console.log(
      `${judgement.correctness}  ${judgement.similarity}  agreement ${spread}  $${judgement.costUsd.toFixed(3)}`,
    )
    return true
  } catch (error) {
    if (!(error instanceof JudgeFailed)) throw error
    console.log(`FAILED (${error.message})`)
    return false
  }
}

/** Judges every valid, patched run on disk that the plan has not already covered. */
export async function rejudge(
  cases: BenchCase[],
  plan: JudgePlan,
): Promise<void> {
  const byId = new Map(cases.map((c) => [c.id, c]))
  let judged = 0
  let skipped = 0
  let failed = 0
  for (const saved of savedRecords()) {
    const bench = byId.get(saved.record.caseId)
    const skip = skipReason(saved.record, bench)
    if (skip || !bench) {
      console.log(`  ${cell(saved.record)}skipped, ${skip}`)
      skipped += 1
      continue
    }
    process.stdout.write(`  ${cell(saved.record)}`)
    if (await judgeSaved(saved, bench, plan)) judged += 1
    else failed += 1
  }
  console.log(
    `\njudged ${judged} run(s), skipped ${skipped}, ${failed} failed.`,
  )
}
