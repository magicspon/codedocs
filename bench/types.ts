/**
 * Shared shapes for the localization benchmark.
 *
 * The benchmark asks one question: does codedocs let an agent reach the same
 * answer while reading less of the repository? Every type here exists to make
 * that comparison auditable — what was asked, what was allowed, what it cost.
 */

/** What the issue text hands the agent before it starts looking. */
export type CaseShape =
  /** A stack trace names the file; the symbol that must change is elsewhere in it. */
  | 'file-named'
  /** Symbols or log strings are named, but no file is. */
  | 'symbol-named'
  /** Behaviour only. Nothing in the text points at code. */
  | 'symptom-only'

/**
 * How much of the repository an agent must understand to answer, from 1 to 4.
 * Defined by exploration, never by the size of the eventual patch. The rubric
 * is `bench/DIFFICULTY.md`.
 */
export type DifficultyLevel = 1 | 2 | 3 | 4

/** A case's level, and why it sits there. */
export type Difficulty = {
  level: DifficultyLevel
  /** The reasoning, in the rubric's terms: what has to be crossed, followed or held in mind. */
  why: string
}

/** One benchmark case: a real issue, and the upstream fix that answers it. */
export type BenchCase = {
  /** Stable id, and the directory name results are filed under. */
  id: string
  issue: number
  issueUrl: string
  title: string
  shape: CaseShape
  /** The issue body as posted, with HTML comments stripped. See README. */
  body: string
  fix: {
    commit: string
    url: string
    /** ISO date the fix reached `main`. */
    landedAt: string
  }
  /**
   * The repository state the case is run against: the commit immediately before
   * its fix. The harness materialises it as a throwaway worktree per run, so
   * the tree under test is the tree the bug was reported against.
   */
  base: {
    commit: string
    url: string
  }
  /** What a correct answer names. Test files are excluded on both sides. */
  truth: {
    files: string[]
    symbols: string[]
  }
  /** How hard the search is, and why. See `bench/DIFFICULTY.md`. */
  difficulty: Difficulty
  /** Why this case is worth running, and what it is expected to discriminate. */
  notes: string
}

/** Which tools the agent under test may use, and what it is told about them. */
export type ArmName = 'baseline' | 'codedocs'

/** Everything one run consumed, parsed from the agent's stream. */
export type RunMetrics = {
  /** Every token the loop processed, cache reads included. The headline number. */
  tokensTotal: number
  tokensInput: number
  tokensOutput: number
  tokensCacheRead: number
  tokensCacheCreation: number
  /** Tool calls, in total and by tool name. */
  toolCalls: number
  toolCallsByName: Record<string, number>
  /** Distinct repository files the run opened, by any means. */
  filesOpened: string[]
  /**
   * Lines of repository content every inspecting call pulled into context —
   * file reads, searches and codedocs answers alike. See the README.
   */
  sourceLinesRead: number
  /** Tool calls that inspected the repository, under the README's definition. */
  explorationSteps: number
  /** Characters of tool output fed back into the context. */
  toolOutputChars: number
  turns: number
  durationMs: number
  costUsd: number
}

/** What the agent claimed, and whether it was right. */
export type RunAnswer = {
  files: string[]
  symbols: string[]
  /** Every ground-truth file the answer named. */
  filesHit: string[]
  /** Ground-truth files the answer missed. */
  filesMissed: string[]
  /** Files the answer named that the fix did not touch. */
  filesExtra: string[]
  symbolHit: boolean
  /** True when every ground-truth file was named. */
  correct: boolean
}

/** One (case, arm, replicate) execution. */
export type RunRecord = {
  caseId: string
  arm: ArmName
  replicate: number
  startedAt: string
  model: string
  /**
   * The commit the worktree this run read was cut from. Recorded so a result
   * says which tree produced it: two runs of one case are only comparable when
   * they read the same one. Absent on records written before per-case
   * worktrees, which all read a single pinned checkout.
   */
  baseCommit?: string
  metrics: RunMetrics
  answer: RunAnswer | null
  /** Set when the run cannot be counted, with the reason. */
  invalid: string | null
}
