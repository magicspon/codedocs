# The localization benchmark

One question: **does codedocs let an agent reach the same answer while reading
less of the repository?**

Not "is the agent smarter with it". Smarter is not measurable here. What is
measurable is the cost of getting to a known-correct answer — tokens processed,
tools called, exploration steps taken, files opened, lines of source read,
seconds spent — and whether the arm holding codedocs pays less of it.

## The task

Each case gives an agent a real VS Code bug report and asks one thing: name the
files and symbols that must change. Nothing is edited, built or tested. The
answer arrives as a fenced JSON block, so scoring is exact rather than a
judgement:

```json
{ "files": ["src/vs/some/path.ts"], "symbols": ["someMethod"] }
```

Localization is deliberately narrower than fixing. A fix has many valid shapes
and would need a judge model to score; localization has one true answer, written
by the VS Code maintainers, and comparing arms on it isolates the thing codedocs
actually claims to change — the cost of navigating an unfamiliar codebase.

## The two arms

|              | baseline                          | codedocs                                   |
| ------------ | --------------------------------- | ------------------------------------------ |
| Tools        | Read, Grep, Glob, Bash, TodoWrite | the same                                   |
| Extra prompt | none                              | ~150 tokens describing the five operations |
| Index        | ignored                           | already built                              |

Both arms get `Bash`, because grep and find are how anyone searches a repository
from a shell and taking it from the baseline would rig the result. Edits,
subagents and the network are off in both: the task is read-only, and a
subagent's tokens are accounted separately from the loop being measured.

The codedocs briefing costs input tokens on every turn, and those tokens are
charged to the codedocs arm. That is the real cost of putting a tool in front of
an agent, and hiding it would flatter the tool.

A run is thrown out, not silently counted, when the baseline reaches for
`codedocs` anyway, when the codedocs arm never calls it, or when no answer block
can be parsed. The report prints how many were thrown out.

## The cases

Every case satisfies the same three conditions, each verified rather than
assumed:

1. **The fix landed upstream after the pinned checkout** (`736a3ed`,
   2026-08-31), so it could not have leaked into the tree under test.
2. **The bug is still present in that tree** — checked by grepping our checkout
   for a distinctive line the fix added, and finding it absent.
3. **The prompt is the issue, not the pull request.** Fix PRs on this repository
   routinely explain the root cause and name the method; using one as a prompt
   would be handing over the answer. Every prompt here is the underlying user
   report, with only the issue-template HTML comments stripped.

