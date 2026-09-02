# The fix benchmark

One question: **does codedocs let an agent reach the same fix while reading less
of the repository?**

Not "is the agent smarter with it". Smarter is not measurable here. What is
measurable is the cost of getting to the code that has to change — tokens
processed, tools called, exploration steps taken, files opened, lines of source
read, seconds spent — and whether the arm holding codedocs pays less of it.

## The task

Each case gives an agent a real VS Code bug report and asks one thing: fix it.
The agent gets edit tools inside a worktree of its own, the issue text, and
nothing about the upstream fix. What it leaves behind is a patch, and the patch
is the answer — the harness takes the diff out of the worktree with git, so a
run is scored on what it actually changed and not on anything it said about its
own work.

A run counts as a hit when its diff changed every non-test file the upstream fix
changed, and the `sym` column says whether it changed a line that names one of
the symbols that fix changed.

Whether the patch would work is deliberately not scored. That needs a judge
model, and a judge is a second opinion in the measurement. Touching the right
code is what codedocs claims to help with, and it is what can be checked exactly
against a patch the VS Code maintainers wrote.

## The two arms

|              | baseline                                       | codedocs                                   |
| ------------ | ---------------------------------------------- | ------------------------------------------ |
| Tools        | Read, Grep, Glob, Bash, TodoWrite, Edit, Write | the same                                   |
| Extra prompt | none                                           | ~150 tokens describing the five operations |
| Index        | ignored                                        | already built                              |

Both arms get `Bash`, because grep and find are how anyone searches a repository
from a shell and taking it from the baseline would rig the result. Both may
edit, because the task is to write the fix and the worktree each run writes to
is thrown away afterwards. Subagents and the network are off in both: a
subagent's tokens are accounted separately from the loop being measured, and a
run that fetched the upstream fix would be measuring nothing.

The codedocs briefing costs input tokens on every turn, and those tokens are
charged to the codedocs arm. That is the real cost of putting a tool in front of
an agent, and hiding it would flatter the tool.

A run is thrown out, not silently counted, when the baseline reaches for
`codedocs` anyway, when the codedocs arm never calls it, or when the agent left
no patch at all. The report prints how many were thrown out.

## The cases

Every case satisfies the same three conditions, each verified rather than
assumed:

1. **The tree under test is the tree the bug was reported against.** A case
   declares the commit immediately before its fix, and is run there, so the fix
   cannot have leaked into what the agent reads.
2. **That claim is checked against git, not trusted.** Before any quota is
   spent, the harness resolves the fix's parent and refuses the case unless it
   is the commit declared, and unless every file the fix touched exists in it.
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
are excluded from the truth, and the prompt tells the agent not to write any:
the truth is source, and a run that spent its turns on a test would be measured
on work no case scores.

## One tree per run

Every run gets its own checkout: a detached `git worktree` at the case's base
commit, created before the agent starts and removed when it ends. Four seconds
and 550 MB, one at a time.

Two things need that. A case is only a real bug at the commit under its fix, and
the cases share no such commit — they were fixed over ten days, so no single
checkout sits before all five fixes. And a tree the agent writes to has to be
thrown away afterwards, or the next run reads the last one's edits. The patch is
read out of the tree with `git diff` against the case's base commit — after
`git add -A -N`, so a file the agent created is in the diff, and against the
commit rather than `HEAD`, so an agent that committed its work is measured the
same way. Anything the repository ignores, a build output or an installed
dependency, stays out.

`repos/vscode` is a depth-1 clone and holds none of those commits until it is
asked for one, so the harness fetches each case's fix at depth 2 — the fix, and
the commit under it — before the first run. That is the only network a benchmark
run touches, and what it asks for are immutable hashes.

A fresh worktree has no index either, so the codedocs arm's index is built
inside it before the agent starts, in a process the benchmark is not measuring —
where the single pinned checkout used to be warmed. That is the price of the
isolation: about four minutes a codedocs run, printed beside each verdict so
what the harness spent stays visible.

The figures quoted further down come from the run set measured on the earlier
localization task, when the agent named files instead of changing them and every
case read one pinned checkout. They are kept because they are the evidence
behind decisions this harness still makes, and each is labelled where it
appears. They are not fix-task results, and no fix-task set has been measured
yet beyond the smoke run that proved the path.

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
| `hit`    | the patch changed every ground-truth file                                         |
| `sym`    | the patch named at least one ground-truth symbol on a line it changed             |

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
looking at the repository. Writing the patch lives in that gap — an `Edit` is
not a look at the repository, and the `Read` it needs first already counted.

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

### What counts as touching a symbol

**A ground-truth symbol is touched when its name appears on a line the patch
changed, or in the `@@` header above one, inside a ground-truth file.**
Unchanged context is deliberately excluded: a patch that edits one method three
lines under a call to another would otherwise be credited with both, and the
same method edited in the wrong file is not the code the fix changed.

