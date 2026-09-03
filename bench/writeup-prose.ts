/**
 * The parts of the write-up that are not numbers.
 *
 * Every one of them takes the coverage of the set on disk, so the document's
 * claims about itself scale with what was actually run. A caveat that is written
 * once and never re-read becomes untrue the moment the data changes; a caveat
 * computed from the data cannot.
 */

import { LEVELS } from './difficulty.ts'
import { heading } from './markdown.ts'
import type { Arm } from './types.ts'

/** What the set of runs on disk actually covers. */
export type Coverage = {
  runs: number
  valid: number
  /** Cases with at least one run behind them, and cases in the running set. */
  cases: number
  casesDefined: number
  /** Cases researched and frozen, run or not. The running set is a subset. */
  prospects: number
  /** Difficulty levels the run cases fall in, against the four the rubric defines. */
  levels: number
  levelsDefined: number
  /** The most replicates any one cell reached. */
  replicates: number
  arms: Arm[]
  /** The judge, and how many runs it read. Null where nothing was judged. */
  judgeModel: string | null
  judged: number
}

/** The question the benchmark exists to answer. */
export function question(): string {
  return [
    heading(2, 'The question'),
    `As a coding task becomes more structurally complex, does a structural
interface to the codebase reduce what it costs an agent to make a correct
change?`,
    `Two things have to be true for the answer to be yes, and they are measured
separately. The agent has to reach the fix — \`hit\` says its patch changed every
non-test file the maintainers' fix changed, and \`fix\` says a judge read the
patch as fixing the bug. And it has to get there for less — fewer requests,
fewer tokens, fewer tool calls, fewer files opened, fewer lines of source read,
less time, less money.`,
    `The benefit is supposed to grow with structural complexity. That is why
every table below is grouped by difficulty level: a delta pooled over every case
averages the level 1 control, where the file is handed over in the stack trace,
together with the level 4 case where the cause is a relationship rather than a
location, and reports neither.`,
  ].join('\n\n')
}

/** How to read the tables, including the two things a reader could conflate. */
export function howToRead(): string {
  const levels = LEVELS.map(
    ({ level, name }) => `- **Level ${level}** — ${name}`,
  ).join('\n')
  return [
    heading(2, 'How to read this'),
    `**Medians, not means.** One runaway agent loop would drag a mean somewhere
no typical run goes.`,
    `**Negative is a saving.** Every \`change\` column reads the codedocs arm
against the baseline it is paired with, so \`-20%\` means the codedocs arm spent
a fifth less.`,
    `**Input counts cache reads.** A cached token is still a token the model
read, and a shorter search is exactly what shrinks the number — so \`in\` is the
uncached remainder, the cache writes and the cache reads together, and \`in\`
plus \`out\` is \`tokens\`. On a long agent loop the cache dominates, which is
why the raw uncached figure is not the one reported.`,
    `**\`hit\` and \`sym\` are exact. \`fix\` and \`sim\` are a judge.** The first
two are computed from the patch and the upstream fix and are not opinions. The
second two come from a model reading the patch blind, three times; read them
beside the agreement figure, and see [the README](README.md#judging-the-fix) for
what the grades mean.`,
    `**The levels:**\n\n${levels}\n\nThe rubric, and why each case sits where it
does, is [DIFFICULTY.md](DIFFICULTY.md).`,
  ].join('\n\n')
}

/** What was run, stated before any number is read. */
export function provenance(coverage: Coverage): string {
  const arms = coverage.arms.map((arm) => `\`${arm.id}\``).join(', ')
  const judge =
    coverage.judgeModel === null
      ? 'No run has been judged.'
      : `Patches were judged by \`${coverage.judgeModel}\`, three readings each, blind to which arm wrote them — ${coverage.judged} of ${coverage.valid} valid runs.`
  return [
    heading(2, 'What was run'),
    `${coverage.runs} run${coverage.runs === 1 ? '' : 's'} over ${coverage.cases} of the ${coverage.casesDefined} case${coverage.casesDefined === 1 ? '' : 's'} in the running set, on ${arms}, up to ${coverage.replicates} replicate${coverage.replicates === 1 ? '' : 's'} per cell. ${coverage.valid} counted; the rest are accounted for under [Discarded runs](#discarded-runs).`,
    `The running set is ${coverage.casesDefined} of ${coverage.prospects} researched cases. The pool is deliberately
researched wider than it is run: every codedocs run needs an index of its own
fresh worktree, and building one on vscode is minutes with a long tail. The
harness builds each commit once and restores it thereafter, so a case costs one
build however many times it is run — but a case still has to be promoted
deliberately, and \`bench/active.ts\` says which have been.`,
    judge,
    `Every run read its own \`git worktree\` at the commit before its case's
fix, and was scored on the patch git took out of that tree. The method is
[README.md](README.md).`,
  ].join('\n\n')
}

/**
 * What the set on disk will and will not support, said before the tables rather
 * than after them.
 *
 * A set thin enough not to be a result says so at the top, in its own words,
 * because a reader who has already read the tables has already formed the view
 * the caveat exists to prevent.
 */
