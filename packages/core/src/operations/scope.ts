/**
 * Narrowing an answer's conditions to the projects it actually touched.
 *
 * ADR 0006: this is what stops the envelope growing with the size of the
 * repository rather than the size of the question. cal.com has 28 projects and
 * 27 of them have nothing to say about one `callers` answer. The full set is
 * `analyse`'s job, and later `doctor`'s.
 */

import type { AnswerContext } from '../envelope.ts'
import type { FilePath } from '../model.ts'
import { readProjectsForFiles, type Store } from '../store.ts'

/**
 * Return `context` with its conditions limited to the projects holding `files`.
 *
 * Blind spots are not narrowed: a file the analysis could not see is not filed
 * under a project, and dropping it would hide exactly the thing it exists to say.
 */
export function scopeTo(
  store: Store,
  context: AnswerContext,
  files: readonly FilePath[],
): AnswerContext {
  const touched = readProjectsForFiles(store, files)
  return {
    ...context,
    conditions: context.conditions.filter((row) => touched.has(row.project)),
  }
}
