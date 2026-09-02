/**
 * Runs the agent over (case, arm, replicate) and files what it produced.
 *
 * The stream lands on disk before anything is derived from it, so a run that is
 * refused partway through still leaves its evidence behind.
 */

import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runAgent } from './agent.ts'
import { RESULTS } from './paths.ts'
import { buildPrompt } from './prompt.ts'
import { RateLimited, recordFrom, verdictLine } from './record.ts'
import { parseStream } from './stream.ts'
import type { ArmName, BenchCase, RunRecord } from './types.ts'

/** The path stem both a run's record and its raw stream are written under. */
function stemFor(caseId: string, arm: ArmName, replicate: number): string {
  return join(RESULTS, `${caseId}-${arm}-r${replicate}`)
}

/** Runs one (case, arm, replicate), writes its record and its raw stream. */
async function executeRun(
  bench: BenchCase,
  arm: ArmName,
  replicate: number,
  model: string,
): Promise<void> {
  const startedAt = new Date().toISOString()
  process.stdout.write(`  ${`${bench.id}/${arm}/r${replicate}`.padEnd(28)}`)

  const lines = await runAgent(buildPrompt(bench, arm), model)
  const stem = stemFor(bench.id, arm, replicate)
  // The stream lands first, so a refused run leaves the evidence behind.
  writeFileSync(`${stem}.stream.jsonl`, `${lines.join('\n')}\n`, 'utf8')

  let record: RunRecord
  try {
    record = recordFrom(lines, bench, arm, replicate, model, startedAt)
  } catch (error) {
    // A refused run measured nothing. Drop any record a previous attempt left
    // behind, so the report counts a missing run rather than a failed search.
    rmSync(`${stem}.json`, { force: true })
    throw error
  }
  writeFileSync(
    `${stem}.json`,
    `${JSON.stringify(record, null, '\t')}\n`,
    'utf8',
  )
  console.log(verdictLine(record))
}

/**
 * True when a run already produced a measurement, so `--resume` can leave it alone.
 *
 * The saved stream decides this, not the saved record. A run refused partway
 * through still banks the tokens it spent before the refusal, so a token count
 * cannot tell a finished search from a truncated one — only the rejection event
 * can, and it is in the stream.
 */
function alreadyMeasured(
  bench: BenchCase,
  arm: ArmName,
  replicate: number,
): boolean {
  try {
    const path = `${stemFor(bench.id, arm, replicate)}.stream.jsonl`
    const lines = readFileSync(path, 'utf8')
      .split('\n')
      .filter((l) => l.trim())
    const { metrics, rateLimitedUntil } = parseStream(lines)
    return rateLimitedUntil === null && metrics.tokensTotal > 0
  } catch {
    return false
  }
}

/** What one session covers. */
export type SessionPlan = {
  cases: BenchCase[]
  arms: ArmName[]
  replicates: number
  model: string
  /** Skip any run that already produced a measurement. */
  resume: boolean
}

/**
 * Runs one cell of the plan, and says whether the session may continue.
 *
 * Returns false only when the API refused the run. Every other failure throws,
 * because a bug in the harness must stop the session loudly rather than be
 * mistaken for a quota that will come back.
 */
async function runOne(
  bench: BenchCase,
  arm: ArmName,
  replicate: number,
  plan: SessionPlan,
): Promise<boolean> {
  if (plan.resume && alreadyMeasured(bench, arm, replicate)) {
    console.log(
      `  ${`${bench.id}/${arm}/r${replicate}`.padEnd(28)}already measured, skipped`,
    )
    return true
  }
  try {
    await executeRun(bench, arm, replicate, plan.model)
    return true
  } catch (error) {
    if (!(error instanceof RateLimited)) throw error
    console.error(`\n${error.message}`)
    console.error(
      'stopping. Re-run with --resume once the quota is back to finish the rest.',
    )
    return false
  }
}

/**
 * Runs the whole plan, replicate by replicate.
 *
 * Returns false when the API refused a run: every later run would be refused
 * too, and each would file a zero that reads as a failed search, so the session
 * stops while the results are honest.
 */
export async function runSession(plan: SessionPlan): Promise<boolean> {
  const { cases, arms, replicates } = plan
  for (let replicate = 1; replicate <= replicates; replicate += 1) {
    for (const bench of cases) {
      // The arm order alternates so that any drift over the session — rate
      // limits, machine load — lands on both arms rather than on one.
      const order = replicate % 2 === 0 ? [...arms].reverse() : arms
      for (const arm of order) {
        const carryOn = await runOne(bench, arm, replicate, plan)
        if (!carryOn) return false
      }
    }
  }
  return true
}
