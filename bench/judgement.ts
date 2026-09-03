/**
 * The judgement standing against a run: several readings of its patch, the
 * consensus they form, and the spread behind it.
 *
 * Judgements are cached by what the judge was shown rather than by which run
 * produced it. Two runs whose patches are identical therefore carry the same
 * verdict, and re-judging a patch already judged costs nothing — which is what
 * lets `--rescore` stay the free replay it claims to be.
 */

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { judgeOnce } from './judge.ts'
import { JUDGEMENTS } from './paths.ts'
import { CORRECTNESS, RUBRIC_VERSION, SIMILARITY } from './rubric.ts'
import type { JudgeInput } from './rubric.ts'
import type { BenchCase, JudgeVerdict, RunJudgement } from './types.ts'
import { upstreamFix } from './upstream.ts'

/** The one way a patch can tell the judge which arm wrote it. */
const NAMES_THE_TOOL = /codedocs/i

/**
 * What the fields of a key are joined on.
 *
 * A NUL, because it cannot occur in an issue, a diff or a model name, so no two
 * different sets of fields can join to the same string. Any printable separator
 * could in principle appear inside a field and let one key stand for two
 * different things the judge was shown.
 */
const SEPARATOR = '\0'

/** How a session judges: which model, how many readings, or not at all. */
export type JudgePlan = {
  /** False skips judging entirely, for a smoke run that only needs the metrics. */
  enabled: boolean
  model: string
  replicates: number
}

/**
 * The key a judgement is filed under: everything that could change a grade.
 *
 * The judge model and the rubric version are in it, so swapping either produces
 * a new judgement rather than a table quietly mixing two of them.
 */
function judgementKey(input: JudgeInput, model: string): string {
  return createHash('sha256')
    .update(
      [
        String(RUBRIC_VERSION),
        model,
        input.issue,
        input.upstreamFix,
        input.candidatePatch,
      ].join(SEPARATOR),
    )
    .digest('hex')
    .slice(0, 16)
}

/** Every reading already made of one key, or none. */
function cachedReplicates(key: string): JudgeVerdict[] {
  try {
    return JSON.parse(
      readFileSync(join(JUDGEMENTS, `${key}.json`), 'utf8'),
    ) as JudgeVerdict[]
  } catch {
    return []
  }
}

/** Banks the readings made of one key, so a later pass deepens rather than repeats them. */
function writeReplicates(key: string, replicates: JudgeVerdict[]): void {
  mkdirSync(JUDGEMENTS, { recursive: true })
  writeFileSync(
    join(JUDGEMENTS, `${key}.json`),
    `${JSON.stringify(replicates, null, '\t')}\n`,
    'utf8',
  )
}

/**
 * The grade most readings gave, and the share that gave it.
 *
 * Ties break toward the earlier grade in the scale, which the rubric orders
 * most conservative first: a split judgement never reads as the more
 * favourable one.
 */
function consensus<T extends string>(
  grades: T[],
  scale: readonly T[],
): { grade: T; agreement: number } {
  const count = (grade: T): number => grades.filter((g) => g === grade).length
  const best = [...scale].reduce((a, b) => (count(b) > count(a) ? b : a))
  return {
    grade: best,
    agreement: grades.length === 0 ? 0 : count(best) / grades.length,
  }
}

/** Folds the readings of one patch into the judgement the record carries. */
function judgementFrom(
  key: string,
  model: string,
  replicates: JudgeVerdict[],
  candidatePatch: string,
): RunJudgement {
  const correctness = consensus(
    replicates.map((r) => r.correctness),
    CORRECTNESS,
  )
  const similarity = consensus(
    replicates.map((r) => r.similarity),
    SIMILARITY,
  )
  return {
    model,
    key,
    rubric: RUBRIC_VERSION,
    correctness: correctness.grade,
    similarity: similarity.grade,
    agreement: {
      correctness: correctness.agreement,
      similarity: similarity.agreement,
    },
    replicates,
    costUsd: replicates.reduce((sum, r) => sum + r.costUsd, 0),
    tokensTotal: replicates.reduce((sum, r) => sum + r.tokensTotal, 0),
    selfIdentifying: NAMES_THE_TOOL.test(candidatePatch),
  }
}

/** What the judge is shown for one run: the issue, the upstream fix, the patch. */
function judgeInputFor(bench: BenchCase, patch: string): JudgeInput {
  return {
    issue: `# ${bench.title}  (microsoft/vscode#${bench.issue})\n\n${bench.body}`,
    upstreamFix: upstreamFix(bench),
    candidatePatch: patch,
  }
}

/** The judgement already on disk for a run's patch, without spending anything. */
export function cachedJudgement(
  bench: BenchCase,
  patch: string,
  model: string,
): RunJudgement | null {
  const input = judgeInputFor(bench, patch)
  const key = judgementKey(input, model)
  const replicates = cachedReplicates(key)
  return replicates.length === 0
    ? null
    : judgementFrom(key, model, replicates, patch)
}

/**
 * Judges a run's patch, topping the cached readings up to the plan's count.
 *
 * Several readings rather than one because a single grade says nothing about
 * how stable it is, and a result reported from an unstable judge is a result
 * about the judge.
 */
export async function judgeRun(
  bench: BenchCase,
  patch: string,
  plan: JudgePlan,
): Promise<RunJudgement> {
  const input = judgeInputFor(bench, patch)
  const key = judgementKey(input, plan.model)
  const readings = cachedReplicates(key)
  for (let n = readings.length; n < plan.replicates; n += 1) {
    readings.push(await judgeOnce(input, plan.model))
    // Banked as each reading lands, so a judge refused halfway keeps what it
    // has already paid for and the next pass tops it up rather than restarting.
    writeReplicates(key, readings)
  }
  return judgementFrom(key, plan.model, readings, patch)
}
