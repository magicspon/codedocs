/**
 * Runs the agent over (case, arm, replicate) and files what it produced.
 *
 * Each run happens in its own worktree at the case's base commit, so the tree
 * under test is the one the bug was reported against and nothing a run does to
 * it reaches the next. The patch is taken out of that worktree before it is
 * discarded, and both it and the stream land on disk before anything is derived
 * from them, so a run that is refused partway through still leaves its evidence
 * behind.
 */

import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runAgent } from './agent.ts'
import { captureDiff } from './diff.ts'
import { RESULTS } from './paths.ts'
import { buildPrompt } from './prompt.ts'
import { RateLimited, recordFrom, verdictLine } from './record.ts'
import { parseStream } from './stream.ts'
import type { ArmName, BenchCase, RunRecord } from './types.ts'
import { warmIndex } from './warm.ts'
import { createWorktree } from './worktree.ts'

/** The path stem both a run's record and its raw stream are written under. */
function stemFor(caseId: string, arm: ArmName, replicate: number): string {
  return join(RESULTS, `${caseId}-${arm}-r${replicate}`)
}

/** What one run produced, and what it cost to make the tree it read. */
type Outcome = {
  lines: string[]
  /** The patch the run left in its worktree, as unified diff text. */
  patch: string
  indexSeconds: number
}

/**
 * Runs the agent once, in a worktree of its own, and returns its stream and its
 * patch.
 *
 * The worktree goes whatever happened inside it: the next run has to start from
 * the commit rather than from this run's leftovers. Which is why the patch is
 * read out first — it is the only thing the run is scored on.
 */
async function runInWorktree(
  bench: BenchCase,
  arm: ArmName,
  replicate: number,
  model: string,
): Promise<Outcome> {
  const worktree = createWorktree(
    `${bench.id}-${arm}-r${replicate}`,
    bench.base.commit,
  )
  try {
    // Only the arm that is told about the index pays for one being there.
    const indexSeconds = arm === 'codedocs' ? warmIndex(worktree.root) : 0
    const prompt = buildPrompt(bench, arm, worktree.root)
    const lines = await runAgent(prompt, model, worktree.root)
    return {
      lines,
      patch: captureDiff(worktree.root, bench.base.commit),
      indexSeconds,
    }
  } finally {
    worktree.remove()
  }
}

/** Writes one run's record, its raw stream and its patch, and prints its verdict. */
function fileRun(
  outcome: Outcome,
  bench: BenchCase,
  arm: ArmName,
  replicate: number,
  model: string,
  startedAt: string,
): void {
  const stem = stemFor(bench.id, arm, replicate)
  // The evidence lands first, so a refused run leaves it behind: the stream of
  // what the agent did, and the patch it is scored on, both auditable by hand.
  writeFileSync(`${stem}.stream.jsonl`, `${outcome.lines.join('\n')}\n`, 'utf8')
  writeFileSync(`${stem}.diff`, outcome.patch, 'utf8')

  let record: RunRecord
  try {
    record = recordFrom({
      lines: outcome.lines,
      patch: outcome.patch,
      bench,
      arm,
      replicate,
      model,
      startedAt,
    })
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
  // The index build is printed beside the verdict, not folded into it: it is
  // the harness's cost, and no part of what the run is measured on.
  const index = outcome.indexSeconds ? `  (index ${outcome.indexSeconds}s)` : ''
  console.log(`${verdictLine(record)}${index}`)
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
  const outcome = await runInWorktree(bench, arm, replicate, model)
  fileRun(outcome, bench, arm, replicate, model, startedAt)
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
