---
status: accepted
---

# Continuity is two inferred matchers, ranked by evidence and never by a score

Recognising that `AuthService.login` today is last week's `AuthService.login` is a **separate inferred
layer** that never touches the `SymbolId`, exactly as ADR 0002 recorded. This decision says what is in
it: **two matchers with different inputs**, a **third group of `Derivation` values** that carries the
uncertainty, and a **ranked candidate list** as the only output shape. There is no confidence score
anywhere, and there is no verdict of `deleted`.

Three findings reshaped the design. **94% of renamed files arrive in a batch**, so a directory sweep is
one fact rather than 596 coincidences. **The primary signal needs no second index**: from a dead path,
git names the destination in under 200 ms. And **git's own rename detection silently gives up** on
large diffs, which makes it a signal to own rather than a service to call.

## The two matchers

They share an output shape and a vocabulary, and nothing else. Presenting them as one interface that
degrades would hide that the missing signal is the decisive one.

|                      | **Subject matching**                                                      | **Snapshot matching**     |
| -------------------- | ------------------------------------------------------------------------- | ------------------------- |
| Starts from          | a [[Claim]] subject that no longer resolves                               | two [[Index]]es           |
| Needs a [[Baseline]] | no                                                                        | yes                       |
| Consumer             | `docs check`                                                              | `impact`, Phase 5         |
| Signals              | `git-rename`, `content-hash`, `name-in-head`                              | all eight                 |
| Cannot see           | a symbol renamed inside a file that never moved, unless its name survives | nothing this layer models |

Subject matching is built now. Snapshot matching is specified now and built with `impact`, because
`shape-hash` is the only signal that catches a rename inside a stable file, and the **8% of renames
below 70% similarity** are precisely where git gives up.

**Subject matching runs a two-step git probe first.** Find the commit that deleted the path (14 ms on
cal.com), then ask that one commit what it did (153 ms), and git answers
`R075 apps/api/v2/.../team-event-types-response.transformer.ts -> apps/api/v2/.../output-team-event-types-response.pipe.ts`.
That returns the destination path and git's own similarity score with no stored state. `git log
--follow` costs 465 ms and answers a different question.

## The derivations and their precedence

A third group in ADR 0002's `Derivation` enum, not a parallel type. Ordered strongest first; this
ordering **is** the ranking rule.

| Derivation            | Fires when                                                            | Matcher  |
| --------------------- | --------------------------------------------------------------------- | -------- |
| `content-hash`        | the file at the new path is byte-identical to the old one             | both     |
| `path-prefix-rewrite` | the file moved inside a directory sweep, corroborated by its siblings | both     |
| `git-rename`          | git's `-M` matched the file, carrying git's own similarity score      | both     |
| `shape-hash`          | two symbols across snapshots have an equal shape hash                 | snapshot |
| `descriptor-suffix`   | they agree on SCIP descriptor class                                   | snapshot |
| `declared-name`       | they agree on declared name                                           | snapshot |
| `name-in-head`        | a symbol of the subject's name exists somewhere in the current index  | subject  |
| `call-site-overlap`   | their edges overlap — **tie-break only, outside the ranking**         | snapshot |

`content-hash` leads because identical bytes involve no heuristic at all, and it is not a corner case:
**46% of cal.com's renames are byte-identical**, 33% land at 90–99% similarity, 13% at 70–89%.
`path-prefix-rewrite` outranks `git-rename` because it _is_ a git rename plus 595 siblings agreeing
with it, and that corroboration is the thing git cannot give you on its own.

`name-in-head` and `declared-name` are not duplicates. The first is one-sided — all subject matching
can ever have — and the second compares a past symbol with a present one. Collapsing them would let
the weaker inherit the stronger's rank.

## The candidate

One output shape for both matchers: a **ranked list of zero to n [[Candidate]]s**, each carrying its
derivations, the resolved destination, and the commit where the rename happened. No match-kind enum,
because ADR 0005 measured `searchParams` matching two candidates in one fixture and a list was the
only honest answer.

**An empty list means "no candidate found", stated in those words, and never "deleted".** ADR 0002
makes deletion only ever an absence, and an absence with no candidate is indistinguishable from a move
the matcher failed to see. This is the honest failure case the ticket was opened about.

Ranking is **lexicographic over the derivation set** by the precedence above: strongest derivation
wins, ties fall through to the next, then to how many fired, and finally to `SymbolId` lexically so
the order is total rather than merely mostly-total, per ADR 0006.

## Considered Options

- **A confidence score.** Rejected: `CONTEXT.md` tells [[Provenance]] to avoid the words confidence,
  certainty and trust level, and [[Completeness]] to avoid confidence score and accuracy. A percentage
  on a rename would be the first score in a product that has refused every other one. The sharper
  consequence is that **any signal producing a continuous value forces a threshold, and a threshold is
  a score wearing a different hat** — which is what ruled out signature similarity, edit distance on
  names, and fuzzy body comparison. Every signal here is boolean.
- **Claiming zero thresholds.** Rejected as dishonest: git's `-M` is itself a similarity heuristic with
  a 50% default. codedocs inherits **exactly one** threshold and names whose it is — the derivation is
  `git-rename` and the score reported is git's.
- **Inheriting git's rename configuration.** Rejected on measurement: over 2,000 cal.com commits, git
  reports 352 renames and prints `exhaustive rename detection was skipped due to too many files`.
  Raising `diff.renameLimit` finds **574**. The default silently loses 39% of renames, at 0.16 s
  against 1.9 s. Every git knob is a codedocs constant, never read from the user's `gitconfig`, or the
  same question answers differently on two machines and ADR 0006's byte-identical reproducibility is
  a fiction.
- **Matching each renamed file independently.** Rejected on measurement: across cal.com's last 300
  rename-carrying commits, **2,312 of 2,452 renamed files (94%) moved alongside a sibling**, dominated
  by directory sweeps — 596 files `packages/features -> apps/web`, 257 `packages/lib ->