The rule is strict, and it is blind to a change buried deep inside a long method
whose name appears nowhere near it. Applied to the five upstream fixes
themselves, it names a ground-truth symbol in three of the five — so read `sym`
as a floor on both arms, never as a hit rate. `hit` is the score; `sym` says
whether the patch landed in the same code rather than merely the same file.

A span-accurate rule would need the symbol boundaries of each ground-truth file,
which means parsing the tree at scoring time. It is worth doing when the case
pool is larger; it is not worth doing to sharpen a secondary column over five
cases.

### Where the counts are wrong, and which way

Four known undercounts. Each is stated with its direction, and none of them
favours codedocs. The figures in them were measured on the localization runs
that preceded the fix task, and are the evidence the choices were made on:

- **The shell-command parser is conservative.** It recognises commands that
  print a file — `cat`, `head`, `sed` and the rest — and a path it fails to spot
  undercounts `files`, `steps` and `src` for whichever arm ran the command.
- **Excluding searches from `src` was rejected for this reason.** Search output
  is repository content, and the baseline searched more of it: 2,072 lines
  against the codedocs arm's 1,017. Leaving searches out would have removed
  twice as much from the baseline as from codedocs and flattered the tool by
  roughly a thousand lines a set. Counting them keeps the comparison honest.
- **`git log` and `wc` are not steps.** Across those runs the two arms spent
  almost the same on them — 13 calls against 11 over fifteen runs each — so the
  exclusion takes about as much from one arm as the other, and the residue is far
  too small to explain any gap the `steps` column shows.
- **An in-place `sed` counts as a look.** The parser cannot tell `sed -n 1,40p`
  from `sed -i`, so an agent that edits through the shell is charged a step and
  the lines it printed. It over-charges whichever arm does it, which is the
  direction that cannot flatter the tool.

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

`run.ts` refuses to start when a case's declared base is not the commit under
its fix, or when a file that fix touched is missing from that tree, because
either voids the ground truth. It fetches the commits the cases name, then
builds each codedocs run's index in that run's worktree, so the arm pays the
per-question cost rather than the cold build.

Each run leaves three files in `bench/results/`: `<case>-<arm>-r<n>.json`, the
record the report reads; `.stream.jsonl`, everything the agent did; and `.diff`,
the patch it produced, readable and `git apply`-able as it stands.

`run.ts --rescore` rebuilds every record from the streams and patches already on
disk. Scoring and validity are pure functions of those two, so a fix to either is
applied to past runs rather than paid for twice. `--resume` skips runs that
already produced a measurement.

`freeze-cases.ts` regenerates `cases/*.json` from GitHub. It exists for
provenance and does not need to run: the cases are frozen, so a run asks GitHub
for nothing but the commits they name — never for an issue body someone may
have edited since.

## How the harness is laid out

One module per seam, so a change to scoring does not sit in the same file as the
process spawning:

| Module          | What it holds                                                  |
| --------------- | -------------------------------------------------------------- |
| `paths.ts`      | where the benchmark reads and writes                           |
| `cases.ts`      | the frozen cases, read from `cases/*.json`                     |
| `worktree.ts`   | a run's own checkout at its case's commit, and its removal     |
| `warm.ts`       | building the index that worktree does not come with            |
| `prompt.ts`     | the task, and the briefing the codedocs arm gets               |
| `agent.ts`      | spawning `claude -p` and collecting its stream                 |
| `tally.ts`      | what one run consumed: calls, steps, files, lines read, tokens |
| `stream.ts`     | walking the stream and folding it into that tally              |
| `diff.ts`       | taking the patch out of a worktree, and reading it back        |
| `score.ts`      | scoring one patch against the fix, and deciding validity       |
| `record.ts`     | the record one saved stream and patch imply                    |
| `session.ts`    | running (case, arm, replicate) in a worktree, and filing it    |
| `rescore.ts`    | rebuilding records from saved streams and patches              |
| `preflight.ts`  | the ground-truth checks that run before any quota is spent     |
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
- **The index build is amortized out, and it is not free.** A fresh worktree
  has no index, so one is built before every codedocs run: 223 seconds over
  12,519 files, for 527k symbols and 728k call edges, in a process no metric
  reads. Each question the run then asks costs about four seconds. Carrying one
  run's index into the next would cut that, and is deliberately not done — an
  index a run built is state the next run would inherit, which is what the
  per-run worktree exists to prevent. A single-question user never recovers the
  build; a working session does, several times over. The per-run numbers assume
  the session, and the build cost is stated here rather than buried in them.
- **One repository, one model, one task shape, three replicates.** Enough to see
  whether an effect is there and whether the spread swamps it. Not enough for a
  confidence interval, and not evidence about repositories unlike vscode.
- **Whether the fix is correct is not measured.** A run that changed every
  ground-truth file may still have written the wrong change inside it, and it
  scores as a hit. Judging the patch needs a judge model; this measures what the
  patch touched, and what the search for it cost.
