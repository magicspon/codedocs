/**
 * Re-derives every saved record from the stream and patch beside it, without
 * spending any quota.
 *
 * Scoring and validity are pure functions of those two files, so a fix to
 * either can be applied to runs already on disk rather than paying for them
 * twice.
 */

import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { readRecord } from './arms.ts'
import { cachedJudgement } from './judgement.ts'
import { RESULTS } from './paths.ts'
import { recordFrom, verdictLine } from './record.ts'
import type { Arm, BenchCase, RunRecord, Toolset } from './types.ts'

/**
 * The (case, arm, replicate) a saved stream belongs to.
 *
 * The model half of the arm is optional because runs made before an arm carried
 * one are named by their toolset alone, and rescoring must still reach them.
 */
const STREAM_FILE =
  /^(.+?)-(baseline|codedocs)(?:@(.+))?-r(\d+)\.stream\.jsonl$/

/** What the original run recorded about itself, which rescoring must not invent. */
type Provenance = {
  startedAt: string
  arm: Arm
  /** The model that judged this run, where one did. Needed to find its judgement again. */
  judgeModel: string | null
}

/**
 * Keeps whatever the original record said about when and as what it ran; only
 * the derived fields are recomputed. The stream and the patch are the source of
 * truth for everything else, so an unreadable record is not an error — but the
 * model is only in the record, so a run whose record has gone is left alone
 * rather than rescored as some other arm.
 */
function provenanceOf(stem: string): Provenance | null {
  try {
    const prior = readRecord(readFileSync(`${stem}.json`, 'utf8'))
    return {
      startedAt: prior.startedAt,
      arm: prior.arm,
      judgeModel: prior.judgement?.model ?? null,
    }
  } catch {
    return null
  }
}

/**
 * The judgement this run already has, looked up again rather than copied over.
 *
 * Looking it up is what makes rescoring honest: the key covers the patch and the
 * rubric, so a judgement made against a patch that has since changed, or under a
 * rubric that has since been revised, is not found and the run reads as
 * unjudged until `--judge` grades it again. Copying the old grades across would
 * have carried a stale verdict into the table for nothing.
 */
function judgementFor(
  bench: BenchCase,
  patch: string,
  judgeModel: string | null,
): ReturnType<typeof cachedJudgement> {
  return judgeModel === null ? null : cachedJudgement(bench, patch, judgeModel)
}

/**
 * The patch a run left, as it was saved.
 *
 * A missing file scores as a run that patched nothing, which is what a run from
 * before the fix task was one really did.
 */
function patchOf(stem: string): string {
  try {
    return readFileSync(`${stem}.diff`, 'utf8')
  } catch {
    return ''
  }
}

/** Rewrites the record beside every saved stream whose case is still on disk. */
export function rescore(cases: BenchCase[]): void {
  const byId = new Map(cases.map((c) => [c.id, c]))
  let rewritten = 0
  let skipped = 0
  for (const file of readdirSync(RESULTS).sort()) {
    const match = STREAM_FILE.exec(file)
    if (!match) continue
    const [, caseId, toolset, , replicate] = match as unknown as [
      string,
      string,
      Toolset,
      string | undefined,
      string,
    ]
    const bench = byId.get(caseId)
    if (!bench) continue
    const stem = join(RESULTS, file.replace(/\.stream\.jsonl$/, ''))
    // The model is only ever in the record. Without one there is no arm to
    // rescore as, and inventing one would file the run under an arm that was
    // never run, so the stream is left exactly as it is.
    const provenance = provenanceOf(stem)
    if (!provenance) {
      const cell = `${caseId}/${toolset}/r${replicate}`
      console.log(`  ${cell.padEnd(34)}no record beside the stream, skipped`)
      skipped += 1
      continue
    }
    const arm = provenance.arm
    const lines = readFileSync(`${stem}.stream.jsonl`, 'utf8')
      .split('\n')
      .filter((l) => l.trim())
    const patch = patchOf(stem)
    process.stdout.write(`  ${`${caseId}/${arm.id}/r${replicate}`.padEnd(34)}`)
    let record: RunRecord
    try {
      record = recordFrom({
        lines,
        patch,
        bench,
        arm,
        replicate: Number(replicate),
        startedAt: provenance.startedAt,
        judgement: judgementFor(bench, patch, provenance.judgeModel),
      })
    } catch (error) {
      // A refused run has no measurement in it to rescore. Drop the record so
      // the report counts a missing run rather than a failed search, and leave
      // the stream in place as the evidence of what happened.
      rmSync(`${stem}.json`, { force: true })
      console.log(`REFUSED (${(error as Error).message})`)
      skipped += 1
      continue
    }
    writeFileSync(
      `${stem}.json`,
      `${JSON.stringify(record, null, '\t')}\n`,
      'utf8',
    )
    console.log(verdictLine(record))
    rewritten += 1
  }
  console.log(`\nrescored ${rewritten} run(s), skipped ${skipped} refused.`)
}
