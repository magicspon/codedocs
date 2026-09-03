---
status: accepted
---

# Documents make claims, and every verdict has exactly one source

A **document** is any Markdown file in the repository carrying at least one **claim**: a checkable
assertion about the code, written inline next to the prose it justifies, drawn from a **closed set of
predicates** over ADR 0002's model. What a document points at is not declared — it is **derived** from
the claims it makes and the source files its prose links to.

PRD §11's four verdicts are then not a scoring rule but a routing table. Each has exactly one
producer: claims decide `verified` and `contradicted`, the derived scope produces `potentially
stale`, and ADR 0001's blind spots produce `unable to verify`. Nothing blends them.

The measurements come from four indexes of the Next.js fixture built at `HEAD`, `HEAD~20`, `HEAD~60`
and `HEAD~120` and diffed against each other, plus history statistics from cal.com.

## Pointers cannot decide staleness, measured

Per symbol in the older index, comparing what a pointer would flag against what actually changed:

|                                    | 20 commits | 60 commits          |
| ---------------------------------- | ---------- | ------------------- |
| symbols a `files:` pointer flags   | 125 of 307 | 178 of 268          |
| symbols a directory pointer flags  | 157        | 205                 |
| symbols that actually changed      | 40         | 138                 |
| **file-pointer false alarms**      | **71.2%**  | 59.0%               |
| **directory-pointer false alarms** | **77.1%**  | 64.4%               |
| **real breaks no pointer sees**    | 4 of 40    | **65 of 138 — 47%** |

The last row is the one that decides it. Symbols break without their own file being touched, because a
callee moved or was renamed somewhere else entirely, so a pointer is not merely noisy — it is blind to
nearly half the real breakage. And the noise is permanent: **all 500** of cal.com's last 500 commits
touch `packages/features/bookings`, and 417 touch `packages/features/ee/workflows`. A pointer written
there is a warning that fires forever and means nothing.

Meanwhile **266 of 285** surviving symbols had an identical call-edge set after 20 commits. Most of
what a document describes is still true, and only a claim can say which part.

## What a claim is

A closed set, one entry per thing ADR 0002 and ADR 0003 already model. It is closed for the reason the
edge enum is closed: adding a predicate forces the question "which backend actually produces this?".

| Predicate                            | Asserts                                                | Backed by               |
| ------------------------------------ | ------------------------------------------------------ | ----------------------- |
| `exists(a)`                          | the subject resolves to exactly one node               | node presence           |
| `calls(a, b)`                        | a call edge                                            | `calls`                 |
| `reaches(a, b)`                      | a call path of any length                              | transitive `calls`      |
| `references(a, b)`                   | a non-call reference                                   | `references`            |
| `imports(a, b)`                      | a file imports a file                                  | `imports`               |
| `exports(file, symbol[, name])`      | a file exports a symbol, optionally under a given name | `exports`               |
| `extends(a, b)` / `implements(a, b)` | a type relationship                                    | `extends`, `implements` |
| `usesType(a, b)`                     | a type is referenced                                   | `typeReferences`        |
| `dependsOn(pkgA, pkgB)`              | a manifest dependency                                  | `dependsOn`             |
| `hasLabel(node, axis, value)`        | a classification                                       | ADR 0003 labels         |

Two forms matter more here than they do elsewhere:

- **Negation**, written `!calls(a, b)`, and its scoped form `onlyCalledBy(x, dir/)` — "nothing outside
  this directory calls `x`". Encapsulation is the assertion architectural documentation actually makes,
  and it is checkable against a reverse index.
- **Counts**, written `implementations(x) == 3` or `callers(x) == 0`. These catch the _fourth_
  implementation being added, which no pointer and no per-instance claim ever will.

`analysedIn` is deliberately not exposed: a document asserting which project globbed a file is
asserting something about codedocs, not about the repository.

**Things the model does not hold cannot be claimed.** The ticket's example, "`POST /checkout` reaches
`ChargeCard`", is expressible only because the route has a handler symbol —
`reaches(src/app/api/checkout/route.ts#POST, src/payments/charge.ts#chargeCard)`. There is no route
node, no HTTP node, and no behavioural claim like "it retries three times". That boundary is not
hidden; it is what claim coverage reports.

## What it looks like on disk

