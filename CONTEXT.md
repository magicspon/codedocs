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
Where a single fact came from, and therefore how far it can be trusted: `deterministic` (resolved by
a type checker), `syntactic` (read from source text alone), or `inferred`. Carried by the fact
itself, not attached when rendering.
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
