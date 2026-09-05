/**
 * What the judge is asked, and what its answers mean.
 *
 * The blinding lives in this module's types rather than in a convention: the
 * only thing `judgePrompt` accepts is a `JudgeInput`, which holds an issue, an
 * upstream fix and a candidate patch. There is no arm, no model and no run id
 * in scope, so there is none to leak into the prompt.
 */

import type { Correctness, Similarity } from '../core/types.ts'

/**
 * Which rubric a grade came from. Part of the judgement key, so changing the
 * wording below invalidates the judgements it produced rather than mixing two
 * rubrics into one table.
 */
export const RUBRIC_VERSION = 1

/**
 * The grades of each axis, most conservative first.
 *
 * The order is the tie-break: where readings of one patch split evenly, the
 * consensus takes the earlier grade, so a divided judgement never reads as the
 * more favourable one.
 */
export const CORRECTNESS: readonly Correctness[] = [
  'incorrect',
  'partial',
  'correct',
]
export const SIMILARITY: readonly Similarity[] = [
  'unrelated',
  'same-area',
  'same-mechanism',
  'same-change',
]

/**
 * A patch large enough to crowd out the rest of the prompt is cut here, and the
 * cut is announced to the judge so it grades what it can see and does not read
 * a truncated hunk as an incomplete fix.
 */
const MAX_PATCH_CHARS = 60_000

/** Everything the judge is shown. Nothing here says which arm produced the patch. */
export type JudgeInput = {
  /** The bug report the patch was written against, as the agent received it. */
  issue: string
  /** The fix the maintainers wrote, over the case's ground-truth files. */
  upstreamFix: string
  /** The patch under judgement, as git took it out of the run's worktree. */
  candidatePatch: string
}

/** Caps one block, saying so where it cut rather than trimming in silence. */
function capped(text: string): string {
  if (text.length <= MAX_PATCH_CHARS) return text
  return `${text.slice(0, MAX_PATCH_CHARS)}\n… truncated; the patch continues beyond what is shown.`
}

/**
 * The two scales, spelled out for the judge.
 *
 * Correctness is stated as independent of resemblance because the judge is
 * shown the upstream fix and would otherwise read "not what the maintainers
 * wrote" as "wrong" — which would collapse the two axes into one and lose the
 * distinction the second exists to draw.
 */
const SCALES = `
correctness — does the candidate fix the reported bug?

  correct    the reported failure no longer happens, and nothing the report
             describes as working is broken by the change
  partial    part of the failure is addressed, or one code path of several the
             report covers, or the symptom is suppressed while the cause stands
  incorrect  the failure remains, or the change introduces a new fault

  Judge this on the candidate's own merits. A candidate that reaches the same
  result by a different mechanism, in a different place, is still correct. Do
  not mark a candidate down for differing from the maintainers' fix — that is
  the other axis, and it is scored separately.

similarity — how close is the candidate to the maintainers' fix?

  same-change     the same edit, allowing for naming, formatting and comments
  same-mechanism  the same root cause addressed at the same point, by a
                  different edit
  same-area       the code involved, but acted on at a different point in the
                  chain — for instance guarding a value where it is consumed
                  rather than where it is produced
  unrelated       neither the cause nor the place
`.trim()

/**
 * The prompt one judgement is made from.
 *
 * JSON out, because a grade has to be read by a program; the reasoning travels
 * in the same object so it is stored with the run rather than reconstructed.
 */
export function judgePrompt(input: JudgeInput): string {
  return `You are grading one candidate patch for a bug in a large TypeScript codebase.

You are shown three things: the bug report, the fix the maintainers wrote for
it, and a candidate patch written independently by someone else. Grade the
candidate on two axes.

${SCALES}

<bug-report>
${input.issue}
</bug-report>

<maintainers-fix>
${capped(input.upstreamFix)}
</maintainers-fix>

<candidate-patch>
${capped(input.candidatePatch)}
</candidate-patch>

Reply with one JSON object and nothing else — no prose before or after it, no
code fence:

{"correctness": "correct|partial|incorrect", "similarity": "same-change|same-mechanism|same-area|unrelated", "why": "..."}

Keep "why" to two or three sentences, and name the specific code that decided
each grade.`
}