A `SymbolId` is a full SCIP string and nobody will type one into a paragraph, so a claim names its
subject by the **durable part** of that id — the path and descriptor path ADR 0002 already defines:

```markdown
Checkout charges through the payment service before it writes the order.

<!-- codedocs: calls(src/checkout/service.ts#CheckoutService.charge,
                     src/payments/service.ts#PaymentService.capture) -->
```

An HTML comment is invisible on GitHub and in every editor preview, is plain text in a diff, and is
unambiguous to parse. It sits **immediately after the prose it justifies**, because a claim's position
is what lets `docs check` report a contradicted _section_ rather than a contradicted file.

A shorthand that resolves to more than one symbol is an **error in the document**, reported at check
time, not an `unable to verify`. Ambiguity is the author's to fix, and saying so immediately is what
stops it rotting. Per ADR 0002 the subject must be **durable**: a claim may not anchor to a local
symbol.

## The four verdicts

| Verdict             | Produced by          | Meaning                                                                                                                                          |
| ------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `verified`          | claims               | every claim in the document checks out                                                                                                           |
| `contradicted`      | claims               | a claim is **falsified** — the subject is there and the relationship is not, or the name exists nowhere in the index                             |
| `potentially stale` | the derived scope    | every claim still holds, but a file the document touches changed                                                                                 |
| `unable to verify`  | ADR 0001 blind spots | the subject sits in a `syntactic` file, an unmet precondition, an unresolved specifier, or outside the repository — or it did not resolve at all |

**`contradicted` requires a claim to be falsified, never merely unresolved**, and the measurements are why. Of the
symbols whose id vanished over 20 commits, **12 of 20 have the same name elsewhere in `HEAD`** — they
moved. Over 60 commits it is **95 of 105**. A verdict reading "the symbol is gone, therefore the
document is wrong" would be wrong most of the time it fired.

So an unresolvable subject is `unable to verify`, carrying ticket #11's rename candidates as an
`inferred` hint: "`requireAuth` is not at `src/middleware.ts`; a symbol of that name is now in
`src/middlewares/withAuth.ts`". That is also the exact text an agent needs to repair the claim. The
hint is never a verdict — `searchParams` matched two candidates in the same fixture, which is why #11's
layer is inferred in the first place.

**Provenance rides on the verdict, it does not multiply it.** A claim verified by an edge whose
provenance is `inferred` — ADR 0002 carries it per instance, and the spike proved method dispatch
over-approximates — renders as `verified` with that provenance named. There are four verdicts, not
eight.

## Claim coverage

Every document reports how many of its heading-delimited sections carry a claim, and no verdict
renders without it: _"verified, 9 of 14 sections covered"_. cal.com's Markdown averages a heading every
18 lines (1,758 headings across 381 files), so the section is a real unit rather than an invented one.

Without this, `verified` silently means "the checkable part is true", which is exactly the
completeness failure ADR 0001 exists to prevent. A document with no claims is not `verified` and not
`unable to verify` — it is uncovered, which is a different and honest thing to be. Claim coverage is
not a confidence score and never appears as one: it counts sections, and says nothing about whether the
prose in them is right.

## Discovery, and `docs affected`

A document is **any Markdown file containing a codedocs marker**, found by a repository-wide scan —
9 ms over cal.com's 381 Markdown files, so it needs no configuration and no caching. Not `docs/**`:
cal.com has **zero** Markdown under `docs/` and 55 READMEs beside the code they describe, alongside
changelogs and licences that must never be checked. Writing a claim is how a file opts in.

