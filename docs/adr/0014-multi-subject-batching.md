---
status: accepted
---

# A subject list, keyed the same way whether there is one or many

`symbol`, `evidence`, `callers`, `callees`, `references` and `file` each take **one subject**.
[#118](https://github.com/magicspon/codedocs/issues/118) asks them to take several, so that an agent
holding a list of symbols — six matches from `symbol '*Repository'`, or the set `impact` just named
as reached — pays one round trip and one [[Envelope]] instead of N of each. PRD §18 and §33 both name
this exact shape of cost — round trips and repeated envelope boilerplate, not just the size of one
answer — as the thing codedocs exists to cut.

The decision is that `request.subject` becomes `request.subjects`, and the **`result` of a batched
operation is always an array keyed by subject, whether one subject was passed or many.** Each keyed
entry carries its own `resolved`, `budget` and `blindSpots`; the top-level `budget` and `blindSpots`
disappear from these six operations. This is a `schemaVersion` bump, not an additive field, and it is
deliberately not conditional on how many subjects a given call happened to pass.

## Why the shape can't depend on batch size

The alternative — keep today's flat envelope when one subject is passed, and only nest by subject
once a second one is added — was the first thing considered and it fails for the same reason ADR
0006 already gave for `--limit`: **a capped answer an agent cannot tell is capped is a wrong answer
with a footnote.** An envelope whose shape silently depends on the number of arguments the caller
happened to type is the same trap wearing a different field. A parser written against a one-subject
call breaks the day someone batches two, with no signal at the call site that anything changed.
Keying by subject unconditionally means the shape is a property of the _operation_, per ADR 0006's
own definition of what an operation is, not of how it was invoked.

## Budget, truncation and blind spots don't pool across subjects

ADR 0006 already settled this question once, for a narrower case: `evidence` returns several kinds
at once and applies `--limit` **per kind**, "because a shared pool means adding a caller quietly
evicts a document." Subjects in a batch are the same shape of problem one level up — a shared budget
across subjects would mean whether subject B's results survive depends on how much subject A used,
which makes the answer depend on **argument order**, and ADR 0006's ordering rule is explicit that
nothing about an answer may depend on "insertion order." So `--limit`, [[Truncation]] and
[[Blind spot]]s are reported per subject, not pooled, for the identical reason already on record —
this ADR is applying it, not inventing it.

[[Scope]] is different in kind, not degree: `--label`/`--exclude-label` describe the question being
asked, once, for the whole call — not a property of any one subject — so they stay a single setting.
What's per-subject is the **excluded count**, for the same non-blurring reason as budget: a pooled
count would hide that one subject's entire result set was excluded behind a small-looking aggregate
number.

## Naming subjects, plural

`request.subjects` echoes the literal strings passed, in the order given. `request.resolved` becomes
one entry per input — `[{ subject, resolved: SymbolId[] }, …]` — rather than a flat list of resolved
ids. This keeps two multiplicities that must not blur into one: **how many subjects were asked
about** (fixed, from the input) and **how ambiguous any one of them turned out to be** (variable, an
existing subject may still resolve to several `SymbolId`s under ADR 0006's "an ambiguous subject is
not an error" rule). Flattening both into one list of resolved ids, as a naive extension of today's
shape would do, makes it impossible to tell which resolutions came from which input once any subject
is ambiguous.

## What doesn't change

`trace` and `impact` are untouched — neither is in scope for batching, so `--depth` doesn't enter
into this decision. `docs check`, `docs affected`, `doctor`, `analyse` and `report-bug` take no
subject at all today and stay that way. No operation gains the ability to call another: a batched
`evidence` call is still one operation answering its own question for several inputs, not `evidence`
composing with anything, so this doesn't reopen the composition question ADR 0006 already closed for
`impact`/`review`.

## Considered Options

- **Nest only once a second subject is passed.** Rejected above: the shape becoming a function of
  argument count recreates the exact "answer that doesn't say what it is" problem ADR 0006 refused
  for default limits.
- **Pool `--limit`/budget/blind spots across the whole batch.** Rejected: this is the per-kind
  mistake ADR 0006 already ruled out for `evidence`, reappearing one level up: an evicted result
  whose eviction depends on what else was in the same call.
- **Leave `subject` singular and let batching stay an agent-side concern** (issue N shell-outs,
  merge the envelopes yourself). This is the status quo the issue was filed against; rejected because
  PRD §18/§33 name the round-trip and envelope-repetition cost itself as the target, not just the
  size of one answer, and merging N independently-truncated envelopes client-side can't recover the
  ordering or budget guarantees a single per-subject-keyed answer keeps intact.

## Consequences

- **Every existing `--json` consumer of these six operations breaks on the schema bump.** The
  README's own documented `callees` example — a flat `budget`/`result` — stops being accurate and
  needs updating alongside the implementation.
- **`report-bug`'s reproduction command** (ADR 0011) needs to reproduce a batched invocation
  faithfully — the repro line must carry the full subject list, in order, not just the first one.
- **MCP tool schemas for these six operations gain an array-typed `subjects` parameter.** Still one
  tool per operation, same name, so ADR 0006's MCP rule is unchanged — this widens an argument type,
  it does not add a tool.
- **The human renderer gains a per-subject grouping** for N > 1, which ADR 0006 already permits
  ("may group... never re-sort or withhold silently") without needing a rule change of its own.
- **`symbol`'s glob matching and batching are orthogonal**: a batched call can mix literal subjects
  and glob patterns, each resolving independently into its own keyed entry.
