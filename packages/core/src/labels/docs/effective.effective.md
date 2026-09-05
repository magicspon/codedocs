# effective

<!--
Drafted by codedocs from `effective` at commit de6cabf595e36451831bd01446b46b68ea87fa14: 1 section.

codedocs wrote no prose. Everything below is a fact read from the index, and
the paragraphs are yours. Each `codedocs?:` comment is a *candidate* claim:
delete the `?` to endorse it, and `docs check` verifies it from then on.
Until you endorse one, this file is not a document and nothing checks it.
-->

## effective

The label store can hold several label facts for the same node and axis — a
file can be `git-untracked` (deterministic) and separately match a
`*.generated.*` path convention (inferred), both settling `authorship`. `effective`
collapses that store to one value per node per axis: the value a caller should
actually treat the node as having, plus the label that won so an answer can
name the rule that decided it.

It works in two passes. First it groups every label by node, then by axis,
and for each group keeps only the label whose `derivation` ranks highest in
[ADR 0003](../../../../../docs/adr/0003-repository-structure-classification.md)'s
precedence table (`user-config` first, `default` last — see `PRECEDENCE` in
`effective.ts:26`). Ties are impossible by construction: `rank` is a strict
`<` comparison, so the first label seen for a derivation keeps its slot.
Second, it reads the winning `role` and `authorship` label's value out of
each node's map, falling back to `DEFAULTS` (`role: source`,
`authorship: authored`) for either axis nothing fired on — the same defaults
ADR 0003 specifies for "nothing fired".

The result is a `Map<FilePath, EffectiveLabels>` built once per query rather
than per node, because callers like `callers` ask the same "is this a test
file" question across every edge in the answer — `classification` and
`openSession` both call it to label every node before filtering, in one pass
over the whole label set rather than one lookup per node.

A `function` declared at `packages/core/src/labels/effective.ts:64`, analysed at `typed` fidelity.

- **Calls**
  - `packages/core/src/labels/effective.ts#rank` (packages/core/src/labels/effective.ts:75)
  - `packages/core/src/labels/effective.ts#rank` (packages/core/src/labels/effective.ts:75)
- **Called by**
  - `packages/core/src/operations/classification.ts#classification` (packages/core/src/operations/classification.ts:52)
  - `packages/core/src/session/open.ts#openSession` (packages/core/src/session/open.ts:179)
  - `packages/core/test/labels.test.ts#decide` (packages/core/test/labels.test.ts:93)
