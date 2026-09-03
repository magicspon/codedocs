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
 * A context line that declares something, rather than continuing a statement.
 *
 * An identifier followed by `(` or `<`, optionally behind the modifiers a
 * declaration carries. Control-flow keywords are ruled out, because `if (` and
 * `for (` fit that shape and are not what anything is declared as.
 */
const DECLARES =
  /^[\t ]*(?:(?:export|public|private|protected|static|readonly|async|abstract|override|declare|function|class|interface|enum|namespace|const|let|var|get|set)\s+)*[A-Za-z_$#][\w$]*\s*[(<]/
const CONTROL =
  /^[\t ]*(?:if|for|while|switch|catch|do|return|else|await|new|throw|yield|typeof|delete)\b/

/**
 * The lines of a hunk a symbol may be claimed from: the ones the patch changed,
 * the `@@` header, and the declaration the change sits under.
 *
 * The declaration is the nearest context line above the first changed line that
 * looks like one, which is how a change inside a method is credited to the
 * method rather than to the class the header names. Everything else in the
 * context is excluded: a patch that edits one method three lines under a call
 * to another would otherwise be credited with both.
 */
function claimableLines(hunk: string): string {
  const lines = hunk.split('\n')
  const changed = (line: string): boolean =>
    line.startsWith('+') || line.startsWith('-')
  const first = lines.findIndex((line, at) => at > 0 && changed(line))
  const kept = [lines[0] ?? '']
  for (let at = first - 1; at > 0; at -= 1) {
    // Context lines carry a leading space that the patterns must not see.
    const line = (lines[at] ?? '').slice(1)
    if (DECLARES.test(line) && !CONTROL.test(line)) {
      kept.push(line)
      break
    }
  }
  return [...kept, ...lines.filter(changed)].join('\n')
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
