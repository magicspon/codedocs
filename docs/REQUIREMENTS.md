# codedocs — product requirements

The original requirements document is frozen at [`PRD-v1.md`](PRD-v1.md), which the ADRs cite by
section number. This document replaces it as the statement of current intent; the reasoning behind
the change is [ADR 0012](adr/0012-audience-and-the-fallow-boundary.md).

---

## 1. What codedocs is

codedocs builds a **deterministic semantic index of a TypeScript repository** — every symbol, every
call edge, every project — into one SQLite file beside the working tree, and answers questions across
it that a text search and an editor cannot answer.

The index is a **build artefact**. It is never committed, always safe to delete, rebuilt or
incrementally repaired on demand, and reproducible from the commit it describes.

## 2. Who it is for

A developer working in a repository large enough that they cannot hold its shape in their head. That
is the reader every operation is designed for, and the reader whose question decides whether an
operation exists.

An AI agent is a **second caller of the same operations**, reached by shelling out or over MCP. It
gets the identical answer in an identical envelope. No operation exists because an agent wanted it,
and no operation is shaped differently because an agent is asking.

## 3. The questions

| Question                                      | Operation                     |
| --------------------------------------------- | ----------------------------- |
| What symbols are named like this?             | `symbol`                      |
| What calls this, anywhere in the repository?  | `callers`                     |
| What does this call?                          | `callees`                     |
| What names this at all — types included?      | `references`                  |
| What is in this file, and what does it reach? | `file`                        |
| How does execution flow out of here?          | `trace`                       |
| What could this change reach?                 | `impact`                      |
| Which tests does this change reach?           | `impact --label role=test`    |
| Which documents does this change contradict?  | `docs check`, `docs affected` |
| Everything the index holds about one subject  | `evidence`                    |
| Why is the answer incomplete?                 | `doctor`                      |

The first six are relationship questions: they are true of the repository as it stands. `impact` and
the `docs` pair are change questions: they compare the working tree against a baseline. `evidence` and
`doctor` are neither — one assembles what is known about a subject, the other reports what could not
be seen.

## 4. What codedocs is not

**Not a static-analysis suite.** Unused code, circular dependencies, duplication, complexity,
maintainability hotspots and architecture boundary violations are `fallow`'s, and codedocs implements
none of them. The boundary and the reasoning are in
[ADR 0012](adr/0012-audience-and-the-fallow-boundary.md); the short version is that two tools
answering one question is worse than either tool alone.

**Not an LLM product.** codedocs contains no provider, no API key and no inference cost. It emits
structured facts; anything that reads like prose was written by something else. `evidence` is the
operation shaped for pasting into a prompt, and it is one operation among thirteen rather than the purpose
of the index.

**Not an editor replacement.** Go-to-definition and find-references within one project are solved.
codedocs starts where the project boundary does.

**Not a service.** Nothing leaves the machine. The one artefact meant to travel is what `report-bug`
writes, and the user moves it.

## 5. Principles

**Local first.** Source code is never uploaded. The index lives in the working tree.

**Deterministic.** The same commit, the same tool version and the same environment produce
byte-identical output. Ordering is total and sorted on the data, never on row or insertion order.
This forbids relevance ranking anywhere in the core: a ranking is a judgement, and a judgement cannot
also be a reproducibility guarantee.

**Honest about what it could not see.** Three channels, never blurred into a score — a **blind spot**
is what codedocs could not see, **truncation** is what it deliberately withheld and counted, **scope**
is what the question excluded. Every fact carries its provenance and the rule that derived it.

**Never executes the repository's code.** A missing install, or a codegen step that has not been
run, lowers a file's fidelity and is reported with the command that would clear it. codedocs reports
remediations and does not run them.

**Files are the source of truth.** Documentation is Markdown in the repository. codedocs checks
documents against the index; it does not write them.

**Does not reinvent analysis.** TypeScript's own checker resolves symbols and calls. `fallow` covers
hygiene. Git covers history. What codedocs adds is the index, the relationships and the honesty
around an answer.

## 6. The operation surface

