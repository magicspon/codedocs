/**
 * Narrowing an answer's conditions to the projects it actually touched.
 *
 * ADR 0006: this is what stops the envelope growing with the size of the
 * repository rather than the size of the question. cal.com has 28 projects and
 * 27 of them have nothing to say about one `callers` answer. The full set is
 * `analyse`'s job, and later `doctor`'s.
 */

import type { AnswerContext, BlindSpot } from '../envelope.ts'
import type {
  FilePath,
  PreconditionCause,
  UnresolvedSpecifier,
} from '../model.ts'
import {
  readProjectsForFiles,
  readUnresolvedSpecifiers,
  type Store,
} from '../store/index.ts'

/**
 * Return `context` with its conditions limited to the projects holding `files`,
 * and the unresolved specifiers of those same files added as blind spots.
 *
 * Drift blind spots are not narrowed: a file the analysis could not see is not
 * filed under a project, and dropping it would hide exactly the thing it exists
 * to say. Unresolved specifiers are the opposite case — they *are* filed under a
 * file, so ADR 0009 scopes them to the answer's own result.
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
    blindSpots: [
      ...context.blindSpots,
      ...specifierSpots(readUnresolvedSpecifiers(store, files)),
    ],
  }
}

/**
 * One blind spot per distinct specifier, whatever its number of sites.
 *
 * The deduplication is the whole reason signal 4 is readable: 306 of cal.com
 * `apps/web`'s 576 unresolved specifiers are the single specifier
 * `@calcom/prisma/enums`, so one absent artefact is one fact with a count rather
 * than 306 lines. Sorted by specifier, then cause, so the order is a function of
 * the data and not of the walk.
 */
export function specifierSpots(
  specifiers: readonly UnresolvedSpecifier[],
): BlindSpot[] {
  const counts = new Map<
    string,
    { specifier: string; cause: PreconditionCause; sites: number }
  >()
  for (const found of specifiers) {
    const key = `${found.specifier}\u0000${found.cause}`
    const seen = counts.get(key)
    if (seen === undefined) {
      counts.set(key, {
        specifier: found.specifier,
        cause: found.cause,
        sites: 1,
      })
    } else {
      seen.sites += 1
    }
  }
  return [...counts.values()]
    .sort(
      (a, b) => compare(a.specifier, b.specifier) || compare(a.cause, b.cause),
    )
    .map(({ specifier, cause, sites }) => ({
      subject: specifier,
      reason: `${MEANING[cause]}; unresolved at ${sites} site(s)`,
    }))
}

/**
 * What each cause means, said once.
 *
 * ADR 0001 forbids rendering a remediation for `broken`, and ADR 0009 extends
 * that to `unmapped` for the opposite reason: `broken` has no remediation
 * because none would help, `unmapped` because none is a command. The two that do
 * have one say what kind of command it is, and never which — naming the
 * framework needs a lookup ADR 0001 allows to be absent.
 */
const MEANING: Record<PreconditionCause, string> = {
  unprepared: 'declared as a dependency and not on disk — install them',
  'missing-generated':
    'its target is where a generated file would be — run the repository’s codegen',
  unmapped: 'resolves only under a resolver codedocs does not run',
  broken: 'imported but declared nowhere',
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
