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
import { RESULTS } from './paths.ts'
import { recordFrom, verdictLine } from './record.ts'
import type { ArmName, BenchCase, RunRecord } from './types.ts'

/** The (case, arm, replicate) a saved stream belongs to. */
const STREAM_FILE = /^(.+)-(baseline|codedocs)-r(\d+)\.stream\.jsonl$/

/** What the original run recorded about itself, which rescoring must not invent. */
type Provenance = { startedAt: string; model: string }

/**
 * Keeps whatever the original record said about when and on what it ran; only
 * the derived fields are recomputed. The stream and the patch are the source of
 * truth for everything else, so an unreadable record is not an error.
 */
function provenanceOf(stem: string): Provenance {
  try {
    const prior = JSON.parse(readFileSync(`${stem}.json`, 'utf8')) as RunRecord
    return { startedAt: prior.startedAt, model: prior.model }
  } catch {
    return { startedAt: new Date(0).toISOString(), model: 'unknown' }
  }
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
    const [, caseId, arm, replicate] = match as unknown as [
      string,
      string,
      ArmName,
      string,
    ]
    const bench = byId.get(caseId)
    if (!bench) continue
    const stem = join(RESULTS, `${caseId}-${arm}-r${replicate}`)
    const lines = readFileSync(`${stem}.stream.jsonl`, 'utf8')
      .split('\n')
      .filter((l) => l.trim())
    const patch = patchOf(stem)
    const { startedAt, model } = provenanceOf(stem)
    process.stdout.write(`  ${`${caseId}/${arm}/r${replicate}`.padEnd(28)}`)
    let record: RunRecord
    try {
      record = recordFrom({
        lines,
        patch,
        bench,
        arm,
        replicate: Number(replicate),
        model,
        startedAt,
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