packages/features`. Only 140 of 300 commits carried a lone rename. Per-file matching re-derives one
  conclusion 596 times, reports it 596 times, and discards the corroboration that makes it strong.
  Redwood's four-sibling Cell rename is the normal shape of a rename, not a curiosity.
- **One matcher that degrades when a baseline is absent.** Rejected: ADR 0005 says `docs check` needs
  no baseline, and its own evidence is baseline-free — "12 of 20 have the same name elsewhere in
  `HEAD`" is a lookup in the current index. A single degrading interface would hide that `shape-hash`
  is missing rather than weak, and would push `docs check` toward wanting a baseline it was designed
  not to need.
- **A continuity operation.** Rejected for now: ADR 0006 closed the operation set and adding a member
  is deliberately expensive. Continuity has one consumer today and a second in Phase 5. The operation
  enum is versioned, so adding `where-did-this-go` later is additive if demand appears.
- **Persisting a match table** keyed by the two snapshots, which can never go stale because the inputs
  are immutable. Rejected twice over: it is a third derived artifact layered on two derived artifacts
  with its own eviction, which is the complexity ADR 0004 spent a whole decision avoiding; and a match
  table on disk with a stable key **is a symbol identity in all but name**, which is exactly what ADR
  0002 refused to build.
- **`impact` traversing through a match.** Rejected: it lets an `inferred` fact silently expand a
  result the caller believes is deterministic, with no way to tell which branches were real. Gating on
  "only traverse a strong enough match" reintroduces the banned threshold, and a two-candidate match
  has no single branch to traverse into anyway. `impact` reports the candidate and stops.
- **Suppressing `name-in-head` above some candidate count.** Rejected: another threshold, failing in
  the direction that costs most. The measured tail is short — **30% of cal.com's exported function
  declarations share a name** (595 of 1,960 across 247 names) but the worst offender is `_function` at
  14, then `getServerSideProps` at 10. Suppression would turn a partial answer into silence exactly
  when a document's subject is a common name, producing the bare `unable to verify` this layer exists
  to avoid.
- **Emitting the repair sentence.** Rejected: ADR 0006 deleted `docs generate` on the principle that
  codedocs writes no prose. The candidate carries fields; the human renderer formats a fixed template
  over them, which is what "pure function of the [[Envelope]]" means. An agent repairing a claim wants
  the fields anyway, since it has to rewrite a shorthand rather than read English.
- **Matching non-durable symbols.** Rejected as a rule rather than left to fall out. `impact` will meet
  them — 14% of the Next.js fixture's call edges end at a local — and a local's id is unstable under
  edits that are not renames at all, so a match on one is noise dressed as a finding.

## Consequences

- **Two matchers, one output shape.** Subject matching (git probe, then `name-in-head`) ships with
  `docs check`. Snapshot matching is specified and waits for `impact`. Both return the same ranked
  [[Candidate]] list.
- **Continuity is always on, and demand-driven.** It runs for the subjects an answer needs, never as a
  cross-product of two indexes, so cost is proportional to the question rather than to the repository
  and the existing budget field covers it with no new concept. A developer running `docs check` does
  not pass a flag to get the one useful sentence in the output.
- **The git probe is primary and name matching is the fallback**, which is the reverse of what ADR 0005
  sketched. "This file was renamed to `src/middlewares/withAuth.ts` in commit `ab21c7f`" is evidence;
  "a symbol of that name exists elsewhere" is a hint. Name matching covers only what git cannot
  explain, which is the in-file rename.
- **An unstaged move is invisible to git and must be bridged.** A moved-but-unstaged file reports as
  `D a/mid.ts` plus an untracked directory; git cannot pair a tracked deletion with an untracked file.
  Staged moves report `R100`. Since ADR 0004 defines a [[Snapshot]] as a commit plus what is
  uncommitted on top of it, the layer would otherwise be blind in the state a developer occupies
  mid-refactor. It is bridged with `content-hash` alone — no new heuristic, and the case most likely
  to be byte-identical because nothing has been edited yet.
- **This places a requirement on ADR 0004's [[Drift]] repair**, invisible from that side: the drift
  computation must hand the **removed files' content hashes** to this layer before evicting them.
  Once repair has run, the vanished file's hash is gone from the index and the bridge above cannot
  work. Where content also changed, return zero candidates and name the cause.
- **This places a requirement on ADR 0004's storage**: symbols keyed by **descriptor leaf name** for
  subject matching, and by **shape hash** for snapshot matching. Both are keyed lookups the index must
  offer. The absence of such a key should fail review rather than let a linear scan ship quietly,
  because a scan breaks the promise that cost is proportional to the question.
- **Nothing is persisted and nothing is cached.** Matches are recomputed on demand; 167 ms per
  unresolved subject is inside any budget, and unresolved subjects are rare by construction.
- **The candidate list is capped and the overflow reported through [[Truncation]]**, not through
  suppression. The ranking is what makes the cap safe: `name-in-head` is the weakest derivation, so a
  candidate carrying only that never outranks a `content-hash`, and a list of 14 weak candidates reads
  as weak on its face.
- **Local symbols are never a subject and never a candidate.** When `impact` reaches one, it reports a
  named absence in the zero-candidate form.
- **Ticket #14 is unblocked and narrowed.** Baseline retention is driven by `impact` alone, because
  `docs check` — the only consumer shipping before Phase 5 — needs no [[Baseline]] at all.
- **Acceptance is three named properties, and agreement with git is not one of them.** Git's `-M` is a
  heuristic, so it is a baseline to beat and a source of test cases, not an oracle. On a directory
  sweep the layer emits one `path-prefix-rewrite` fact where git emits N, checked against the 596-file
  `packages/features -> apps/web` move. The byte-identical cases resolve to a single candidate carrying
  `content-hash` and nothing weaker. And a curated set of genuinely indistinguishable cases must return
  **zero candidates** — a layer that never says "I do not know" has not been tested for the thing this
  decision is about. Disagreements with git are recorded with a reason, never scored.
- **`docs affected` needs no change.** A renamed file is a changed file, so the document is re-checked
  and subject matching fires through the normal path.
- **Adding these derivations is a schema change**, which ADR 0002 already answers: a full rebuild, no
  migration, reported when it fires.
