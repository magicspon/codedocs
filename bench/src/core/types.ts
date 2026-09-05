/**
 * Shared shapes for the fix benchmark.
 *
 * The benchmark asks one question: does codedocs let an agent reach the same
 * fix while reading less of the repository? Every type here exists to make that
 * comparison auditable — what was asked, what was allowed, what it cost.
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
export type Toolset = 'baseline' | 'codedocs'

/**
 * One side of a comparison: a toolset paired with the model that holds it.
 *
 * The model belongs to the arm rather than to the session because the parent
 * issue asks whether a cheaper model with structural facts can do what a more
 * expensive one does without them. That question is a comparison between two
 * arms that differ in both halves, and it cannot be posed while the model is
 * fixed across the session.
 */
export type Arm = {
  /** `codedocs@haiku-4-5`. Names the arm on disk and in the report. */
  id: string
  toolset: Toolset
  /** The full model id, as passed to the agent. */
  model: string
}

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

/**
 * What the patch a run produced touched, and whether it reached the fix.
 *
 * Scored on the diff git took out of the run's worktree, never on anything the
 * agent said about its own work.
 */
export type RunDiff = {
  /** Every file the diff changed, repository-relative. */
  files: string[]
  /** Ground-truth files the diff changed. */
  filesHit: string[]
  /** Ground-truth files the diff left alone. */
  filesMissed: string[]
  /** Files the diff changed that the upstream fix did not. */
  filesExtra: string[]
  /** Ground-truth symbols the diff's hunks name, inside ground-truth files. */
  symbolsHit: string[]
  /** True when the diff changed every ground-truth file. */
  correct: boolean
}

/**
 * Whether a candidate patch fixes the bug it was given.
 *
 * Independent of resemblance to the upstream fix: a patch that reaches the same
 * result by another mechanism is `correct`. Resemblance is `Similarity`.
 */
export type Correctness =
  /** Resolves the reported failure without breaking what the report describes. */
  | 'correct'
  /** Addresses part of it, or one path of several the report covers. */
  | 'partial'
  /** Does not resolve it, or introduces a new fault. */
  | 'incorrect'

/**
 * How close a candidate patch sits to the fix the maintainers wrote.
 *
 * `same-area` is the grade the benchmark exists to separate from a hit: the
 * right code, acted on at the wrong point in the chain.
 */
export type Similarity =
  /** The same edit, allowing for naming and formatting. */
  | 'same-change'
  /** The same root cause at the same point, by a different edit. */
  | 'same-mechanism'
  /** Touches the code involved, but acts at a different point in the chain. */
  | 'same-area'
  /** Neither the cause nor the place. */
  | 'unrelated'

/** One reading of one patch: two grades, the reasoning behind them, and what it cost. */
export type JudgeVerdict = {
  correctness: Correctness
  similarity: Similarity
  /** Why each grade was given, naming the code that decided it. Kept for auditing. */
  why: string
  judgedAt: string
  /** The judge's own spend on this reading. Never folded into the run's cost. */
  costUsd: number
  tokensTotal: number
}

/**
 * The judgement standing against one run: the consensus of several readings of
 * its patch, and the spread behind that consensus.
 */
export type RunJudgement = {
  /** The judge model. Fixed across arms, so the judge is never a variable in the comparison. */
  model: string
  /** Hash of everything the judge was shown. The judgement cache is keyed by it. */
  key: string
  /** Which rubric produced these grades. A new rubric is a new key, not a mixed table. */
  rubric: number
  correctness: Correctness
  similarity: Similarity
  /** Share of readings agreeing with the consensus, per axis. 1 is unanimous. */
  agreement: { correctness: number; similarity: number }
  /** Every reading behind the consensus, in the order they were made. */
  replicates: JudgeVerdict[]
  /** What judging this run cost in total, reported apart from the run under test. */
  costUsd: number
  tokensTotal: number
  /**
   * True when the patch names codedocs in its own text — the one way a diff can
   * tell the judge which arm wrote it. Recorded rather than scrubbed: a scrubbed
   * diff is no longer the run's answer.
   */
  selfIdentifying: boolean
}

/** One (case, arm, replicate) execution. */
export type RunRecord = {
  caseId: string
  /**
   * The toolset and model this run was made with. Records written before an arm
   * carried its model name the toolset alone, and are widened on read using the
   * session model saved beside them — see `arms.ts`.
   */
  arm: Arm
  replicate: number
  startedAt: string
  /**
   * The commit the worktree this run read was cut from. Recorded so a result
   * says which tree produced it: two runs of one case are only comparable when
   * they read the same one. Absent on records written before per-case
   * worktrees, which all read a single pinned checkout.
   */
  baseCommit?: string
  metrics: RunMetrics
  /** What the run's patch touched, or null when it left no patch at all. */
  diff: RunDiff | null
  /**
   * Whether the run called codedocs at all.
   *
   * Recorded for both arms, not only the one it invalidates. On the codedocs
   * arm it is the take-up figure the report prints, and take-up is a result in
   * its own right: on an easy case declining to reach for the tool is the
   * correct move, and a discard on its own throws that finding away. Absent on
   * records written before it was recorded — `run.ts --rescore` fills those in
   * from the stream saved beside them, for nothing.
   */
  usedCodedocs?: boolean
  /** Set when the run cannot be counted, with the reason. */
  invalid: string | null
  /**
   * What a judge made of the patch, or null when it has not been judged.
   *
   * Null covers three cases the report keeps apart from a bad grade: a record
   * written before there was a judge, a run too invalid to be worth grading,
   * and a judge call that failed. `run.ts --judge` fills in the last of them.
   */
  judgement?: RunJudgement | null
}
