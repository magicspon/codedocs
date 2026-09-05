---
status: proposed
---

# The inward walk needs a subject, and `trace` is where the direction flag belongs

`trace` walks outward from a symbol. `impact` walks inward from a diff. The fourth quadrant —
**inward from a symbol somebody named** — is the one question in the set that nothing answers, and it
is the question asked _before_ an edit rather than after one: what reaches this, and which tests
cover it, if I change it.

`callers` answers one hop of it. ADR 0006 already ruled that one hop is what an editor gives you and
an aggregate is what codedocs adds, so the gap is the aggregate. `docs/agent-guide.md` currently sends
a caller with this question to "`callers` or `trace`", and half that sentence is wrong: `trace` walks
the other way.

[#121](https://github.com/magicspon/codedocs/issues/121) asks for the missing quadrant. The decision
is that **`trace` gains a direction**, defaulting to outward, rather than a `reaches` operation being
added beside it.

## Reopening the comment that refused this

`packages/core/src/operations/trace.ts` refuses a direction flag in as many words:

> The walk is outward — what does this call, and what does _that_ call. There is no direction flag:
> the inward aggregate is `impact`, which ADR 0006 puts in Phase 5 with a baseline behind it, and a
> flag here would pre-empt that design with the half of it that happens to be cheap.

That was right when it was written and it is spent now. `impact` shipped, and what it settled was the
inward walk **seeded by a [[Baseline]] comparison**. Its seeds are the symbols a diff touched, its
envelope carries a `baseline` block, and [[Impact]] is defined in the glossary as "what a change could
reach". None of that answers a question about a symbol nobody has changed yet. The half that "happens
to be cheap" turned out to be the half `impact` does not contain.

## Why this is not a second traversal

ADR 0012 refused `affected-tests` because it "would be a second traversal to keep in step with
`impact` for the rest of the project's life", and ADR 0006 absorbed `walkthrough` into `trace` for the
same reason. Both rulings are about **duplicated machinery**, not about how many questions one
operation may answer.

A direction flag adds no traversal. It is the existing walk reading the edge table from the other
side — `readCallerSteps` where there is `readCalleeSteps` — with the same cycle handling, the same
`--depth` cut, the same [[Path]] result unit and the same sort key. A `reaches` operation would be the
duplication the two earlier rulings forbid; the flag is what avoids it.

The test-scoping consequence follows ADR 0012's own precedent rather than breaking it. Which tests
reach a symbol is:

```sh
codedocs trace 'CheckoutService.charge' --inbound --label role=test
```

— a [[Scope]] filter over an existing walk, exactly as `impact --label role=test` is, and still not an
operation of its own.

## A path knows which way it runs

`TraceStep` stores only `to`, because "a field that repeats a fact is a field that can disagree with
it" — the step's source is the previous step's `to`. Reversal keeps that property: an inbound step's
`to` is the caller, and the path reads from the root back towards whatever reaches it.

What must not happen is a consumer holding a path that cannot say which way it points. So
`request.direction` is echoed on the envelope with every answer, `outward` or `inward`, present on
both directions rather than only the unusual one — a field that appears only when something is
non-default is a field a parser learns to ignore. The human renderer draws the arrow the way the walk
ran.

## The inbound walk is the less honest direction, and has to say so

This is the part that decides whether the flag is worth having.

An outward walk that misses an edge under-reports what a function does. An inbound walk that misses an
edge under-reports **who depends on it**, and the caller is usually about to act on the answer by
changing something. Unresolved call sites, dynamic dispatch and calls through a string key all remove
callers from the inbound answer, and cal.com's own numbers — 26,091 call edges against 89,619
unresolved call sites — say the missing fraction is not small.

So an inbound answer carries the [[Blind spot]]s of the sites it could not resolve **within the
subtree it walked**, not merely at the root, and the human renderer must not let an empty result
render as a bare "nothing". An empty inbound trace means _no caller was resolved_, which ADR 0006
already fixed as the meaning of an empty `trace`; it does not mean the symbol is unreferenced. That
sentence belongs in the agent guide next to the flag.

## Considered Options

- **A `reaches <subject>` operation.** Rejected: it is the second traversal ADR 0012 refused for
  `affected-tests`, and the operation set grows by one for an answer that differs from an existing one
  by the direction it reads an index table.
- **`impact --subject X`.** Rejected on two counts. `impact`'s envelope carries a `baseline` block and
  a diff it compared against; a subject-seeded run has neither, so the field would have to be nulled
  and the answer would be an `impact` that did not do the thing [[Impact]] is defined as. And the
  glossary term would have to widen from "what a change could reach" to cover a hypothetical, which
  makes a settled word ambiguous to save adding a flag elsewhere.
- **Leaving it to `callers`, called repeatedly.** This is the status quo. Rejected because walking a
  graph client-side over N round trips is the cost PRD §18 names, and because a hand-rolled walk
  loses the cycle terminus, the depth cut and the blind-spot accounting that make the answer readable.
- **Making the flag `--callers` rather than `--inbound`.** Rejected: an inbound walk crosses
  [[Edge]]s that are not calls — `references`, `extends`, `implements` — the same widening `impact`
  needed, and naming the flag after one edge kind would promise less than the walk does.

## Consequences

- **`trace.ts`'s header comment is superseded** and must be rewritten in the same commit, citing this
  ADR. It is currently the only written record of the refusal, and leaving it standing would make the
  code argue with the decision.
- **`docs/agent-guide.md`'s hypothetical-question sentence becomes correct.** "For the hypothetical
  question, use `callers` or `trace`" becomes `trace --inbound`, and gains the empty-result warning
  above.
- **The MCP `trace` tool gains a parameter**, not a tool. ADR 0006's one-tool-per-operation rule is
  untouched; this is the argument widening ADR 0014 already established as permitted.
- **`--depth` matters more than it does outward.** A busy symbol has more callers than callees in most
  repositories, so the guide's "bound it with `depth`" advice applies harder in this direction.
- **[[Path]] gains a direction in `CONTEXT.md`**, if this is accepted. The current definition says
  "one walk outward from a root symbol" and would become one walk in the direction the request names.
- **`trace` still does not batch subjects.** ADR 0014 listed the six operations that take a subject
  list, and `trace` is deliberately not among them; a direction flag does not reopen that.