`docs affected` (PRD §12) takes the changed file set — from git, or from the drift set ADR 0004 already
computes before every answer — intersects it with the derived scopes, and re-checks those documents'
claims against the current index. **It needs no baseline.** The only thing a second index would buy is
the sentence "this was verified before your change", at 22.9 s to build on cal.com; that upgrade is
[#14](https://github.com/magicspon/codedocs/issues/14)'s to grant, behind an explicit flag.

## Considered Options

- **Pointers as the primary mechanism**, per PRD §10's sketched `files:` and `symbols:` frontmatter.
  Rejected on measurement: 71–77% false alarms, blind to 47% of real breakage at 60 commits, and on
  cal.com a directory pointer that fires on every commit forever. It can only ever produce "something
  under here changed, go and look", which is not a verdict.
- **Keeping `files:` globs as an opt-in alongside claims.** Rejected: a user who writes one gets the
  noise above, and the design would be offering them the worse of its two mechanisms. Widening a
  document's scope is done by making a claim about the code you care about.
- **A query language for claims.** Rejected for the reason ADR 0004 refused to let SQL reach the CLI:
  it becomes an interface we cannot change, and every unparseable query becomes a support case. A closed
  predicate set can grow one entry at a time, each time answering "which backend produces this?".
- **Claims in frontmatter.** Rejected: the list and the prose drift apart silently — the claims stay
  true while the paragraph they were written for is rewritten around them, and nothing binds them. It
  also flattens `docs check` to a per-file verdict when the useful one is per section.
- **A fenced code block instead of an HTML comment.** Rejected as clutter: it renders as a visible code
  block after every paragraph for readers who are not running `docs check`.
- **`SymbolId` strings as the on-disk subject.** Rejected: unusable by hand. The path-plus-descriptor
  shorthand is the durable content of the id, so this is a projection, not a second anchor.
- **`contradicted` on an absent `SymbolId`.** Rejected on measurement — 12 of 20, then 95 of 105,
  vanished ids were moves. This is the single most tempting wrong answer in the design.
- **Promoting #11's rename inference to a verdict.** Rejected: the same fixture produced two candidates
  for one name. An inferred match is a hint attached to a deterministic verdict, never a verdict.
- **A fifth verdict for inferred evidence.** Rejected: PRD §11 specifies four, provenance already rides
  on every fact per ADR 0002, and eight states would be a switch nobody acts on differently.
- **`docs/**` as the document convention.** Rejected on measurement: cal.com would find nothing there.
- **A configured glob in `codedocs.jsonc`.** Rejected: it makes every user write configuration before
  they can write their first document, to replace a 9 ms scan.
- **codedocs writing to documents** — stamping a verification timestamp, or repairing a claim after a
  rename. Rejected: a stamp is a committed lie the moment anyone edits the code, and churns every
  document on every run; an unattended repair writes an `inferred` fact into a committed file, which is
  the silent-wrong-answer failure the honesty layer exists to prevent. ADR 0001's rule is unchanged —
  codedocs reports what would fix it and never does the fixing.
  [ADR 0013](0013-drafting-a-document.md) narrows this to what it was aimed at — an **unattended write
  into a file someone else owns**. `docs draft` writes one **new** file, asked for by name, refusing to
  overwrite, and what it writes are candidate claims under a marker `docs check` does not read. No
  document is edited, and no unreviewed fact becomes a claim.
- **codedocs inferring claims from prose.** Ruled out by settled constraint 2 before this ticket
  started: it would require an LLM. What it can do is hand back the facts an answer already rests on,
  as candidate claims, which is what makes agent-written claims practical.

## Consequences

- **`docs check` reports a verdict per section and per document.** The per-section verdict is the whole
  reason claims live inline; a document-level verdict alone would send a reader to re-read a file whose
  contradiction is in one paragraph.
- **codedocs hands back candidate claims alongside evidence.** Every `trace`, `callers` or `references`
  answer already _is_ a set of facts; rendering them as claim expressions costs nothing and means an
  agent never invents syntax. This is what ticket #10's renderer contract has to carry.
- **The agent writes claims; codedocs validates them.** An unparseable claim, or one whose shorthand is
  ambiguous, is an error at check time. Humans can write claims by hand, so the syntax stays typeable.
- **A document's scope is derived**, from its claims' files plus the source files its prose links to.
  A Markdown link to a file that no longer exists is a contradiction with no inference in it.
- **`docs affected` needs one index, not two**, which is what keeps it usable inside a pre-commit hook
  or an agent loop.
- **The untestable majority of a document is reported, not hidden.** Behavioural prose — retries,
  ordering, intent — has no predicate and never will while the model holds no such facts. Coverage is
  how the product admits that, rather than a `verified` badge that overstates what was checked.
- **Claim coverage is not [[Completeness]].** Completeness is a property of one answer and its blind
  spots; claim coverage is a property of a document and how much of it is checkable at all. They are
  reported separately and must never be combined into a score.
