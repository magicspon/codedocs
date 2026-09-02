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
`cases/*.json`. The short version:

| Case      | Level | What sets the level                                                                    |
| --------- | ----- | -------------------------------------------------------------------------------------- |
| `#333230` | 1     | the stack trace names the file on eight frames; the cause is one hop away inside it    |
| `#331102` | 2     | one private symbol named, no file; the rest is callers within one contribution         |
| `#333085` | 2     | one file, but nothing in the report is an identifier — the anchor is a product noun    |
| `#332885` | 3     | two files in different layers, joined through a provider interface                     |
| `#331452` | 4     | a migration's treatment of an unavailable catalog: lifecycle, and no identifier at all |

Five cases over four levels is a spread, not a sample. Level 2 holds two cases
that are hard for different reasons — one starts from a symbol, the other from a
noun — and level 4 holds one. Read a per-level delta as a direction, and read
the case rows underneath it before believing the direction.
