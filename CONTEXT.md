# codedocs

A local-first codebase-intelligence tool for TypeScript. It builds deterministic, queryable
knowledge about a repository and exposes it to developers and to AI coding agents through a CLI.

This glossary is the canonical vocabulary for that knowledge: what codedocs knows, how sure it is,
and what it could not see.

## Language

### Analysis honesty

**Fidelity**:
Which analysis ran on a single file — `typed` (a type checker was applied to its project) or
`syntactic` (parsed only). A property of a file in the index, never of the repository as a whole,
and never a claim about completeness: a `typed` file may still have blind spots.
_Avoid_: tier, level, mode, degraded mode, partial

**Precondition**:
A state a repository must be in before a file can be analysed at `typed` fidelity — dependencies
installed, framework codegen run. An unmet precondition lowers fidelity; it is not an error.
_Avoid_: requirement, prerequisite

**Remediation**:
The command that would clear an unmet precondition. codedocs reports remediations; it never runs
them.
_Avoid_: fix, repair, auto-install

**Provenance**:
Where a single fact came from, and therefore how far it can be trusted: `deterministic` (observed,
not guessed — resolved by a type checker, or read from git or a project's own config), `syntactic`
(read from source text alone), or `inferred`. Carried by the fact itself, not attached when
rendering.
_Avoid_: confidence, certainty, trust level

**Blind spot**:
A file or region the analysis could not see, and which could therefore have changed a given answer.
Named concretely and per answer — never summarised as a score.
_Avoid_: gap, unknown, missing coverage

**Completeness**:
A property of one answer: whether any blind spot could have changed it. An answer is complete or it
names its blind spots.
_Avoid_: confidence score, accuracy, coverage percentage

### Observing the repository

**Preflight**:
The sweep that observes a repository's preconditions. Callable on its own, and always the first
phase of an analysis, which stores its result.
_Avoid_: check, health check, validation

**Analysis conditions**:
The preflight result stored alongside an index: the preconditions observed, when they were
observed, and the fidelity they permitted. What an answer's completeness is derived from.
_Avoid_: health, status, environment

**Environment fingerprint**:
A summary of everything outside a file's own contents that determines what the type checker can see
of it — the installed dependency set, the files a project's config globs actually match, the
compiler options. Held per project; a change to it means fidelity could rise.
_Avoid_: env hash, install hash

**Unresolved specifier**:
An import whose target the analysis could not find, recorded as a fact with its cause rather than
dropped. Three causes: `unprepared` (declared as a dependency, absent from disk),
`missing-generated` (its target lies where a codegen step would have written), `broken` (imported
but declared nowhere — a defect in the repository, and the one cause with no remediation).
_Avoid_: missing import, broken import, dangling edge

### The internal representation

**Node**:
One of the five things the index holds: `Package`, `Project`, `File`, `Symbol`, `Document`. A
`Repository` is the index header, not a node, and a change is git's, not the index's.
_Avoid_: entity, vertex, record, object

**Edge**:
One relationship between two nodes, from a closed set of nine kinds. What PRD §25 calls a
`Relationship` — it is the edge set, never a node alongside `File`.
_Avoid_: relationship, link, arc, connection

**Fact**:
One indivisible piece of knowledge in the index — a node attribute, a single edge instance, or a
[[Label]]. The unit [[Provenance]] attaches to.
_Avoid_: record, datum, item, entry

**SymbolId**:
A symbol's name in the index: a SCIP symbol string in codedocs' own scheme, with the workspace
package version normalised away and locals named by descriptor path. Deterministic and scoped to one
snapshot — it says what a symbol is called at this commit and nothing about the past.
_Avoid_: symbol name, key, fully-qualified name, FQN, handle

**Durable**:
Whether a `SymbolId` may be relied on to mean the same thing after an edit. Local symbols are not
durable, and nothing durable may anchor to one — a document, an impact baseline.
_Avoid_: stable, permanent, persistent, canonical

**Derivation**:
The rule that produced a fact, named on the fact itself: `checker-signature`,
`checker-base-types`, `heritage-clause`, `jsx-element-rule`, `shared-method-name`, `manifest`,
`resolver` for edges; `user-config`, `git-untracked`, `generated-header`, `codegen-path`,
`path-convention`, `tsconfig-exclude` for [[Label]]s; `content-hash`, `path-prefix-rewrite`,
`git-rename`, `shape-hash`, `descriptor-suffix`, `declared-name`, `name-in-head`, `call-site-overlap`
for [[Candidate]]s, in that order of strength. What makes an `inferred` fact actionable rather than
merely hedged.
_Avoid_: method, source, strategy, origin

**Continuity**:
Deciding that a symbol at this commit is the same symbol as one at an earlier commit. A separate,
inferred layer — never a property of the `SymbolId`, because no existing system has managed to make
identity survive a rename. Two matchers with different inputs: **subject matching**, from a [[Claim]]
subject that no longer resolves, against git history and the current index, needing no [[Baseline]];
and **snapshot matching**, between two [[Index]]es, which only `impact` needs.
_Avoid_: tracking, history, identity, lineage

**Candidate**:
One possible continuation of a subject, carrying the [[Derivation]]s that produced it. Ranked against
its rivals by evidence rather than by a score, and never asserted as the answer even when it is alone
in the list. An empty list means no candidate was found, never that the subject was deleted.
_Avoid_: match, guess, suggestion, resolution

### Classification

**Label**:
One classification fact about a node: an axis, its value, a [[Provenance]] and a [[Derivation]]. The
third kind of thing the index holds, alongside [[Node]]s and [[Edge]]s — never a node itself. Keyed
by node id, so it labels a `Symbol` as readily as a `File`.
_Avoid_: tag, category, annotation, flag, classification

**Role**:
What a file is for: `source`, `test` or `config`. Test helpers, mocks and fixtures are `test` —
there is no separate role for them, because everything that excludes tests wants them excluded too.
_Avoid_: kind, type, category, purpose

**Authorship**:
Whether a file was written by a person (`authored`) or produced by a program (`generated`).
Orthogonal to [[Role]], because generated code is still source and a config file is still authored.
Distinct from [[Provenance]], which is about a fact rather than a file.
_Avoid_: origin, generated flag, provenance, source

### What the index holds

**Package**:
A workspace package, as its manifest declares it. A package is not a `Project`: one package can hold
several, and a repository can have neither at its root.
_Avoid_: module, library, project, app

**Project**:
One TypeScript project — a single `tsconfig` and the files it globs. What fidelity and the
environment fingerprint are held against, and what a file is analysed in. A file may belong to
several; one of them is canonical.
_Avoid_: tsconfig, compilation unit, program, package

**Export-shape hash**:
A per-file summary of what the file exports and the shape of each export, distinct from its content
hash. What gates incremental propagation: a file whose content changed but whose export shape did
not stops the wave.
_Avoid_: signature, dts hash, api hash

**Shape hash**:
The same idea per symbol, expanded structurally for type-ish symbols. What makes a move detectable —
same shape, same descriptor suffix, different path.
_Avoid_: type hash, signature hash, fingerprint

**Caller attribution**:
Which node a call edge is credited to: a `symbol`, the `variable` a call initialises, or the `file`
when there is no enclosing declaration at all. Module-level calls and calls in anonymous callbacks
are attributed to the file — the honest answer, not a dropped edge.
_Avoid_: owner, parent, scope, enclosing symbol

**Unresolved call**:
A call site that produced no edge, stored as a fact with its cause rather than dropped. Three
causes: `external` (resolved, but the target is outside the repository), `unresolvable` (the checker
returned nothing), `dynamic` (computed at runtime — the one cause where codedocs cannot know what it
missed).
_Avoid_: missing edge, dangling call, unattributed

### The index on disk

**Index**:
The store of everything codedocs knows about one [[Snapshot]] of one working tree — [[Node]]s,
[[Edge]]s and [[Label]]s, with the [[Index header]] over them. A derived artifact: never committed,
always safe to delete.
_Avoid_: database, cache, graph, store

**Snapshot**:
The state of a working tree an [[Index]] describes: a commit plus whatever is uncommitted on top of
it. One index holds exactly one, which is what makes a [[SymbolId]] snapshot-scoped.
_Avoid_: version, revision, commit, state

**Index header**:
What an [[Index]] records about itself rather than about the code: the [[Snapshot]] it describes, the
signature it will detect [[Drift]] against, the tool and schema versions it was built with, and per
[[Project]] the [[Analysis conditions]] and [[Environment fingerprint]]. Where an answer's
[[Completeness]] is read from.
_Avoid_: metadata, manifest, index root

**Drift**:
The difference between the working tree and the [[Snapshot]] its [[Index]] describes. Detected before
every answer, and either repaired or named — an answer given over unrepaired drift reports the
drifted files as [[Blind spot]]s.
_Avoid_: staleness, dirty, out of date, invalidation

**Baseline**:
A separate [[Index]] for some other commit, kept so an answer can be compared against it. Recorded by
[[Capture]] rather than built on demand, immutable once written, and never moved to another machine.
Never part of the live index, and nothing not [[Durable]] may anchor to one.
_Avoid_: history, snapshot store, previous index

**Capture**:
The copying of a finished [[Index]] into a [[Baseline]], which happens as a side effect of an analysis
over a clean working tree and never as a command of its own.
_Avoid_: save, promote, checkpoint, backup

**Baseline substitution**:
Using an older [[Baseline]] because the commit an answer asked to be compared against has none. Part of
an answer's scope, reported with the commit requested, the commit used and the distance between them —
never a [[Blind spot]].
_Avoid_: fallback, approximation, nearest match

### Documentation

**Document**:
A Markdown file in the repository carrying at least one [[Claim]]. Committed, unlike the [[Index]],
and found by scanning for claims rather than by living in a particular directory.
_Avoid_: doc, page, article, walkthrough

**Claim**:
One checkable assertion a [[Document]] makes about the code, from a closed set of predicates over the
[[Node]]s, [[Edge]]s and [[Label]]s the index holds. Written beside the prose it justifies, and
anchored to a [[Durable]] subject. An assertion no predicate can express is not a claim and is not
checked.
_Avoid_: assertion, annotation, statement, test

**Verdict**:
What `docs check` decides about a [[Document]] or one of its sections: `verified` or `contradicted`
from its [[Claim]]s, `potentially stale` from a file it touches having changed, `unable to verify`
from a [[Blind spot]]. Each has exactly one source; [[Provenance]] is reported alongside a verdict,
never as a fifth one.
_Avoid_: status, result, state, score

**Claim coverage**:
How many of a [[Document]]'s sections carry a [[Claim]] at all. Reported with every [[Verdict]], so
`verified` cannot be read as "all of this is true". Distinct from [[Completeness]], which is about one
answer's [[Blind spot]]s, and never combined with it into a score.
_Avoid_: coverage score, doc quality, verification percentage

### The operation surface

**Operation**:
One question codedocs can answer, and the unit the whole product is built from. The CLI, `--json` and
the MCP server are [[Renderer]]s or bindings of the same operation, one to one — nothing composes
operations above them.
_Avoid_: command, query, endpoint, tool

**Renderer**:
One presentation of an [[Operation]]'s answer: machine (`--json`) or human. The human renderer is a
pure function of the [[Envelope]] — it may group, colour and page, never re-sort or withhold silently.
_Avoid_: formatter, output mode, view, printer

**Envelope**:
The fixed wrapper every answer carries, whatever the [[Operation]]: the request as resolved, the
[[Snapshot]], the [[Analysis conditions]] of the projects the answer touched, its [[Blind spot]]s, its
budget, and the result. A failure is the same envelope carrying an error.
_Avoid_: response, wrapper, payload, metadata

**Truncation**:
Results an answer deliberately withheld to stay inside its budget, reported with how many exist.
Distinct from a [[Blind spot]]: codedocs knows exactly what it withheld.
_Avoid_: limit, cut-off, paging, elision

**Scope**:
The [[Label]] filter a question carries — what the caller asked to exclude. Echoed with every answer
and reported as an excluded count, never as a [[Blind spot]] and never as [[Truncation]], because it
is part of the question rather than a limit on the answer.
_Avoid_: filter, selection, view, subset

**Path**:
`trace`'s result unit: one walk outward from a root symbol, as the sequence of symbols it reached
with the call sites realising each step, plus **why it stopped** — the walk ran out of callees, the
caller's `--depth` cut it, or it closed a loop. Steps are grouped by callee rather than by call site,
so two calls between the same pair are one step carrying two sites and not two paths.
_Avoid_: chain, trace, route, call stack, walkthrough

**Evidence**:
Everything the index holds about one subject, assembled for someone else to write prose from — its
node, [[Label]]s, [[Fidelity]], edges in and out, and the [[Document]]s whose [[Claim]]s name it.
What PRD §9's `explain` becomes once codedocs never generates text.
_Avoid_: explanation, summary, context, description
