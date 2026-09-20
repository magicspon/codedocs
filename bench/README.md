# The fix benchmark

One question: **does codedocs let an agent reach the same fix while reading less
of the repository?**

Not "is the agent smarter with it". Smarter is not measurable here. What is
measurable is the cost of getting to the code that has to change — tokens
processed, tools called, exploration steps taken, files opened, lines of source
read, seconds spent — and whether the arm holding codedocs pays less of it.

**Where this sits.** [ADR 0012](../docs/adr/0012-audience-and-the-fallow-boundary.md)
makes the reader of codedocs a developer, and an agent one more caller of the
same operations. So what this benchmark measures is not the product's validation
criterion — that is [#21](https://github.com/magicspon/codedocs/issues/21), a
developer question answered correctly that ripgrep and an editor could not
answer at all, and it was deliberately rescoped away from the agent-against-agent
framing used here. This is a second measurement, of a second claim, and it
carries a confound #21 names: it depends on a model and a prompt, neither of
which this project controls. Read it as evidence about agents holding the tool,
never as evidence that the tool is correct or useful to a person.

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

That is measured exactly, against a patch the VS Code maintainers wrote, and it
says only what the run _touched_. Whether the change is right is a separate
question with no exact answer, because a correct fix has many valid shapes — so
it is put to a judge, and the judge's verdict is reported beside the exact score
rather than in place of it. See [Judging the fix](#judging-the-fix).

## What an arm is

An arm is a **toolset paired with a model**, named `toolset@model` — for
instance `codedocs@haiku-4-5`. Any number of them run in one invocation.

|              | baseline                                       | codedocs                                   |
| ------------ | ---------------------------------------------- | ------------------------------------------ |
| Tools        | Read, Grep, Glob, Bash, TodoWrite, Edit, Write | the same                                   |
| Extra prompt | none                                           | ~150 tokens describing the five operations |
| Index        | ignored                                        | already built                              |

The model belongs to the arm rather than to the session, because the second
question the benchmark exists to ask is whether structural facts let a cheaper
model do work that otherwise needs a dearer one. That is a comparison between
arms differing in both halves, and it cannot be posed while one model is fixed
across the session:

```sh
node bench/src/run.ts --arms baseline,codedocs                  # like for like
node bench/src/run.ts --arms baseline@claude-opus-5,codedocs@claude-haiku-4-5-20251001
```

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
no patch at all. The report prints how many were thrown out, and why.

**That third rule has a bias in it, and it runs towards the tool.** On an easy
case the right move is not to reach for codedocs — the stack trace names the
file, so the agent opens it and fixes it — and that run is then discarded. So
the surviving codedocs runs are not a random sample of codedocs runs: they are
the ones where the agent judged the tool worth using. The alternative is worse,
because counting a run with no tool in it as evidence about the tool measures
nothing at all, but the effect is real and it is strongest on exactly the
control cases that exist to keep the benchmark honest. `#329610` is the first
case to show it: both arms grepped, opened one file and fixed it, and the
codedocs run was discarded for never calling codedocs.

### Take-up, and why the bias is reported rather than repaired

The decision taken on that bias (issue #112) is to **report it, in two parts**.
Neither corrects for it. Both stop it being read past.

**Take-up is a reported figure.** Every run records whether it called codedocs
at all, and `RESULTS.md` prints how often each arm did, per level. On the
codedocs arm that is take-up, and a rate below 1 is a finding rather than a
hole — the agent held the tool and did not want it. On the baseline arm the same
number is contamination. This converts the discard from missing data into a
measurement, and it answers a question the benchmark could not otherwise ask:
_when does an agent reach for structural facts at all?_

**Every pooled figure says which cases it rests on**, wherever the two arms do
not rest on the same ones. A pooled row over two baseline cases against one
codedocs case is not a like-for-like delta, and the note sits directly under the
number rather than in a limits section at the end.

Two alternatives were weighed and rejected:

- **Pool only the cases both arms produced a valid run on.** Makes the
  aggregates like-for-like, at the cost of dropping cases silently — and on the
  current set it would delete a level 1 control for doing exactly what a control
  exists to do. A case that vanishes because the tool went unused is the same
  bias, moved somewhere harder to see.
- **Count the unused-tool run anyway, marked.** Rejected outright: it puts a run
  with no tool in it on the tool's side of the comparison, which is the one
  thing the discard rule exists to prevent.

Take-up is counted over _every_ run of an arm, not only the counted ones,
because the runs it describes are precisely the ones thrown out. Records written
before the flag existed are silent about it and are left out of the denominator
rather than guessed at; `node bench/src/run.ts --rescore` fills them in from the
saved stream, for nothing.

Every delta in the report is read against one **reference arm**, named under the
table's header: the baseline arm with the most runs behind it — a run with no
tool in it, on the model the session leaned on. One reference for the whole
report means every percentage in it answers the same question. A block the
reference did not run in prints no delta rather than a misleading one.

## The cases

**Prospects and the running set.** Every researched case is frozen into
`prospects/`. Only the ones `src/cases/active.ts` names are run, preflighted or reported
on — `node bench/src/writeup/writeup.ts` counts the running set, not the pool.

The split is about cost, not about quality. Every codedocs run needs an index of
its own fresh worktree, and building one on vscode is minutes with a long tail.
The [index cache](#the-index-cache) means a case costs one build however many
times it is run — but that is still a cost per case, so the pool is researched
wide and run narrow, and prospects are promoted as there is budget to index and
run them.

The running set today is `#333230` and `#329610` — both level 1 controls, both
cases where the file is handed over in the stack trace and codedocs should
therefore buy little. Starting where the tool is least likely to look good is
deliberate. The write-up says in its own words that a set inside one level
cannot show the gradient the whole hypothesis is about.

Every case, run or not, satisfies the same three conditions, each verified
rather than assumed:

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

| Case                             | Level | Shape          | The report gives you                                      | Truth                                         |
| -------------------------------- | ----- | -------------- | --------------------------------------------------------- | --------------------------------------------- |
| [#333230](prospects/333230.json) | 1     | `file-named`   | a stack trace naming `listView.ts` on eight frames        | `listView.ts`                                 |
| [#329610](prospects/329610.json) | 1     | `file-named`   | a stack landing inside the guilty function                | `chatAttachmentWidgets.ts`                    |
| [#331914](prospects/331914.json) | 1     | `file-named`   | the file, the method and the mechanism, from the reporter | `mainThreadEditorTabs.ts`                     |
| [#331102](prospects/331102.json) | 2     | `symbol-named` | one private method name, `_resumeReconnects`              | `tunnelAgentHost.contribution.ts`             |
| [#333085](prospects/333085.json) | 2     | `symptom-only` | an agent created an automation nobody asked for           | `automationTools.ts`                          |
| [#327194](prospects/327194.json) | 2     | `symbol-named` | a settings key, `extensions.allowed`, and a warning       | `extensionManagement.ts`                      |
| [#332885](prospects/332885.json) | 3     | `symbol-named` | log lines that stop after "reading provider metadata"     | `agentService.ts`, `copilotAgent.ts`          |
| [#332146](prospects/332146.json) | 3     | `symptom-only` | a keyboard covering a chat input on Android               | `mobileVisualViewport.ts`, `workbench.ts`     |
| [#326185](prospects/326185.json) | 3     | `symbol-named` | a settings key, `http.noProxy`, that is not what is read  | `copilotAgent.ts`, `copilotCliEnvironment.ts` |
| [#331452](prospects/331452.json) | 4     | `symptom-only` | sessions vanished after an update; no identifiers at all  | `agentService.ts`                             |
| [#329074](prospects/329074.json) | 4     | `symbol-named` | dictation failing in a floating window                    | `code/electron-main/app.ts`                   |
| [#329326](prospects/329326.json) | 4     | `symptom-only` | a quick pick that closes itself when opened from a menu   | `contextview.ts`                              |

Three cases per level, and the spread is the point. `#333230` and `#329610` are
controls: the file is handed over on a plate, so codedocs should buy little, and
a benchmark whose every case favours the tool is a brochure. `#333085` is the
case where grep on a product noun may well win, and it is kept for exactly that
reason. `#329074` is the opposite extreme — every word of the report points at
speech code and the answer is in the main process.

The pool spreads across `base/`, `code/electron-main/`,
`platform/extensionManagement/`, `platform/agentHost/`, `sessions/` and three
`workbench/` areas, because a pool that repeatedly tests one corner of the
repository measures that corner rather than the repository. Seeds live in
`src/cases/seeds/level<N>.ts`, one file per level; `DIFFICULTY.md` says what each level
means and why each case sits where it does.

Ground truth is the non-test source files the upstream fix _modified_. Test
files are excluded, and the prompt tells the agent not to write any:
the truth is source, and a run that spent its turns on a test would be measured
on work no case scores.

## One tree per run

Every run gets its own checkout: a detached `git worktree` at the case's base
commit, created before the agent starts and removed when it ends. Four seconds
and 550 MB, one at a time.

Two things need that. A case is only a real bug at the commit under its fix, and
the cases share no such commit — they were fixed over seven weeks, so no single
checkout sits before all twelve fixes. And a tree the agent writes to has to be
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

### The index cache

A fresh worktree has no index either, so the codedocs arm's has to be put there
before the agent starts, in a process the benchmark is not measuring.

Building it every time is the same work over and over. An index is a pure
function of the tree it describes, and every replicate of a case reads the same
commit — so the build happens **once per commit**, into
`repos/.index-cache/<commit>/`, and later runs at that commit copy it in.

```sh
node bench/src/run.ts --warm     # build the cache for the running set, run no agent
```

This is not the state leak the per-run worktree exists to prevent. A cached
index is only ever taken from a tree no agent has touched — the warm step runs
before the agent starts and copies out the moment the build finishes — so what
a later run receives is what a fresh build at that commit would have produced,
and never anything an earlier run wrote.

Restoring is not free either, and the reason is worth knowing: `git worktree
add` writes every file with a new mtime, so every file's stat signature differs
from the one the index recorded and codedocs hashes each to find the content
identical. That pass costs seconds where a build costs minutes, and it happens
in the warm step, so the run under test never pays it.

Both numbers are printed beside the verdict and named — `index built 213s` or
`index restored 5s` — because they differ by orders of magnitude and an
unlabelled number invites the wrong one to be quoted. No metric reads either.

The cache trades disk for time: one commit's index of vscode is 254 MB, so the
full twelve-case pool would be around 3 GB. It lives under `repos/`, which is
git-ignored, and deleting it costs only the rebuild.

`node bench/src/execution/verify-cache.ts` checks the trade is real — that each case restores
rather than silently rebuilding, and that the restored index still answers for a
ground-truth symbol. A cache that is present but stale would otherwise look
exactly like a repository in which codedocs can find nothing.

The figures quoted further down come from the run set measured on the earlier
localization task, when the agent named files instead of changing them and every
case read one pinned checkout. They are kept because they are the evidence
behind decisions this harness still makes, and each is labelled where it
appears. They are not fix-task results. The only fix-task runs so far are one
replicate of `#333230` on each arm, which proved the path end to end: both hit,
both were judged `correct`, the codedocs patch graded `same-change` against the
baseline's `same-area`, and the codedocs arm cost more on every axis. One
replicate of the control case is a smoke test, not a result.

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
| `fix`    | runs a judge read as fixing the bug, over the runs it read                        |
| `sim`    | how close those patches sat to the upstream fix                                   |
| `agree`  | how much the judge's own readings agreed with each other                          |

The first six are the cost of getting to the code. `hit` and `sym` are exact,
computed from the patch and the upstream fix. `fix`, `sim` and `agree` are a
judge's opinion, and the table says so in its header so the two are never read
as one kind of number.

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
changed, in the `@@` header above one, or in the declaration that change sits
under — inside a ground-truth file.** The declaration is the nearest context
line above the first changed line that looks like one, which is how a change
inside a method is credited to the method rather than to the class the hunk
header names. The rest of the context is excluded: a patch that edits one method
three lines under a call to another would otherwise be credited with both, and
the same method edited in the wrong file is not the code the fix changed.

`sym` is what separates landing in the same code from landing in the same file,
and on `#333230` it does exactly that. Both arms changed `listView.ts` and both
score a hit. The codedocs run clamped the range inside `getVisibleRange`, which
is where the maintainers fixed it; the baseline run clamped the array length
downstream in `probeDynamicHeights`, one hop from the cause. `sym` reads 1 and 0.

The rule is still blind to a change buried deep inside a long method whose
declaration is further above it than the hunk's context reaches. Applied to the
twelve upstream fixes themselves it names a ground-truth symbol in ten of the
twelve, so read `sym` as a floor on both arms rather than as a hit rate. `hit`
remains the score.

A span-accurate rule would need the symbol boundaries of each ground-truth file,
which means parsing the tree at scoring time. It is worth doing when the case
pool is larger; it is not worth doing to sharpen a secondary column over twelve
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

## Judging the fix

`hit` cannot tell a correct fix from a plausible edit in the right file, and a
correct fix has many valid shapes — which is why the benchmark avoided the fix
task until there was a judge for it.

Every valid run's patch is read by a model that is shown exactly three things:
the issue the agent was given, the fix the maintainers wrote over the case's
ground-truth files, and the patch itself. It returns two grades and its
reasoning.

**correctness** — does the patch fix the reported bug?

| Grade       | Meaning                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------- |
| `correct`   | the reported failure no longer happens, and nothing the report calls working is broken      |
| `partial`   | part of the failure, or one path of several — or the symptom stopped while the cause stands |
| `incorrect` | the failure remains, or the change introduces a new fault                                   |

**similarity** — how close is it to the fix the maintainers wrote?

| Grade            | Meaning                                                       |
| ---------------- | ------------------------------------------------------------- |
| `same-change`    | the same edit, allowing for naming, formatting and comments   |
| `same-mechanism` | the same cause at the same point, by a different edit         |
| `same-area`      | the code involved, acted on at a different point in the chain |
| `unrelated`      | neither the cause nor the place                               |

The two axes are separate on purpose. The judge is shown the upstream fix, so
the rubric tells it in as many words that a patch reaching the same result by
another mechanism is still `correct` — otherwise "not what the maintainers
wrote" would collapse into "wrong", and the second axis would have nothing left
to say.

`#333230` is what the pair buys. Both arms hit, and both were judged `correct`.
The codedocs patch graded `same-change`: it is the maintainers' edit. The
baseline patch graded `same-area`, and the judge's own reasoning says why —
_"the candidate guards at the point of consumption in `probeDynamicHeights` …
inverted ranges could still flow to other consumers of `getVisibleRange`."_

### What the judge cannot see

The blinding is structural rather than a convention. The prompt is built from a
type holding an issue, an upstream fix and a patch; there is no arm, model or
run id in scope to leak into it, and both arms produce the same shape of input.

The judge has **no tools**. Not for tidiness — a judge that could read the
repository could find the fix, the tests around it, or the commit that landed
it, and would be grading its own search rather than the patch in front of it.

One tell survives, and it is a property of the diff rather than of the harness:
a patch that names `codedocs` in its own text says which arm wrote it. That is
recorded on the judgement as `selfIdentifying` rather than scrubbed out, because
a scrubbed diff is no longer the run's answer.

### Three readings, and what they disagree about

A single grade says nothing about how stable it is, and a result reported from
an unstable judge is a result about the judge. So each patch is read three
times. The consensus is the grade most readings gave; a tie breaks toward the
more conservative grade, so a split judgement never reads as the favourable one.
`agree` is the share of readings that matched, on whichever axis was the weaker.

The first two runs measured read 1.00 on similarity for both arms, and 0.67 on
correctness for the baseline patch: two readings called it `correct`, one called
it `partial`. That is the genuinely arguable case — it stops the crash without
fixing the inverted range — and the number records the disagreement instead of
hiding it behind a majority.

Every reading is kept: the grades, the reasoning, the tokens and the cost, in
`bench/judgements/`.

### What judging costs, and who pays

**Not the arms.** The judge's spend is printed on its own line under the table
and never enters either arm's cost per run. It is the price of measuring the
runs, not a cost either arm incurred, and folding it in would charge an arm for
being graded.

A first reading costs about $0.15 to $0.19; the two after it hit the prompt
cache and cost about $0.02 each, so three readings of one patch come to roughly
$0.20. A full twelve-case, two-arm, three-replicate set is therefore around $15
of judging on top of the runs themselves.

Judgements are filed under a hash of everything the judge was shown — the issue,
the upstream fix, the patch, the judge model and the rubric version. Two runs
that produced an identical patch share one judgement and it is paid for once,
which is why the report counts the bill per judgement and not per run. Revising
the rubric changes the key, so old grades are dropped rather than quietly mixed
in with new ones.

## The write-up

[RESULTS.md](RESULTS.md) is what the benchmark exists to produce, and
`node bench/src/writeup/writeup.ts` generates it from the records in `results/`. It is a
derived artefact and is never edited by hand.

Generated rather than written for one reason: there is no path through the
generator for a number that was not measured. A write-up that appears only once
the numbers are flattering is a brochure, and the way not to write one is to
have no way to. The prose that frames the tables — how much the set on disk
supports, how big the sample is — is computed from those same records, so a
caveat cannot go stale while the data underneath it changes.

**The two questions are reported in separate blocks**, never pooled:

- **like for like** — one model, holding the tool and not holding it. The claim
  codedocs is sold on.
- **a cheaper model holding the tool** — a different model on each side. Its
  deltas carry the models' difference as well as the toolset's, which is exactly
  why averaging the two blocks together would answer neither.

Each block gives every case a row per arm and the change between them, groups
those into difficulty levels, and covers requests, input, output and total
tokens, cost, tool calls, files, lines of source read, time, and correctness on
both the exact and the judged reading. Runs that were thrown out are counted by
arm, by level and by reason rather than folded into a total, and **Tool
take-up** prints how often each arm reached for codedocs at all — see [Take-up,
and why the bias is reported rather than repaired](#take-up-and-why-the-bias-is-reported-rather-than-repaired).

`src/reporting/report.ts` remains the quick console view. It reads every delta against a
single reference arm, which is only sound while one model ran — past that it
says so, and points here.

## Running it

```sh
node bench/src/run.ts                    # every case, both arms, 3 replicates
node bench/src/run.ts --cases 331102     # one case
node bench/src/run.ts --replicates 1     # a smoke run
node bench/src/run.ts --model claude-opus-5          # the default model for every arm
node bench/src/run.ts --arms baseline,codedocs@claude-haiku-4-5-20251001
node bench/src/reporting/report.ts                 # the comparison table
node bench/src/reporting/report.ts --json          # the same numbers, machine readable
node bench/src/writeup/writeup.ts                # regenerate RESULTS.md from the records

node bench/src/run.ts --warm             # build the index cache, run no agent
node bench/src/run.ts --judge            # judge the patches already on disk
node bench/src/run.ts --no-judge         # measure now, grade later
node bench/src/run.ts --judge-replicates 1           # one reading instead of three
node bench/src/run.ts --judge-model claude-sonnet-5  # a cheaper judge
```

`src/run.ts` refuses to start when a case's declared base is not the commit under
its fix, or when a file that fix touched is missing from that tree, because
either voids the ground truth. It fetches the commits the cases name, then
builds each codedocs run's index in that run's worktree, so the arm pays the
per-question cost rather than the cold build.

Each run leaves three files in `bench/results/`: `<case>-<arm>-r<n>.json`, the
record the report reads, where `<arm>` is the arm's `toolset@model` id; `.stream.jsonl`, everything the agent did; and `.diff`,
the patch it produced, readable and `git apply`-able as it stands. The
judgements it earns land separately, in `bench/judgements/`, under a hash of
what the judge was shown.

`run.ts --rescore` rebuilds every record from the streams and patches already on
disk. Scoring and validity are pure functions of those two, so a fix to either is
applied to past runs rather than paid for twice. Judgements survive it: the
record's grades are looked up again from the cache rather than copied across, so
a patch that has changed, or a rubric that has been revised, reads as unjudged
instead of carrying a stale verdict. `--resume` skips runs that already produced
a measurement.

`run.ts --judge` grades every valid patch on disk that is not yet graded, and
tops up any judgement that has fewer readings than asked for. A run and its
judgement are bought separately, so a judge that failed, a session that ran
`--no-judge`, or a set measured before there was a judge can each be brought up
to date for the price of the judging alone. Readings already cached are reused,
so it is safe to re-run.

`src/cases/freeze-cases.ts` regenerates `prospects/*.json` from the pool in `seeds/`,
fetching each issue body and each fix's parent commit from GitHub. It exists for
provenance and does not need to run: the cases are frozen, so a run asks GitHub
for nothing but the commits they name — never for an issue body someone may
have edited since. Adding a case means adding a seed to `src/cases/seeds/level<N>.ts` and
running the freezer; nothing under `prospects/` is edited by hand.

Freezing a case does not run it. `src/cases/active.ts` names the running set, and putting
a prospect in it is a deliberate act with hours of indexing attached — never a
side effect of researching a good case.

## How the harness is laid out

One module per seam, so a change to scoring does not sit in the same file as the
process spawning. Code lives under `src/`, grouped by what it's for; `prospects/`,
`results/` and `judgements/` are data, not code, and stay at the top level:

| Module                           | What it holds                                                                 |
| -------------------------------- | ----------------------------------------------------------------------------- |
| `src/core/paths.ts`              | where the benchmark reads and writes                                          |
| `src/core/types.ts`              | the shapes every other module passes around                                   |
| `src/core/arms.ts`               | an arm: parsing it, ordering it, and widening an older record                 |
| `src/core/argv.ts`               | command-line flag parsing shared by `src/run.ts` and `src/writeup/writeup.ts` |
| `prospects/`                     | every researched case, frozen                                                 |
| `src/cases/active.ts`            | which prospects are in the running set, and why it is small                   |
| `src/cases/cases.ts`             | the running set, and the whole pool behind it                                 |
| `src/cases/difficulty.ts`        | the levels, and the heading the report prints for each                        |
| `src/cases/freeze-cases.ts`      | regenerating `prospects/*.json` from the seed pool                            |
| `src/cases/seeds/`               | the pool the freezer works from, one file per difficulty level                |
| `src/execution/worktree.ts`      | a run's own checkout at its case's commit, and its removal                    |
| `src/execution/warm.ts`          | the index cache: build once per commit, restore into each run                 |
| `src/execution/prewarm.ts`       | filling that cache ahead of any run                                           |
| `src/execution/verify-cache.ts`  | proving a restored index is one a build would have produced                   |
| `src/execution/prompt.ts`        | the task, and the briefing the codedocs arm gets                              |
| `src/execution/agent.ts`         | spawning `claude -p` and collecting its stream                                |
| `src/execution/session.ts`       | running (case, arm, replicate) in a worktree, and filing it                   |
| `src/execution/preflight.ts`     | the ground-truth checks that run before any quota is spent                    |
| `src/execution/upstream.ts`      | the fix the maintainers wrote, as the judge is shown it                       |
| `src/scoring/tally.ts`           | what one run consumed: calls, steps, files, lines read, tokens                |
| `src/scoring/stream.ts`          | walking the stream and folding it into that tally                             |
| `src/scoring/diff.ts`            | taking the patch out of a worktree, and reading it back                       |
| `src/scoring/score.ts`           | scoring one patch against the fix, and deciding validity                      |
| `src/scoring/record.ts`          | the record one saved stream and patch imply                                   |
| `src/scoring/rescore.ts`         | rebuilding records from saved streams and patches                             |
| `src/judging/rubric.ts`          | the two scales, their definitions, and the blind prompt                       |
| `src/judging/judge.ts`           | spawning a judge with no tools, and reading one verdict back                  |
| `src/judging/judgement.ts`       | the judgement cache, the consensus and the agreement figure                   |
| `src/judging/rejudge.ts`         | filling in the judgements the runs on disk are missing                        |
| `src/reporting/summarise.ts`     | the medians one arm's runs become                                             |
| `src/reporting/comparisons.ts`   | the two questions — like-for-like, and across models                          |
| `src/reporting/table.ts`         | column widths, rows, and the delta beneath a non-reference arm                |
| `src/reporting/report.ts`        | reading `results/`, grouping by level, printing the comparison                |
| `src/reporting/markdown.ts`      | markdown tables, padded so the output is formatter-stable                     |
| `src/writeup/writeup-tables.ts`  | the tables `RESULTS.md` is made of                                            |
| `src/writeup/writeup-honesty.ts` | take-up, the discards, and what a pooled figure rests on                      |
| `src/writeup/writeup-prose.ts`   | the parts of `RESULTS.md` that are not numbers                                |
| `src/writeup/writeup.ts`         | assembling `RESULTS.md` from the records on disk                              |
| `src/run.ts`                     | the command line                                                              |

## What this does not show

- **Fidelity is `syntactic`, not `typed`.** VS Code has no `node_modules`
  installed, so all 91 projects index without a type checker. Call edges that
  resolve only through vscode's dependency-injection and interface layers are
  therefore missing. Installing would cost several gigabytes and make the
  benchmark far harder to reproduce. Read the result as a floor: typed fidelity
  can add edges, not remove them.
- **The index build is amortized out, and it is not free.** Indexing vscode is
  12,519 files, 527k symbols and 728k call edges, in a process no metric reads.
  Five builds have been timed: four between 186 and 223 seconds, and one at
  3,716. That outlier is unexplained, so treat the cost as minutes with a long
  tail rather than as a constant, and the restore that replaces it as 5. The harness builds each commit once and restores it into
  later worktrees, so what a run pays is the restore, and each question it then
  asks costs about four seconds. A single-question user recovers none of the
  build; a working session recovers it several times over. The per-run numbers
  assume the session, and the build cost is stated here rather than buried in
  them.
- **One repository, one task shape, three replicates.** Enough to see whether an
  effect is there and whether the spread swamps it. Not enough for a confidence
  interval, and not evidence about repositories unlike vscode. An arm carries its
  own model, so a session may vary that too — but every result on disk so far
  was measured on one.
- **Whether the fix is correct is one model's opinion.** `hit` and `sym` are
  exact; `fix` and `sim` are not, and never can be — a correct fix has many
  valid shapes, and deciding between them is a judgement. What the harness can
  do it does: the judge is blind to which arm wrote a patch, it has no tools to
  go looking with, it reads each patch three times, and the reasoning behind
  every grade is on disk to be argued with. What it cannot do is make the grades
  a measurement. Read `agree` beside them — where it is below 1.00, the judge
  disagreed with itself, and the honest reading of that cell is that the case is
  arguable rather than that the grade is wrong.
- **One judge, one rubric.** Every grade on disk comes from `claude-opus-5`
  under one set of definitions. A second judge model would say how much of a
  grade is the rubric and how much is the reader; nothing here has asked one.
  The rubric version travels with each judgement, so a revision drops the old
  grades rather than mixing them in.
