# Difficulty levels

Every case carries a level from 1 to 4. The level says **how much of the
repository an agent must understand to answer**, and nothing else.

The benchmark's claim is that the benefit of codedocs grows with structural
complexity. A table that does not group by difficulty cannot show that: a saving
on a case where the file is handed over and a saving on a case where the cause
is three components away are averaged into one number that says neither.

## Lines changed is not a difficulty signal

The size of the eventual patch is excluded on purpose, and so is the number of
files it touched.

A one-character fix can require understanding an entire subsystem: `#331452` is
answered by a single file, but only after the reader has worked out that a
migration accepted an unavailable catalog as success. A large patch can require
understanding nothing: a mechanical rename touches fifty files and demands no
model of any of them.

Lines changed measures the fix. This benchmark measures the search.

## What the level does measure

Six dimensions, weighed together rather than scored:

| Dimension                     | The question it asks                                                                                                                     |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Files involved**            | How many source files must be named for the answer to be complete?                                                                       |
| **Projects crossed**          | Does the answer stay inside one project, or span layers that only meet at an interface?                                                  |
| **Call-graph depth**          | How many call hops separate the code that reports the symptom from the code that causes it?                                              |
| **Abstractions in the way**   | Do dependency injection, events, contribution points or interfaces stand between the two, so the edge is not in the text?                |
| **Lifecycle relationships**   | Must the reader understand ownership, lifetime or ordering — which component owns this state, and when — rather than a static structure? |
| **Symptom-to-cause distance** | How far is what the report describes from what must change? A named frame is zero; a behaviour with no identifier in it is far.          |

No dimension decides a level on its own. A case with two files can outrank a
case with four, if the two sit in different layers and the four sit side by side.

## The levels

### Level 1 — local

The report points at the code. One file, one project, and the cause is inside
what the report already named, or one hop from it in the same file.

An agent that reads the named file carefully answers correctly. Discovery is
almost free for both arms, which is what makes level 1 the control: a benchmark
whose every case favours the tool is a brochure.

### Level 2 — one subsystem, no address

The answer is still one file in one project, but nothing in the report names it.
The agent has to get there — from a symbol, a log line, or a product noun — and
then work out which part of the file the behaviour lives in.

The search is a lookup plus a local traversal: find the anchor, then follow
callers or read the neighbourhood. Everything needed sits inside one subsystem.

### Level 3 — across layers

The answer spans files in different projects or layers, and the call path
between them runs through an interface, a service or an event rather than a
direct call.

The agent cannot finish by reading one file: it has to hold two ends of a path
at once and establish that they are connected. This is where a call graph is
supposed to pay, because the edge it needs is precisely the edge that grep
cannot see.

### Level 4 — a relationship, not a location

The cause is not in a place; it is in how components relate over time —
ownership of state, ordering, a lifecycle transition, a migration. The report
describes a behaviour and contains no identifier that points at code.

Reaching the answer means reasoning about the states the system passes through,
not just about which function calls which. Level 4 is not level 3 with more
files: a level 4 case may be answered by a single file, and still be the hardest
case in the set.

## The current cases

Each case records its own reasoning in the `difficulty.why` field of its
`cases/*.json`, and the seed it was written from lives in `seeds/level<N>.ts`.
The short version:

| Case      | Level | What sets the level                                                                        |
| --------- | ----- | ------------------------------------------------------------------------------------------ |
| `#333230` | 1     | the stack trace names the file on eight frames; the cause is one hop away inside it        |
| `#329610` | 1     | the stack lands inside the guilty function; one rule of one abstraction to apply           |
| `#331914` | 1     | the reporter names the file, permalinks the method and states the mechanism                |
| `#331102` | 2     | one private symbol named, no file; the rest is callers within one contribution             |
| `#333085` | 2     | one file, but nothing in the report is an identifier — the anchor is a product noun        |
| `#327194` | 2     | the anchor is a settings key; the answer is a schema declaration nothing calls             |
| `#332885` | 3     | two files in different layers, joined through a provider interface                         |
| `#332146` | 3     | two files joined by a browser event: a viewport part and the layout pass that ignores it   |
| `#326185` | 3     | a configured value followed across a process boundary into a child process's environment   |
| `#331452` | 4     | a migration's treatment of an unavailable catalog: lifecycle, and no identifier at all     |
| `#329074` | 4     | a window's identity across two processes; every word of the report points at the wrong one |
| `#329326` | 4     | ordering: a closing view outlives its own disposal and takes focus back                    |

Twelve cases, three per level. That is a pilot, not a sample: three cases can
show a direction and cannot establish an effect size, so read a per-level delta
as a direction and read the case rows underneath it before believing it.

The spread within a level is deliberate. Level 1 holds one case whose file is
handed over by a crash and one whose file is handed over by a reporter who had
already done the search, because those are different kinds of free. Level 2
holds three anchors that behave differently under search — a symbol, a product
noun and a settings key. Level 4 holds two single-file cases and one that is
single-file only because the migration it concerns lives in one service.

The pool also spreads across the repository — `base/`, `code/electron-main/`,
`platform/extensionManagement/`, `platform/agentHost/`, `sessions/` and three
different `workbench/` areas — because a pool that repeatedly tests one corner
measures that corner rather than the repository.
