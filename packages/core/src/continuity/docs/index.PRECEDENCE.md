# PRECEDENCE

<!--
Drafted by codedocs from `PRECEDENCE` at commit de6cabf595e36451831bd01446b46b68ea87fa14: 2 sections.

codedocs wrote no prose. Everything below is a fact read from the index, and
the paragraphs are yours. Each `codedocs?:` comment is a *candidate* claim:
delete the `?` to endorse it, and `docs check` verifies it from then on.
Until you endorse one, this file is not a document and nothing checks it.
-->

## PRECEDENCE

This `PRECEDENCE` is [ADR 0007](../../../../../docs/adr/0007-cross-commit-continuity.md)'s ranking
for **subject continuity**: when a claim's subject (a file or symbol a document
names) no longer resolves, `continuationOf` in this file asks git and the
current index where it went, and returns a list of candidates rather than a
single guess. `PRECEDENCE` decides which candidate that list trusts most.

Strongest first: `content-hash` (git reports the rename as `R100` — byte-
identical, so no heuristic is involved at all), `path-prefix-rewrite` (a git
rename corroborated by siblings that moved the same directory rewrite in the
same commit), `git-rename` (git's rename detection alone), `name-in-head` (no
git evidence — just a durable symbol elsewhere in the current index sharing
the subject's name). `rank` turns a derivation into its index in this array,
so a derivation absent from it (there is none here — every `Derivation` git
continuity can produce is listed) would sort last rather than first.

The order matters because of two things downstream, both in this same file.
`merge` unions the derivations a candidate collects from different routes (a
rename can be both `content-hash` and `path-prefix-rewrite` at once) and keeps
them sorted by `rank`, and `byEvidence` sorts the whole candidate list
lexicographically over that ranked derivation array — strongest signal first,
falling through to the next only on a tie. That ordering is what makes
`CANDIDATE_LIMIT`'s cap of 10 safe: a candidate held up only by `name-in-head`,
the weakest derivation, can never crowd out one with git evidence behind it.

A `variable` declared at `packages/core/src/continuity/index.ts:75`, analysed at `typed` fidelity.

- **Names without calling**
  - `packages/core/src/model.ts#Derivation` (packages/core/src/continuity/index.ts:75, typeReferences)
- **Named by**
  - `packages/core/src/continuity/index.ts#rank` (packages/core/src/continuity/index.ts:83, references)
  - `packages/core/src/continuity/index.ts#rank` (packages/core/src/continuity/index.ts:84, references)
- **Labels**
  - `role=source` on `packages/core/src/continuity/index.ts` (inferred: default)
  - `authorship=authored` on `packages/core/src/continuity/index.ts` (deterministic: git-untracked)
  - `authorship=authored` on `packages/core/src/continuity/index.ts` (inferred: default)

<!-- codedocs: exists(packages/core/src/continuity/index.ts#PRECEDENCE) -->
<!-- codedocs: usesType(packages/core/src/continuity/index.ts#PRECEDENCE, packages/core/src/model.ts#Derivation) -->
<!-- codedocs: references(packages/core/src/continuity/index.ts#rank, packages/core/src/continuity/index.ts#PRECEDENCE) -->

## PRECEDENCE

A second, unrelated `PRECEDENCE` — same name, same shape (a ranked
`Derivation[]` feeding a `rank` helper), different question. This one is
[ADR 0003](../../../../../docs/adr/0003-repository-structure-classification.md)'s
label precedence: which signal decides a file's `role` or `authorship` when
several fire on the same axis (`user-config`, `git-untracked`,
`generated-header`, `codegen-path`, `path-convention`, `tsconfig-exclude`,
`default`, strongest first). `effective` in the same file is the consumer —
see [`effective.effective.md`](../../labels/docs/effective.effective.md) for
how it uses this ordering to collapse the label store to one value per axis.

The two `PRECEDENCE` constants never call each other and share no code beyond
the pattern: each module owns its own closed derivation set and its own
`rank`, because ADR 0003's classification signals and ADR 0007's rename
signals are answering different questions and a shared table would let an
unrelated addition to one silently reorder the other.

A `variable` declared at `packages/core/src/labels/effective.ts:26`, analysed at `typed` fidelity.

- **Names without calling**
  - `packages/core/src/model.ts#Derivation` (packages/core/src/labels/effective.ts:26, typeReferences)
- **Named by**
  - `packages/core/src/labels/effective.ts#rank` (packages/core/src/labels/effective.ts:37, references)
  - `packages/core/src/labels/effective.ts#rank` (packages/core/src/labels/effective.ts:40, references)
- **Labels**
  - `role=source` on `packages/core/src/labels/effective.ts` (inferred: default)
  - `authorship=authored` on `packages/core/src/labels/effective.ts` (deterministic: git-untracked)
  - `authorship=authored` on `packages/core/src/labels/effective.ts` (inferred: default)

<!-- codedocs: exists(packages/core/src/labels/effective.ts#PRECEDENCE) -->
<!-- codedocs: usesType(packages/core/src/labels/effective.ts#PRECEDENCE, packages/core/src/model.ts#Derivation) -->
<!-- codedocs: references(packages/core/src/labels/effective.ts#rank, packages/core/src/labels/effective.ts#PRECEDENCE) -->
