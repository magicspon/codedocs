/**
 * Runs the fix benchmark: one agent, two arms, N replicates per case.
 *
 *   node bench/run.ts                      every case, 3 replicates
 *   node bench/run.ts --cases 333230       one case
 *   node bench/run.ts --replicates 1       a smoke run
 *   node bench/run.ts --arms baseline      one arm
 *   node bench/run.ts --resume             skip runs already measured
 *   node bench/run.ts --rescore            rebuild records from saved streams
 *
 * Each run is a fresh `claude -p` process with no memory of the last, writing a
 * throwaway vscode worktree at the commit before that case's fix. Results land
 * in `bench/results/` as one JSON file per run, plus the raw agent stream and
 * the patch the run produced beside it for auditing.
 */

import { mkdirSync } from 'node:fs'
import { flag, has } from './argv.ts'
import { loadCases } from './cases.ts'
import { RESULTS } from './paths.ts'
import { preflight } from './preflight.ts'
import { rescore } from './rescore.ts'
import { runSession } from './session.ts'
import type { ArmName } from './types.ts'

async function main(): Promise<void> {
  const model = flag('model', 'claude-sonnet-5')
  const replicates = Number(flag('replicates', '3'))
  const cases = loadCases(flag('cases', '').split(',').filter(Boolean))
  const arms = flag('arms', 'baseline,codedocs').split(',') as ArmName[]

  if (has('rescore')) {
    console.log('rescoring saved runs; no agent is run\n')
    rescore(cases)
    return
  }

  preflight(cases)
  mkdirSync(RESULTS, { recursive: true })
  console.log(
    `${cases.length} case(s) x ${arms.length} arm(s) x ${replicates} replicate(s) on ${model}\n`,
  )

  const finished = await runSession({
    cases,
    arms,
    replicates,
    model,
    resume: has('resume'),
  })
  if (!finished) {
    process.exitCode = 1
    return
  }
  console.log(
    `\nwrote ${RESULTS}. Run \`node bench/report.ts\` for the comparison.`,
  )
}

await main()