export function standing(coverage: Coverage): string {
  const missing = coverage.casesDefined - coverage.cases
  const gaps = [
    coverage.replicates < 3
      ? `only ${coverage.replicates} replicate${coverage.replicates === 1 ? '' : 's'} deep`
      : '',
    missing > 0
      ? `missing ${missing} of the ${coverage.casesDefined} cases in the running set`
      : '',
  ].filter(Boolean)

  // The gradient is the claim. A set inside one level can be complete, deep and
  // still say nothing about it, so it is called out apart from the gaps.
  const flat = coverage.levels < coverage.levelsDefined
  const span =
    coverage.levels === 1 ? 'a single level' : `${coverage.levels} levels`
  const gradient = flat
    ? `**No gradient.** These runs cover ${coverage.levels} of the ${coverage.levelsDefined} difficulty levels. The
hypothesis is not "codedocs is cheaper" — it is that the saving _grows_ with
structural complexity, and a set inside ${span} cannot show a slope whichever way
its numbers fall. Whatever the deltas below say, they are a reading of
${coverage.levels === 1 ? 'one level' : 'part of the range'} and not of the claim.`
    : ''

  const header = heading(2, 'What this set supports')
  if (gaps.length === 0 && !flat) {
    return [
      header,
      `Every case in the running set has been run to ${coverage.replicates} replicates, across all
${coverage.levelsDefined} difficulty levels. That is enough to see whether an effect is there,
whether it grows with complexity, and whether the spread swamps either. It is
not enough for a confidence interval.`,
    ].join('\n\n')
  }
  return [
    header,
    gaps.length > 0
      ? `**Incomplete.** The runs on disk are ${gaps.join(' and ')}. What follows is
the harness reporting what it has, which is what it is built to do, and it is
published in this state deliberately: a report that appears only once the
numbers are flattering is not a measurement.`
      : `**Complete, and still narrow.** Every case in the running set has been run
to ${coverage.replicates} replicates. That is the set doing everything it can; it is not the
set the claim needs.`,
    gradient,
  ]
    .filter(Boolean)
    .join('\n\n')
}

/** The limits that hold however much is run. */
export function limits(coverage: Coverage): string {
  const areas = `\`base/\`, \`code/electron-main/\`, \`platform/extensionManagement/\`, \`platform/agentHost/\`, \`sessions/\` and three \`workbench/\` areas`
  return [
    heading(2, 'What this does not show'),
    `**Analysis fidelity is \`syntactic\`, not \`typed\`.** VS Code is indexed
without \`node_modules\` installed, so all 91 projects index without a type
checker and the call edges that resolve only through vscode's dependency
injection and interface layers are missing. Installing would cost several
gigabytes and make the benchmark far harder to reproduce. Read every codedocs
number as a floor: typed fidelity can add edges, not remove them.`,
    `**Repository coverage is one repository, and a thin slice of it.** Every
case is a VS Code bug. The pool spreads across ${areas} so that it does not
measure one corner, but a spread inside one repository is still one repository —
nothing here is evidence about codebases unlike vscode, and nothing here is
evidence about a language other than TypeScript.`,
    `**Sample size is ${coverage.valid} counted run${coverage.valid === 1 ? '' : 's'}.** A full
pool is ${coverage.casesDefined} cases at three replicates per arm, which is enough to see
whether an effect is there and whether the spread swamps it. It is never enough
for a confidence interval, and it is not a claim about any repository but this
one.`,
    `**The index build is amortized out, and it is not free.** A fresh worktree
has no index, so one has to be there before every codedocs run, in a process no
metric reads. Five builds have been timed: four between 186 and 223
seconds, and one at 3,716 that is unexplained — treat it as minutes with a long
tail rather than as a constant. The harness now builds each commit
once and restores it into later worktrees, so what a run actually pays is the
restore; both numbers are printed beside the verdict, named, so neither can be
quoted as the other. A single-question user recovers none of the build; a
working session recovers it several times over, and the per-run numbers assume
the session.`,
    `**Correctness above the file level is one model's opinion.** \`hit\` is
exact. \`fix\` and \`sim\` are not, and cannot be — a correct fix has many valid
shapes. The judge is blind to the arm, has no tools, and reads each patch three
times, and every grade's reasoning is on disk to be argued with. Where the
agreement figure is below 1.00 the judge disagreed with itself, and the honest
reading is that the case is arguable rather than that the grade is wrong.`,
    `**Discarding unused-tool runs selects for the cases the tool suits.** A
codedocs run that never called codedocs is thrown out, because counting it would
put a run with no tool in it on the tool's side of the comparison. But on an easy
case not reaching for the tool is the _right_ move — the stack trace names the
file, so the agent opens it and fixes it — and those runs are exactly the ones
discarded. The surviving codedocs runs are therefore not a random sample of
codedocs runs: they are the ones where the agent judged the tool worth using.
That biases the comparison **towards** codedocs on any pooled figure, and it
bites hardest on the easy cases, which are the ones meant to keep the benchmark
honest.`,
    `**The bias is reported, not repaired.** Nothing here corrects for it, and
two things stop it being invisible. [Tool take-up](#tool-take-up) prints how
often each arm reached for codedocs at all, per level, which turns the discard
from missing data into a measurement and answers a question this benchmark
otherwise cannot ask: when does an agent reach for structural facts? And every
pooled figure whose two arms do not rest on the same cases says so directly
under the number. Pooling only the cases both arms survived was the alternative
and would have been worse — it makes cases disappear silently, and on this set
it would delete a level 1 control for doing exactly what a control is there to
do.`,
    `**One judge, one rubric.** A second judge model would say how much of a
grade is the rubric and how much is the reader. Nothing here has asked one.`,
  ].join('\n\n')
}

/** The closing note on how this document is produced. */
export function colophon(): string {
  return [
    heading(2, 'How this document is made'),
    `\`node bench/writeup.ts\` regenerates it from the records in
\`bench/results/\`. It is a derived artefact and is never edited by hand: the
numbers in it are whatever was measured, and there is no path through the
generator for a number that was not.`,
  ].join('\n\n')
}
