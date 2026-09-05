---
status: proposed
---

# A trim flag that shrinks the envelope, not the truth it carries

PRD §18 names round trips and repeated envelope boilerplate as the cost worth cutting — the same
target [ADR 0014](0014-multi-subject-batching.md) cut for a call over several subjects. This is the
other half of that cost: even a single-subject answer carries fields an agent that already trusts
codedocs rarely reads twice — `snapshot.analysedAt`, a `typed` row in `conditions` that says nothing
went wrong, a `resolved` id that already equals the subject it was asked about. A `--trim` flag is the
proposal to drop those, on request, from `--json` output alone.

The risk it has to be designed against is specific: ADR 0001 and ADR 0006 exist because an answer that
looks complete while quietly omitting something is worse than one that says less. Trimming has to
remove only what a caller can reconstruct or never needed, and never touch the three channels ADR
0006 already named as not to be blurred — a blind spot, a truncation, or a scope exclusion.

## The rule: reconstructible or redundant, never a fact

Something is trimmable only if one of two things is true about it:

- **It is reconstructible.** The caller can derive it from what the untrimmed shape already promises,
  or from the default it already knows it didn't override.
- **It is redundant in the specific state it's in.** A `typed` fidelity row says "nothing to report"
  the same way ADR 0006 already lets the human renderer's index header go quiet on a clean answer —
  the fact is real, but a _positive_ result on this particular field carries no information the
  absence of a warning didn't already carry.

Neither test is about size. `result` is never trimmed by either rule — it is the operation's own
payload, and ADR 0006 already makes it the one thing that may differ per operation; shrinking it here
would be a second, competing idea of what "the answer" is, decided per flag rather than per operation.

Candidates that pass:

- `snapshot.analysedAt` — the caller has `commit` and `dirty` already, and `analysedAt` names a
  timestamp nobody has been observed branching on.
- A `conditions` row with `fidelity: "typed"` — kept when `syntactic`, because that is the one value
  this field exists to surface.
- `request.scope.include` when it is exactly the default (`authorship: authored`, no `exclude`) —
  reconstructible precisely because it is a fixed, documented default rather than a guess.

## What never trims

- `blindSpots`, `budget`, and any per-subject `excluded` — ADR 0006's three honesty channels. A
  trimmed answer must still be able to say "you didn't get everything" exactly as loud as the
  untrimmed one does.
- `request.resolved` (or, for ADR 0014's six batched operations, each entry's `resolved`) — this is
  what makes an answer reproducible and what lets a caller feed a shorthand back in as a `SymbolId`.
  Dropping it even when it looks like it "equals the subject" breaks the one case it doesn't: an
  ambiguous subject, where `resolved` is the whole point of the field.
- `error` and its `params` — a failure is never trimmed, on the same reasoning `report-bug` already
  applies to itself: the one thing an operation owes when it cannot answer is the reason, in full.

## Where it applies, and how a caller knows it happened

Proposed: `--trim` is machine-renderer only, refused without `--json` the same way `--claims` already
is — the human renderer already omits the header on a clean answer and stays terse by construction, so
there is nothing left for it to trim.

The open question this ADR does not yet answer is the same one ADR 0014 had to answer for batching:
**the shape must not silently depend on whether `--trim` was passed.** Two options, neither decided
here:

1. `request` gains a `trimmed: boolean`, so a caller comparing two calls — or a `report-bug`
   reproduction — can always tell which shape it is holding.
2. Trimming is fully lossless in the sense that every dropped field has a fixed, stated default a
   caller can substitute back in without asking codedocs again — making the two shapes
   interchangeable by construction rather than by a flag a reader has to notice.

(1) is cheaper and safer; (2) is closer to "the same envelope" ADR 0006 promises. Leaning toward (1)
unless there's a reason to prefer otherwise.

## Open questions for review

- **Does trim apply to every operation, or only where the boilerplate actually multiplies** — the six
  batched operations, where N subjects each carry a full `resolved`/`budget`/`blindSpots` set?
- **Flag name** — `--trim` reads as PRD §18's own word for this problem, but check it doesn't collide
  with intent elsewhere.
- **`conditions` rows beyond fidelity** — `postinstall` and `cause` ride along on a `syntactic` row
  today; do they trim independently, or does a `syntactic` row always come whole once it's not
  dropped?
- Anything else that looked droppable and isn't listed above should be argued in, not assumed in —
  the two-test rule is meant to be the thing that decides it, not a running list.

Once this is settled, it needs the same `schemaVersion` treatment ADR 0014 got only if `trimmed`
becomes a new top-level field; if trimming turns out to be fully reconstructible (option 2 above), it
may not need one at all.
