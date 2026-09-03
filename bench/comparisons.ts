/**
 * The two questions the benchmark asks, kept apart.
 *
 * A delta is only meaningful against a named other arm, and there are two
 * different pairings worth reading:
 *
 *   like-for-like  one model, with the tool and without — does codedocs reduce
 *                  what it costs to reach the fix?
 *   cross-model    two models, the cheaper one holding the tool — do structural
 *                  facts let a cheaper model do work that otherwise needs a
 *                  dearer one?
 *
 * They answer different things, so pooling them answers neither: a cross-model
 * delta carries both the tool's effect and the models' difference, and averaging
 * it with a like-for-like delta produces a number about nothing.
 */

import { armsIn } from './arms.ts'
import type { Arm, RunRecord } from './types.ts'

/** Which of the two questions a pairing asks. */
export type ComparisonKind =
  /** Same model on both sides; the toolset is the only difference. */
  | 'like-for-like'
  /** Different models on each side; the toolset and the model both differ. */
  | 'cross-model'

/** One pairing: a baseline to read against, and the arm read against it. */
export type Comparison = {
  kind: ComparisonKind
  /** The arm every delta in this block is read against. Always a baseline. */
  reference: Arm
  /** The arm under test. Always a codedocs arm. */
  contender: Arm
  /** `codedocs@haiku-4-5 vs baseline@opus-5`. Names the block. */
  id: string
}

/** Builds a pairing, deciding which question it asks from whether the models match. */
function pair(reference: Arm, contender: Arm): Comparison {
  return {
    kind: reference.model === contender.model ? 'like-for-like' : 'cross-model',
    reference,
    contender,
    id: `${contender.id} vs ${reference.id}`,
  }
}

/**
 * Every pairing the runs on disk support, like-for-like first.
 *
 * Every baseline is paired with every codedocs arm rather than only the obvious
 * ones: which cross-model pairing is interesting is a question about the models,
 * and the report has no business deciding it. A session that ran one arm
 * produces no pairings at all, which is the honest answer — there is nothing to
 * compare it with.
 */
export function comparisonsIn(records: RunRecord[]): Comparison[] {
  const arms = armsIn(records)
  const baselines = arms.filter((arm) => arm.toolset === 'baseline')
  const contenders = arms.filter((arm) => arm.toolset === 'codedocs')
  const pairs = baselines.flatMap((reference) =>
    contenders.map((contender) => pair(reference, contender)),
  )
  // Like-for-like first: it is the claim the tool is sold on, and the
  // cross-model block is only readable once that one has been seen.
  const rank = (comparison: Comparison): number =>
    comparison.kind === 'like-for-like' ? 0 : 1
  return pairs.sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id))
}

/** The runs belonging to one side of a pairing, over some set of records. */
export function runsOf(records: RunRecord[], arm: Arm): RunRecord[] {
  return records.filter((record) => record.arm.id === arm.id)
}

/** What a pairing is asking, in one line, for the heading above it. */
export function questionOf(kind: ComparisonKind): string {
  return kind === 'like-for-like'
    ? 'one model, with the tool and without'
    : 'a different model on each side: the toolset and the model both differ'
}
