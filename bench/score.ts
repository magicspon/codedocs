/**
 * Turns the patch a run produced into a score, and decides whether the run counts.
 *
 * Scoring is exact rather than a judgement: the diff is compared against the
 * files and symbols the upstream fix touched. It says whether the run changed
 * the right code, and nothing about whether the change is correct — a judge
 * would be needed for that, and there is none here.
 */

import type { DiffFile } from './diff.ts'
import type { ArmName, BenchCase, RunDiff, RunMetrics } from './types.ts'

/** Escapes a symbol name for use inside a regular expression. */
function escape(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * The lines of a hunk a symbol may be claimed from: the ones the patch changed,
 * plus the `@@` header, which names the declaration the change sits under.
 *
 * Unchanged context is deliberately left out. A patch that edits one method and
 * happens to have a call to another three lines above it would otherwise be
 * credited with both. See the README for which way this errs.
 */
function claimableLines(hunk: string): string {
  return hunk
    .split('\n')
    .filter(
      (line, at) => at === 0 || line.startsWith('+') || line.startsWith('-'),
    )
    .join('\n')
}

/** True when the lines a file's patch changed name a symbol. */
function namesSymbol(hunks: string[], symbol: string): boolean {
  const word = new RegExp(`\\b${escape(symbol)}\\b`)
  return hunks.some((hunk) => word.test(claimableLines(hunk)))
}

/**
 * Scores one run's diff against the upstream fix.
 *
 * A run is correct when its diff changed every non-test file the fix changed.
 * Extra files are recorded but do not fail the run: the fix has one true set,
 * while a plausible neighbouring change is a judgement, not an error.
 */
export function scoreDiff(changed: DiffFile[], bench: BenchCase): RunDiff {
  const files = changed.map((file) => file.path)
  const hit = bench.truth.files.filter((truth) => files.includes(truth))
  // Only hunks inside ground-truth files can name a ground-truth symbol: the
  // same method edited in the wrong file is not the code the fix changed.
  const hunks = changed
    .filter((file) => hit.includes(file.path))
    .flatMap((file) => file.hunks)
  return {
    files,
    filesHit: hit,
    filesMissed: bench.truth.files.filter((truth) => !hit.includes(truth)),
    filesExtra: files.filter((file) => !bench.truth.files.includes(file)),
    symbolsHit: bench.truth.symbols.filter((symbol) =>
      namesSymbol(hunks, symbol),
    ),
    correct: hit.length === bench.truth.files.length,
  }
}

/**
 * Why a run may not be counted. Each reason is a way the comparison would stop
 * being between the two things it claims to compare.
 */
export function invalidReason(
  arm: ArmName,
  metrics: RunMetrics,
  patched: boolean,
  usedCodedocs: boolean,
): string | null {
  if (!patched) return 'the agent left no patch'
  if (arm === 'baseline' && usedCodedocs) return 'baseline reached for codedocs'
  if (arm === 'codedocs' && !usedCodedocs)
    return 'codedocs arm never called codedocs'
  if (metrics.turns === 0) return 'agent produced no turns'
  return null
}
