/**
 * `analyse` — the cold build, reported per project.
 *
 * It survives even though ADR 0004 makes every query update before it answers,
 * because a cold build in CI wants to be a step that can fail on its own rather
 * than a hidden cost inside the first question.
 */

import { answer, type AnswerContext, type Envelope } from '../envelope.ts'
import type { Fidelity, FilePath } from '../model.ts'
import type { RepairReport } from '../session.ts'
import {
  counts,
  readAllUnresolvedSpecifiers,
  readProjects,
  type Store,
} from '../store.ts'
import { specifierSpots } from './scope.ts'

/** What `analyse` reports about one project. */
export interface ProjectSummary {
  readonly project: FilePath
  readonly fidelity: Fidelity
  readonly files: number
  readonly analysedAt: string
}

/** The totals an `analyse` answer carries alongside its per-project rows. */
export interface AnalysisTotals {
  readonly symbols: number
  readonly callEdges: number
  readonly unresolvedCalls: number
}

/**
 * Report what the index now holds, one row per project, sorted by tsconfig path.
 *
 * The build itself happened in the session: `analyse` names the result rather
 * than performing it, so the cold path and the repair path cannot diverge.
 *
 * @param repair - What the session's repair cost, or `null` if it did none.
 */
export function analyse(
  store: Store,
  context: AnswerContext,
  limit: number | null,
  repair: RepairReport | null = null,
): Envelope<readonly ProjectSummary[]> & {
  readonly totals: AnalysisTotals
  readonly repair: RepairReport | null
} {
  const summaries: ProjectSummary[] = readProjects(store).map((project) => ({
    project: project.configPath,
    fidelity: project.fidelity,
    files: project.rootFileCount,
    analysedAt: project.analysedAt,
  }))
  const totals = counts(store)
  // The one operation whose scope *is* the repository, so its blind spots are
  // every unresolved specifier rather than one answer's own files.
  const whole: AnswerContext = {
    ...context,
    blindSpots: [
      ...context.blindSpots,
      ...specifierSpots(readAllUnresolvedSpecifiers(store)),
    ],
  }
  return {
    ...answer(
      'analyse',
      { subject: null, resolved: [], limit, depth: null },
      whole,
      summaries,
    ),
    totals: {
      symbols: totals.symbols,
      callEdges: totals.callEdges,
      unresolvedCalls: totals.unresolved,
    },
    // Reported rather than hidden: a wave that fell back to a cold build is the
    // difference between a 3 ms answer and a 16 s one, and ADR 0004 makes the
    // cost of an answer part of the answer.
    repair,
  }
}