An **operation** is one question codedocs can answer, and the unit the product is built from. It is
held as a declarative manifest, from which the CLI parser, the MCP tool list, the JSON schema and the
reference docs are all derived — an operation that reaches one binding and misses another fails to
build.

Three bindings, one to one with the operation set:

- **The CLI**, with a human renderer that is a pure function of the envelope. It may group, colour,
  total and page; it may not re-sort, drop a result silently, or omit a blind spot.
- **`--json`**, explicit and never inferred from a TTY, unbounded unless the caller passes `--limit`.
- **`codedocs mcp`**, one tool per operation, returning the machine envelope verbatim.

Every answer carries the same envelope, success or failure: the resolved request, the snapshot, the
analysis conditions of only the projects the answer touched, its blind spots, its budget, and either
`result` or `error`. Exit codes are `0` answered, `1` a negative finding, `2` could not answer.

The full contract is [ADR 0006](adr/0006-operation-set-and-renderer-contract.md).

## 7. Performance

Measured on [cal.com](https://github.com/calcom/cal.com) at `176037d` — 4,827 files across 28
TypeScript projects — and treated as a budget rather than a result:

| Operation                                    | Budget     |
| -------------------------------------------- | ---------- |
| Cold build                                   | under 30 s |
| One-file edit, repaired on the next question | under 2 s  |
| Warm answer, process start included          | under 1 s  |
| Index on disk                                | tens of MB |

There is no daemon and no watcher. Every command is a one-shot process, and every question repairs
the index before it answers, so an edit costs a repair rather than a rebuild.

## 8. Privacy

No network access from any package, enforced at build time. Paths, symbol names and dependency
versions are repository content: the default `report-bug` payload carries facts about codedocs and
the machine alone and is safe to paste unread, and `--with-repository` is the opt-in that adds the
rest. See [ADR 0011](adr/0011-report-bug-payload.md).

## 9. Roadmap

Built: the index, incremental repair, preflight and the environment fingerprint, symbol identity,
the label layer and the scope channel over it, baselines and their capture, all **thirteen
operations** (`analyse`, `symbol`, `callers`, `callees`, `references`, `file`, `trace`, `evidence`,
`docs check`, `docs affected`, `impact`, `doctor`, `report-bug`), both renderers, and the MCP server.

That is the whole of the order [ADR 0012](adr/0012-audience-and-the-fallow-boundary.md) set, bar its
last step. What remains:

1. **Publishing to npm.** codedocs is cloned and run from `node_modules/.bin` today
   ([#73](https://github.com/magicspon/codedocs/issues/73)).

Not tied to that order, and not gating it: ADR 0007's `shape-hash` and `path-prefix-rewrite`
continuity signals, which need a per-symbol shape hash the index does not hold; and the `AGENTS.md`
discovery block that tells an agent when to reach for codedocs
([#18](https://github.com/magicspon/codedocs/issues/18)).

`review` and `plan` were specified in the original PRD and are deleted. Anything not on this list and
not covered by `fallow` is not planned.

## 10. Success criteria

1. A developer asks a relationship question about a repository they do not know, and gets a correct
   answer an editor could not have given them.
2. `trace` from an unfamiliar entry point shows the shape of what it does, including the parts nobody
   would have thought to grep for.
3. `impact` names what a change reaches, and names what it could not see, so the answer can be acted
   on rather than double-checked.
4. Rebuilding the index at the same commit reproduces the previous output byte for byte.
5. An answer over an unprepared repository is still useful, and says exactly why it is narrower.
6. Nobody has to decide whether codedocs or `fallow` is the right tool for a question — the question's
   shape decides it.

## 11. Where the detail lives

- [`CONTEXT.md`](../CONTEXT.md) — the glossary. One meaning per term, and the words to avoid.
- [`docs/adr/`](adr) — one record per hard-to-reverse decision.
- [`docs/research/`](research) — the measurements the ADRs rest on.
- [`docs/PRD-v1.md`](PRD-v1.md) — the frozen original, cited by section number throughout the ADRs.
