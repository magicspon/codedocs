---
status: accepted
---

# A baseline is recorded by normal use, never constructed, and never leaves the machine

ADR 0004 put a [[Baseline]] in `.codedocs/base/<commit>.db` and left retention open. This decision
closes it, and the framing in the ticket — "22.9 s is unacceptable interactively and fine in a
scheduled job" — turned out to be the wrong axis. **Rebuilding a baseline is not slow, it is
impossible at usable fidelity.** A `git worktree add --detach` of cal.com at `HEAD~60` takes **1.71 s**
for 7,696 files and 216 MB, and the tree it produces has **no `node_modules`**. ADR 0001 forbids
codedocs running the install, so every file in that worktree is `syntactic` — no types, no call graph,
which is precisely what a comparison wants.

So a baseline exists only because codedocs analysed that commit **while it was the working tree**. It
is copied out of `index.db` as a side effect of `analyse` over a clean tree, capped at three, evicted
oldest-first after non-ancestors, and never transferred between machines.

The other reason to keep this small: [#11](https://github.com/magicspon/codedocs/issues/11) placed the
baseline's value narrowly. Subject matching — the matcher shipping first — needs no baseline; a
baseline buys `shape-hash` matching, which catches a symbol renamed inside a file that never moved and
covers the **8% of cal.com renames below 70% similarity** where git's own detection gives up. **A
missing baseline therefore degrades an answer, it does not block one**, which makes this whole
mechanism an optimisation rather than infrastructure, and it is specified at that size.

## Capture, and why there is no command

Capture is a side effect of `codedocs analyse`, exactly as the live index is. When the working tree is
clean, the finished `index.db` is copied to `base/<commit>.db` — 20 MB and 9 ms on cal.com. The
clean-tree gate is not new machinery: it is the [[Drift]] detection ADR 0004 already runs before every
answer, and it is forced by the vocabulary, since a [[Snapshot]] is a commit _plus whatever is
uncommitted on top of it_ while a [[Baseline]] is an index for a **commit**.

There is no `baseline save` operation. An explicit save asks the user to predict, a week in advance,
which commit they will later want to compare against; they reach for a comparison _after_ the work,
never before. ADR 0006 refused `init` on the same ground — nothing left for it to do once the
surrounding decisions made the store self-creating — and prices every new operation at a manifest
entry, three bindings, a documented exit code and reference docs.

Implicit capture is also the only thing that makes the next section work: "the nearest stored ancestor"
means nothing unless something has been quietly accumulating ancestors. The merge base is, by
construction, a commit the developer once had checked out clean.

## Which baseline an answer uses

The caller may name a commit. The default is the merge base with the default branch, which is right for
a two-day branch and wrong for a month-old one — so the resolved answer is **the newest stored baseline
that is an ancestor of `HEAD`**, seeded by asking for the merge base.

When the requested commit has no baseline and an older ancestor is used instead, that is
**substitution**, and it is reported through ADR 0006's **scope** channel, never as a [[Blind spot]]:
the [[Envelope]] carries the commit requested, the commit used, and the distance between them in
commits. Evicting non-ancestors first is also the entire branch-switching story — a baseline for
yesterday's abandoned branch tip is an ancestor of nothing, so it is worthless to this rule and leaves
first, with no branch tracking anywhere.

## A baseline built under different analysis conditions

ADR 0001 makes [[Fidelity]] a property of a file in a snapshot, and ADR 0004 puts the
[[Environment fingerprint]] in the cache key per project. A baseline captured before an install, and a
working tree analysed after it, differ in ways that are the environment moving, not the repository.

**A change in fidelity is never a finding.** Files whose fidelity differs across the two snapshots are
excluded from the comparison and reported as blind spots naming the cause, with ADR 0001's remediation.
A file that was `syntactic` then and is `typed` now has not changed; the analysis has. The exclusion is
per project, as ADR 0006's conditions block already is — cal.com has 34 projects, and a fingerprint
change in one of them must not silence the other 33.

## Retention

| Rule           | Value                                                          |
| -------------- | -------------------------------------------------------------- |
| Cap            | **3** baselines                                                |
| Unit           | count, not bytes and not days                                  |
| Eviction order | anything not an ancestor of `HEAD`, then oldest by commit date |
| When           | at capture                                                     |
| Mutability     | written once; thereafter read or deleted, never updated        |
| Configuration  | `codedocs.jsonc`, one integer; `0` disables capture entirely   |

The unit is a count because **capture is per clean-tree `analyse`, not per commit**, so the cap is
denominated in the user's own work sessions. cal.com's own velocity has swung from **28 commits a day**
(November 2025) to **1.15 a day** (207 in the last 180 days), which makes `HEAD~20` 45 days back today
and under two days back a year ago. A disk budget or an age cap lets that swing decide how many
baselines a developer keeps; a count does not.

The cap must exceed one. With a single slot, pulling and analysing evicts the commit you branched
from — the one baseline the previous section wants most. Three covers that commit, one pull since, and
one more, at 60 MB on the largest fixture.

**Three is a guess, and this ADR says so.** PRD §28 rules out telemetry, so the evidence accrues in
front of the user instead: `doctor` reports how many baselines are held and how far `HEAD` is from the
newest, and every substitution already names its distance. The revisit trigger is stated in words —
**the first Phase 5 measurement of how often a comparison substitutes, and by how far.**

## Considered Options

- **Rebuilding a baseline from git on demand.** Rejected on measurement, and not for the reason the
  ticket assumed. The checkout is cheap — 1.71 s — but it produces a tree with no `node_modules`, and
  ADR 0001 forbids codedocs running the install to fix that. The rebuild does not cost 22.9 s of the
  right answer; it costs 22.9 s of a syntactic one, diffed against a typed working tree, which is the
  fidelity failure above wearing a different hat.
- **Rebuilding into a worktree that borrows the main tree's `node_modules`.** Rejected on measurement:
  **20 of cal.com's last 300 commits touch `yarn.lock`** and 84 touch a `package.json`, so borrowing is
  a lie about roughly one commit in fifteen — and `yarn.lock` did change across `HEAD~60..HEAD`, 245
  insertions. The failure mode is the one ADR 0001 exists to prevent: types resolved against the wrong
  dependency set while the fidelity label still reads `typed`.
- **A `baseline` operation.** Rejected: see above. The command would be built and never called, because
  the moment a user wants a baseline is after the moment it had to be taken.
- **Transferable baselines, so a CI job can produce one for developers.** Rejected, and it narrows the
  CI argument that supported the previous point. Paths would survive — ADR 0002 stores `File`
  repository-relative — but the environment fingerprint would not, and a fingerprint mismatch excludes
  the file from the comparison, so an imported baseline is 20 MB fetched to answer nothing.
  [#6](https://github.com/magicspon/codedocs/issues/6) also found `NodeHandle.path` is case-normalised,
  so a macOS-built and a Linux-built index disagree about paths in a way that reads as a move. ADR
  0004's "never leaves the machine that built it" extends to baselines verbatim. The CI recipe is real
  and serves **CI's own comparison** — the pull-request check — not the developer's machine.
- **Exactly one baseline.** Rejected: the first pull-and-analyse after branching evicts the merge base,
  which is the commit the resolution rule asks for.
- **A disk budget, or an age cap in days.** Rejected: both let repo velocity decide the policy, and
  cal.com alone spans a 24× swing in velocity inside its own history.
- **Pinning a commit's baseline against eviction.** Rejected for now: a pin needs an operation or a flag
  on `analyse`, and ADR 0006 makes both expensive, for a feature whose only consumer is unbuilt. The
  `codedocs.jsonc` integer covers the objection people actually have, which is 60 MB appearing in their
  repository.
- **Migrating a baseline across a schema version.** Rejected, as ADR 0004 rejected it for the live
  index: a migration's failure mode is a subtly wrong comparison. The cost is stated in Consequences
  rather than hidden, because here it is worse than for the live index — a baseline cannot be rebuilt.
- **Updating or repairing a baseline.** Rejected as meaningless rather than unwanted. [[Drift]] is
  defined against a working tree and a baseline has none; its snapshot is a commit, and a commit does
  not change. A partial baseline — ADR 0004 commits per project, so an interrupted build leaves one —
  is a baseline with fewer projects, whose missing projects are the fidelity exclusion above by another
  route.
- **Exit 2 when no baseline exists.** Rejected: ADR 0006 reserves exit 2 for a question that could not
  be answered, and the absence of a baseline costs one matcher, not the answer.

## Consequences

- **codedocs never creates a git worktree, under any flag.** This is ADR 0001's rule reaching one step
  further than that decision stated it: not only does codedocs not execute the repository's code, it
  does not manufacture a tree in which that code would have to be installed for the analysis to mean
  anything.
- **The CI story is narrower than it first looks.** A scheduled job may check out a commit, install and
  analyse, and it gets a baseline for **its own** comparisons. Nothing carries that to a developer.
- **Upgrading codedocs costs every baseline.** A schema or tool version bump discards them exactly as it
  discards the live index, and — unlike the live index — they cannot be rebuilt. Normal use is the only
  thing that brings them back, and the first comparison after an upgrade substitutes or reports the
  absence.
- **A missing baseline is a blind spot on an otherwise complete answer**, at exit 0. This is the
  finding that sizes the whole decision: baseline retention is an optimisation over one matcher, not
  infrastructure, and nothing else in the product may come to depend on a baseline being present
  without revisiting this.
- **A baseline sits outside ADR 0004's concurrency story rather than extending it.** Because it is
  immutable, nothing ever holds a write lock on `base/*.db`, and the 9 ms copy is safe with no
  additional rule.
- **At capture, `base/<commit>.db` duplicates `index.db`.** Accepted: 20 MB for the most valuable
  baseline there is, since it is the commit the developer is about to start working on top of.
- **`codedocs.jsonc` gains its second block**, after ADR 0003's `classify`. Two decisions have now each
  added one narrow knob, which is evidence that the file is accreting rather than needing a design of
  its own — a data point for the map's open question about it, not an answer to it.
- **`doctor` gains a line**: how many baselines are held, and the distance from `HEAD` to the newest.
  That is the only place the guessed cap can be observed, and it phones nothing home.
- **Capture needs one thing from ADR 0004 that is invisible from that side**: `analyse` must know
  whether the tree was clean _for the snapshot it just indexed_, and copy before any subsequent write.
- **`docs check` is untouched.** It needs no baseline, so nothing in this decision reaches the only
  operation shipping before Phase 5.
