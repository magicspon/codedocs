# The localization benchmark

One question: **does codedocs let an agent reach the same answer while reading
less of the repository?**

Not "is the agent smarter with it". Smarter is not measurable here. What is
measurable is the cost of getting to a known-correct answer — tokens processed,
tools called, files opened, seconds spent — and whether the arm holding codedocs
pays less of it.

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

| Case                         | Shape          | The report gives you                                     | Truth                                |
| ---------------------------- | -------------- | -------------------------------------------------------- | ------------------------------------ |
| [#333230](cases/333230.json) | `file-named`   | a stack trace naming `listView.ts` on eight frames       | `listView.ts` · `getVisibleRange`    |
| [#332885](cases/332885.json) | `symbol-named` | log lines that stop after "reading provider metadata"    | `agentService.ts`, `copilotAgent.ts` |
| [#331452](cases/331452.json) | `symptom-only` | sessions vanished after an update; no identifiers at all | `agentService.ts`                    |
| [#331102](cases/331102.json) | `symbol-named` | one private method name, `_resumeReconnects`             | `tunnelAgentHost.contribution.ts`    |
| [#333085](cases/333085.json) | `symptom-only` | an agent created an automation nobody asked for          | `automationTools.ts`                 |

The spread is the point. `#333230` is a control: the file is handed over on a
plate, so codedocs should buy little, and a benchmark whose every case favours
the tool is a brochure. `#333085` is the case where grep on a product noun may
well win, and it is kept for exactly that reason.

Ground truth is the non-test source files the upstream fix touched. Test files
are excluded from both the truth and the answer, because an answer naming the
test file would read as a miss to any human reviewer.

## What is measured

| Metric   | Definition                                                                        |
| -------- | --------------------------------------------------------------------------------- |
| `tokens` | every token the loop processed, cache reads included                              |
| `calls`  | tool calls made                                                                   |
| `files`  | distinct repository files opened, by `Read` or by a shell command that prints one |
| `sec`    | wall time                                                                         |
| `hit`    | the answer named every ground-truth file                                          |
| `sym`    | the answer named at least one ground-truth symbol                                 |

Cache reads are counted because a cached token is still a token the model read,
and a shorter search is exactly what shrinks the number.

Files opened is counted conservatively: the shell-command parser only recognises
commands that print a file, and a path it fails to spot undercounts whichever
arm ran the command. The bias therefore always runs against the tool being sold.

Medians, not means. With three replicates one runaway agent loop would drag a
mean somewhere no typical run goes.

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

| Module         | What it holds                                               |
| -------------- | ----------------------------------------------------------- |
| `paths.ts`     | where the benchmark reads and writes, and the pinned commit |
| `cases.ts`     | the frozen cases, read from `cases/*.json`                  |
| `prompt.ts`    | the task, and the briefing the codedocs arm gets            |
| `agent.ts`     | spawning `claude -p` and collecting its stream              |
| `tally.ts`     | what one run consumed: tool calls, files opened, tokens     |
| `stream.ts`    | walking the stream and folding it into that tally           |
| `score.ts`     | reading the answer block, scoring it, and deciding validity |
| `record.ts`    | the record one saved stream implies                         |
| `session.ts`   | running (case, arm, replicate) and filing the results       |
| `rescore.ts`   | rebuilding records from saved streams                       |
| `preflight.ts` | the checks that run before any quota is spent               |
| `run.ts`       | the command line                                            |
| `report.ts`    | reading `results/` and printing the comparison              |

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