| Case                         | Level | Shape          | The report gives you                                     | Truth                                |
| ---------------------------- | ----- | -------------- | -------------------------------------------------------- | ------------------------------------ |
| [#333230](cases/333230.json) | 1     | `file-named`   | a stack trace naming `listView.ts` on eight frames       | `listView.ts` · `getVisibleRange`    |
| [#331102](cases/331102.json) | 2     | `symbol-named` | one private method name, `_resumeReconnects`             | `tunnelAgentHost.contribution.ts`    |
| [#333085](cases/333085.json) | 2     | `symptom-only` | an agent created an automation nobody asked for          | `automationTools.ts`                 |
| [#332885](cases/332885.json) | 3     | `symbol-named` | log lines that stop after "reading provider metadata"    | `agentService.ts`, `copilotAgent.ts` |
| [#331452](cases/331452.json) | 4     | `symptom-only` | sessions vanished after an update; no identifiers at all | `agentService.ts`                    |

The spread is the point. `#333230` is a control: the file is handed over on a
plate, so codedocs should buy little, and a benchmark whose every case favours
the tool is a brochure. `#333085` is the case where grep on a product noun may
well win, and it is kept for exactly that reason.

Ground truth is the non-test source files the upstream fix touched. Test files
are excluded from both the truth and the answer, because an answer naming the
test file would read as a miss to any human reviewer.

## Difficulty levels

Every case carries a level from 1 to 4, and the report groups by it. The level
says how much of the repository an agent must understand to answer — files
involved, projects crossed, call-graph depth, abstractions in the way, lifecycle
relationships, and how far the symptom sits from the cause.

It is not the size of the fix. Lines changed is explicitly rejected as a
difficulty signal: `#331452` is answered by one file and is the hardest case in
the set, while a mechanical rename could touch fifty and demand nothing.

The rubric, and the reasoning behind each assignment, is
[DIFFICULTY.md](DIFFICULTY.md). Each case also carries its own reasoning in its
`difficulty.why` field.

Grouping is what makes the central claim readable: the benefit is supposed to
grow with structural complexity, and a delta pooled over every case averages the
level 1 control together with the level 4 case and reports neither.

## What is measured

| Metric   | Definition                                                                        |
| -------- | --------------------------------------------------------------------------------- |
| `tokens` | every token the loop processed, cache reads included                              |
| `calls`  | tool calls made                                                                   |
| `steps`  | of those calls, the ones that inspected the repository                            |
| `files`  | distinct repository files opened, by `Read` or by a shell command that prints one |
| `src`    | lines of repository content those inspections returned                            |
| `sec`    | wall time                                                                         |
| `hit`    | the answer named every ground-truth file                                          |
| `sym`    | the answer named at least one ground-truth symbol                                 |

Cache reads are counted because a cached token is still a token the model read,
and a shorter search is exactly what shrinks the number.

Medians, not means. With three replicates one runaway agent loop would drag a
mean somewhere no typical run goes.

### An exploration step

**One tool call that asked the repository something.** A `Read`, a `Grep`, a
`Glob`, or a `Bash` command that prints a file, searches the tree, or queries
codedocs. Everything else is not a step: `git log`, `wc`, `true`. Those are
bookkeeping about the checkout rather than a look at what is in it.

A read, a search and a codedocs query all count as one step each. Charging them
differently would decide the comparison in advance, which is the one thing the
metric must not do.

`steps` sits beside `calls` rather than replacing it, because the gap between
them is itself worth seeing: it is what the agent spent on things that were not
looking at the repository.

### Lines of source read

**`src` counts what every step returned, in non-blank lines.** A `Read` of 90
lines is 90; a `grep` that printed 12 matching lines is 12; a `codedocs symbol`
answer of 19 lines is 19. Blank lines are dropped, so a sparsely spaced file
does not score above the same code packed tighter — that is a fact about
formatting, not about how much was read.

This is the number `files` cannot give. Case `#333085` opens exactly one file on
both arms, so `files` reads 0%; `src` reads −52%, because the baseline read
1,167 lines of that file and the codedocs arm read 563.

Counting the tool's own output is deliberate. `codedocs` answers are repository
content pulled into the context by a step, so they are charged to the codedocs
arm exactly as its briefing tokens are. Over the runs on disk that is 1,891
lines the arm has to carry.

### Where the counts are wrong, and which way

Three known undercounts. Each is stated with its direction, and none of them
favours codedocs:

- **The shell-command parser is conservative.** It recognises commands that
  print a file — `cat`, `head`, `sed` and the rest — and a path it fails to spot
  undercounts `files`, `steps` and `src` for whichever arm ran the command.
- **Excluding searches from `src` was rejected for this reason.** Search output
  is repository content, and the baseline searched more of it: 2,072 lines
  against the codedocs arm's 1,017. Leaving searches out would have removed
  twice as much from the baseline as from codedocs and flattered the tool by
  roughly a thousand lines a set. Counting them keeps the comparison honest.
- **`git log` and `wc` are not steps.** Across the runs on disk the two arms
  spent almost the same on them — 13 calls against 11 over fifteen runs each — so
  the exclusion takes about as much from one arm as the other, and the residue is
  far too small to explain any gap the `steps` column shows.

The residual bias therefore runs against the tool being sold, as it does for
`files`.

## Running it

```sh
node bench/run.ts                    # every case, both arms, 3 replicates
node bench/run.ts --cases 331102     # one case
node bench/run.ts --replicates 1     # a smoke run
node bench/report.ts                 # the comparison table
node bench/report.ts --json          # the same numbers, machine readable
```

`run.ts` refuses to start if `repos/vscode` has moved off the pinned commit or
is dirty, because either voids the ground truth. It warms the index first, so
the codedocs arm pays the per-question cost rather than the cold build.

`run.ts --rescore` rebuilds every record from the streams already on disk.
Scoring and validity are pure functions of the stream, so a fix to either is
applied to past runs rather than paid for twice. `--resume` skips runs that
already produced a measurement.

`freeze-cases.ts` regenerates `cases/*.json` from GitHub. It exists for
provenance and does not need to run: the cases are frozen so a benchmark run
never depends on the network, or on someone editing an issue later.

## How the harness is laid out

One module per seam, so a change to scoring does not sit in the same file as the
process spawning:

| Module          | What it holds                                                  |
| --------------- | -------------------------------------------------------------- |
| `paths.ts`      | where the benchmark reads and writes, and the pinned commit    |
| `cases.ts`      | the frozen cases, read from `cases/*.json`                     |
| `prompt.ts`     | the task, and the briefing the codedocs arm gets               |
| `agent.ts`      | spawning `claude -p` and collecting its stream                 |
| `tally.ts`      | what one run consumed: calls, steps, files, lines read, tokens |
| `stream.ts`     | walking the stream and folding it into that tally              |
| `score.ts`      | reading the answer block, scoring it, and deciding validity    |
| `record.ts`     | the record one saved stream implies                            |
| `session.ts`    | running (case, arm, replicate) and filing the results          |
| `rescore.ts`    | rebuilding records from saved streams                          |
| `preflight.ts`  | the checks that run before any quota is spent                  |
| `run.ts`        | the command line                                               |
| `difficulty.ts` | the levels, and the heading the report prints for each         |
| `summarise.ts`  | the medians one arm's runs become                              |
| `table.ts`      | column widths, rows, and the delta beneath a pair of arms      |
| `report.ts`     | reading `results/`, grouping by level, printing the comparison |

## What this does not show

- **Fidelity is `syntactic`, not `typed`.** VS Code has no `node_modules`
  installed, so all 91 projects index without a type checker. Call edges that
  resolve only through vscode's dependency-injection and interface layers are
  therefore missing. Installing would cost several gigabytes and make the
  benchmark far harder to reproduce. Read the result as a floor: typed fidelity
  can add edges, not remove them.
- **The cold build is amortized out.** Indexing vscode costs 83 seconds and
  12,519 files once — 527k symbols, 728k call edges. Every question after that
  costs about two seconds. A single-question user never recovers the build; a
  working session does, several times over. The per-run numbers assume the
  session, and the build cost is stated here rather than buried in them.
- **One repository, one model, one task shape, three replicates.** Enough to see
  whether an effect is there and whether the spread swamps it. Not enough for a
  confidence interval, and not evidence about repositories unlike vscode.
- **Localization is not fixing.** An agent that finds the right file quickly may
  still write the wrong patch. This measures the search, and only the search.
