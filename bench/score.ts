/**
 * Turns an agent's reply into a score, and decides whether the run counts.
 *
 * Scoring is exact rather than a judgement: the prompt asks for a fenced JSON
 * block, and the answer is compared against the files the upstream fix touched.
 */

import { normalise } from './paths.ts'
import type { ArmName, BenchCase, RunAnswer, RunMetrics } from './types.ts'

/** What the agent claimed, before it is compared with the fix. */
export type Claim = { files: string[]; symbols: string[] }

/** Reads the last fenced json block, which is where the prompt asked the answer to go. */
export function extractAnswer(text: string): Claim | null {
  const blocks = [...text.matchAll(/```json\s*([\s\S]*?)```/g)]
  const last = blocks.at(-1)
  if (!last?.[1]) return null
  try {
    const parsed = JSON.parse(last[1]) as { files?: unknown; symbols?: unknown }
    const files = Array.isArray(parsed.files)
      ? parsed.files.filter((f) => typeof f === 'string')
      : []
    const symbols = Array.isArray(parsed.symbols)
      ? parsed.symbols.filter((s) => typeof s === 'string')
      : []
    return { files, symbols }
  } catch {
    return null
  }
}

/**
 * Scores one answer against the fix commit.
 *
 * A run is correct when it named every non-test file the fix touched. Extra
 * files are recorded but do not fail the run: a fix has one true set, while a
 * plausible neighbouring file is a judgement, not an error.
 */
export function score(answer: Claim, bench: BenchCase): RunAnswer {
  const named = answer.files.map((f) => normalise(f))
  const hit = bench.truth.files.filter((t) =>
    named.some((n) => n === t || n.endsWith(`/${t}`) || t.endsWith(`/${n}`)),
  )
  const missed = bench.truth.files.filter((t) => !hit.includes(t))
  const extra = named.filter(
    (n) => !bench.truth.files.some((t) => t === n || t.endsWith(`/${n}`)),
  )
  const symbolHit = answer.symbols.some((s) =>
    bench.truth.symbols.some(
      (t) =>
        t.toLowerCase() === s.toLowerCase() ||
        s.toLowerCase().endsWith(`.${t.toLowerCase()}`),
    ),
  )
  return {
    files: answer.files,
    symbols: answer.symbols,
    filesHit: hit,
    filesMissed: missed,
    filesExtra: extra,
    symbolHit,
    correct: missed.length === 0,
  }
}

/**
 * Why a run may not be counted. Each reason is a way the comparison would stop
 * being between the two things it claims to compare.
 */
export function invalidReason(
  arm: ArmName,
  metrics: RunMetrics,
  answered: boolean,
  usedCodedocs: boolean,
): string | null {
  if (!answered) return 'no parseable answer block'
  if (arm === 'baseline' && usedCodedocs) return 'baseline reached for codedocs'
  if (arm === 'codedocs' && !usedCodedocs)
    return 'codedocs arm never called codedocs'
  if (metrics.turns === 0) return 'agent produced no turns'
  return null
}