- **Names without calling**
  - `packages/core/src/labels/effective.ts#DEFAULTS` (packages/core/src/labels/effective.ts:83, references)
  - `packages/core/src/labels/effective.ts#DEFAULTS` (packages/core/src/labels/effective.ts:85, references)
  - `packages/core/src/labels/effective.ts#EffectiveLabels` (packages/core/src/labels/effective.ts:66, typeReferences)
  - `packages/core/src/labels/effective.ts#EffectiveLabels` (packages/core/src/labels/effective.ts:80, typeReferences)
  - `packages/core/src/labels/effective.ts#effective.byAxis` (packages/core/src/labels/effective.ts:70, references)
  - `packages/core/src/labels/effective.ts#effective.byAxis` (packages/core/src/labels/effective.ts:71, references)
  - `packages/core/src/labels/effective.ts#effective.byAxis` (packages/core/src/labels/effective.ts:72, references)
  - `packages/core/src/labels/effective.ts#effective.byAxis` (packages/core/src/labels/effective.ts:74, references)
  - `packages/core/src/labels/effective.ts#effective.byAxis` (packages/core/src/labels/effective.ts:76, references)
  - `packages/core/src/labels/effective.ts#effective.found` (packages/core/src/labels/effective.ts:82, references)
  - `packages/core/src/labels/effective.ts#effective.found` (packages/core/src/labels/effective.ts:89, references)
  - `packages/core/src/labels/effective.ts#effective.held` (packages/core/src/labels/effective.ts:75, references)
  - `packages/core/src/labels/effective.ts#effective.held` (packages/core/src/labels/effective.ts:75, references)
  - `packages/core/src/labels/effective.ts#effective.label` (packages/core/src/labels/effective.ts:69, references)
  - `packages/core/src/labels/effective.ts#effective.label` (packages/core/src/labels/effective.ts:72, references)
  - `packages/core/src/labels/effective.ts#effective.label` (packages/core/src/labels/effective.ts:74, references)
  - `packages/core/src/labels/effective.ts#effective.label` (packages/core/src/labels/effective.ts:75, references)
  - `packages/core/src/labels/effective.ts#effective.label` (packages/core/src/labels/effective.ts:76, references)
  - `packages/core/src/labels/effective.ts#effective.label` (packages/core/src/labels/effective.ts:76, references)
  - `packages/core/src/labels/effective.ts#effective.winners` (packages/core/src/labels/effective.ts:69, references)
  - `packages/core/src/labels/effective.ts#effective.winners` (packages/core/src/labels/effective.ts:72, references)
  - `packages/core/src/labels/effective.ts#effective.winners` (packages/core/src/labels/effective.ts:81, references)
  - `packages/core/src/model.ts#Authorship` (packages/core/src/labels/effective.ts:85, typeReferences)
  - `packages/core/src/model.ts#FilePath` (packages/core/src/labels/effective.ts:66, typeReferences)
  - `packages/core/src/model.ts#FilePath` (packages/core/src/labels/effective.ts:80, typeReferences)
  - `packages/core/src/model.ts#Label` (packages/core/src/labels/effective.ts:65, typeReferences)
  - `packages/core/src/model.ts#Label` (packages/core/src/labels/effective.ts:67, typeReferences)
  - `packages/core/src/model.ts#LabelAxis` (packages/core/src/labels/effective.ts:67, typeReferences)
  - `packages/core/src/model.ts#Role` (packages/core/src/labels/effective.ts:83, typeReferences)
- **Labels**
  - `role=source` on `packages/core/src/labels/effective.ts` (inferred: default)
  - `authorship=authored` on `packages/core/src/labels/effective.ts` (deterministic: git-untracked)
  - `authorship=authored` on `packages/core/src/labels/effective.ts` (inferred: default)

<!-- codedocs: exists(packages/core/src/labels/effective.ts#effective) -->
<!-- codedocs: calls(packages/core/src/operations/classification.ts#classification, packages/core/src/labels/effective.ts#effective) -->
<!-- codedocs: calls(packages/core/src/session/open.ts#openSession, packages/core/src/labels/effective.ts#effective) -->
<!-- codedocs: calls(packages/core/test/labels.test.ts#decide, packages/core/src/labels/effective.ts#effective) -->
<!-- codedocs: calls(packages/core/src/labels/effective.ts#effective, packages/core/src/labels/effective.ts#rank) -->
<!-- codedocs: references(packages/core/src/labels/effective.ts#effective, packages/core/src/labels/effective.ts#DEFAULTS) -->
<!-- codedocs: usesType(packages/core/src/labels/effective.ts#effective, packages/core/src/labels/effective.ts#EffectiveLabels) -->
<!-- codedocs: usesType(packages/core/src/labels/effective.ts#effective, packages/core/src/model.ts#Authorship) -->
<!-- codedocs: usesType(packages/core/src/labels/effective.ts#effective, packages/core/src/model.ts#FilePath) -->
<!-- codedocs: usesType(packages/core/src/labels/effective.ts#effective, packages/core/src/model.ts#Label) -->
<!-- codedocs: usesType(packages/core/src/labels/effective.ts#effective, packages/core/src/model.ts#LabelAxis) -->
<!-- codedocs: usesType(packages/core/src/labels/effective.ts#effective, packages/core/src/model.ts#Role) -->
