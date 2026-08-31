---
status: accepted
---

# One operation, three bindings, and one envelope on every answer

The **operation** is the unit of the product. The CLI, the machine renderer (`--json`) and the later
MCP server are three **bindings** of the same operation set, one to one, and composition happens
_inside_ an operation and never above one. Every operation returns the **same envelope** — only its
`result` differs — and both renderers are held to four rules: a total order, byte-identical
reproducibility, an explicit `--json`, and a human renderer that is a pure function of the envelope.

Three of PRD §20's fifteen commands do not survive settled constraint 2, and they fail differently.
`explain` was only ever **misnamed** — the operation behind it is real — and becomes `evidence`.
`walkthrough` took a natural-language question, which is a parser we do not have, and is **absorbed
into `trace`**. `docs generate` **does not exist**: strip the prose it cannot write and what remains
is `evidence` plus a file write ADR 0005 forbids. Two more go for reasons unrelated to the LLM
constraint — `init` has nothing left to initialise, and `search` is `symbol` with a pattern.

## The operation set

Phases 1–4. `--limit` counts the result unit; the sort key is part of the contract, not an
implementation detail.

| Operation             | Result unit    | Sorted by                          | Exit 1 when                          |
| --------------------- | -------------- | ---------------------------------- | ------------------------------------ |
| `analyse`             | project        | `tsconfig` path                    | —                                    |
| `symbol <pattern>`    | node           | `SymbolId`, then path              | —                                    |
| `callers` / `callees` | call edge      | `(source, target, kind, site)`     | —                                    |
| `references`          | reference edge | `(source, target, kind, site)`     | —                                    |
| `file <path>`         | file           | path                               | —                                    |
| `trace <root>`        | path           | the `SymbolId` sequence, lexically | —                                    |
| `evidence <subject>`  | per kind       | each kind by its own key           | —                                    |
| `docs check`          | document       | path, then section order           | a `contradicted` verdict             |
| `docs affected`       | document       | path                               | —                                    |
| `doctor`              | precondition   | project, then cause                | an unmet **remediable** precondition |
| `report-bug`          | —              | —                                  | —                                    |

`mcp` is in PRD §20 but is **not an operation**: it is a server that binds them. `impact`, `review`
and `plan` are Phase 5 — named in the schema's operation enum from day one so their arrival is
additive, and specified elsewhere.

`analyse` survives even though ADR 0004 makes every query update before it answers, because a cold
build in CI wants to be a step that can fail on its own rather than a hidden cost inside the first
question.

`trace`'s result unit needs one more sentence than the table gives it, because the sort key above
presumes it. **A path is a root plus its steps, and a step is a _callee_, not a call site**: two calls
between the same pair are one step carrying two sites, so a hot root does not fork a path per call
instance. **A root that calls nothing answers with a path of no steps**, which is what makes an empty
`trace` result mean "nothing resolved" and nothing else
([#33](https://github.com/magicspon/codedocs/issues/33)).

## The envelope

One shape, every operation, success and failure alike.

| Field           | Holds                                                                  |
| --------------- | ---------------------------------------------------------------------- |
| `operation`     | the operation name                                                     |
| `schemaVersion` | one integer over the envelope **and** every result shape               |
| `request`       | the resolved canonical subject, the scope applied, the effective limit |
| `snapshot`      | the [[Snapshot]] the answer came from, per ADR 0004                    |
| `conditions`    | [[Analysis conditions]] for **only the projects this answer touched**  |
| `blindSpots`    | ADR 0001's named files, or empty                                       |
| `budget`        | returned, available, and whether the answer was truncated              |
| `result`        | the operation's own payload                                            |
| `error`         | present **instead of** `result` when the operation could not answer    |

Scoping `conditions` to the answer is what stops the envelope growing with the size of the repository
rather than the size of the question: cal.com has **34 projects**, and 33 of them have nothing to say
about one `callers` answer. The full set is `doctor`'s job, which is already where ADR 0001 put the
summary view.

`request` echoing the **resolved** subject is load-bearing three times over: it is what makes
reproducibility checkable, it is the reproduction command PRD §29 asks `report-bug` for, and it is how
an agent that passed the shorthand `AuthService.login` learns which `SymbolId` it actually got — which
is the only way it can feed an answer back in.

## Naming a subject

**Whatever an operation prints as an identifier is accepted as input.** Three forms are read: the
ADR 0005 shorthand with a path (`src/auth/service.ts#AuthService.login`, exact), the same without one
(`AuthService.login`, which may resolve to several), and a full `SymbolId`, because `--json` emits
those and round-tripping must work. One canonical form is printed.

Glob patterns belong to `symbol` alone. It is the resolver; every other operation takes a subject.

An **ambiguous subject is not an error**. The operation returns a result per matching subject and the
envelope names the ambiguity, because an error costs a second round trip to learn something the
answer already contains. This is deliberately unlike ADR 0005's rule for an ambiguous _claim_, which
is an error in the document: a document is a committed artefact that must mean one thing, while a
question asked at a prompt may reasonably be vague.

## The four rules both renderers obey

**Ordering is total, per operation, and sorted on the data.** Never on SQLite row order, insertion
order or hash iteration order. This forbids relevance ranking anywhere in the core — a ranking is a
judgement, and PRD §27 would make it inferred — which is most of what `search` meant and why `search`
is gone.

**The same commit rebuilt gives byte-identical output**, conditioned on the same [[Environment
fingerprint]] and the same tool version. It has to be conditioned: ADR 0001 already established that
install state changes what the checker can see, so a difference across two fingerprints is the
environment changing rather than the code — the same confusion [#14](https://github.com/magicspon/codedocs/issues/14)
must handle for baselines. This is a fixtures test, and it is cheap to promise only because ordering
is already sorted on data.

**`--json` is explicit and never inferred from a TTY.** Sniffing a pipe is the usual convenience and
it makes the same command produce different output depending on where it runs — which an agent
capturing output through a pty discovers the hard way.

**The human renderer is a pure function of the envelope.** It never queries the index and never sees a
field `--json` withheld. It may colour, group, add totals and headers, wrap to the terminal, hyperlink
`file:line` and page. It may not re-sort, change a fact, drop a result silently, or omit blind spots,
truncation or `inferred` provenance. It **may** omit the index header when the answer is complete and the working
tree has not drifted, because no news is the honest render of a clean state.

## Budget, and what a default means

`--limit` counts the operation's own result unit. `trace` additionally takes **`--depth`**, because
depth is a semantic bound — how far to walk — and folding it into a size bound would let a display
limit silently change the shape of the answer. `evidence` returns several kinds at once and applies
one `--limit` **per kind**, reporting truncation per kind, because a shared pool means adding a caller
quietly evicts a document.

**`--depth` has no default: the walk is unbounded unless the caller bounds it.** This is the one
place the two bounds part company, and it is measured rather than assumed. A default looked prudent,
since the number of simple paths out of a symbol is exponential in depth in principle — but on cal.com
an unbounded walk from _every one_ of its 5,217 call-graph roots yields 50,580 paths in 1.1 s, the
worst root being 1,630 paths and exhausting at 16 steps. The structural reason is the backend spike's:
only a quarter of a repository's call sites stay inside it, so a walk meets the `node_modules`
boundary long before it meets combinatorics. A default would therefore have bought nothing, and it
would have cost more than the `--limit` default it resembles — a limit withholds results the answer
still counts, while a depth bound changes which results **exist**, and an agent handed a shape it did
not ask for cannot tell from the answer that the shape is wrong. `microsoft/vscode`, ADR 0004's
ceiling test, is the revisit trigger ([#33](https://github.com/magicspon/codedocs/issues/33)).

The default belongs to the **renderer**, not the operation. The human renderer caps and says
`showing 20 of 176`; **`--json` is unbounded by default**. An agent that never passes `--limit` must
not be handed a capped answer it may read as the whole truth, and the sizes do not justify the risk —
the backend spike's hot symbol had **176 callers** and cal.com's _entire_ edge set is 26,091. PRD §18's
context efficiency is better served by the caller choosing its bound than by codedocs guessing on its
behalf.

## Three channels of honesty, which must not blur

| Channel        | Means                                   | codedocs knows what it missed |
| -------------- | --------------------------------------- | ----------------------------- |
| **Blind spot** | could not see it                        | no — that is the point        |
| **Truncation** | chose not to send it, and says how many | yes, exactly                  |
| **Scope**      | the question excluded it                | yes, exactly                  |

Scope is set by `--label <axis>=<value>` and `--exclude-label`, one generic pair over ADR 0003's
labels rather than bespoke per-operation flags like `--no-tests` — the label store is keyed by node
id precisely so the same filter works on a symbol and a file.

**This refines ADR 0003.** Its consequence "labels never filter silently" said an answer names what
its scope excluded "as a blind spot in ADR 0001's sense", and explicitly left the deviation to this
ticket. The rule survives; the channel changes. A scope exclusion is reported as an **excluded count
beside the echoed scope**, not as a blind spot, because codedocs knows precisely what it withheld and
a blind spot is by definition what it could not see. Filing a known exclusion as a blind spot teaches
readers that blind spots are routine, which is the one thing that would destroy the signal ADR 0001
exists to protect. ADR 0003's default scope is unchanged: `authorship: authored`, `role: all`, always
echoed.

## Errors and exit codes

The convention this repo already relies on with `fallow`, for the same reason — a caller must be able
to tell "found something" from "broke" without wrapping every invocation in `|| true`.

| Code | Means                                                 |
| ---- | ----------------------------------------------------- |
| `0`  | answered — including with blind spots or truncation   |
| `1`  | answered, and the operation's own finding is negative |
| `2`  | could not answer                                      |

Only the operations marked in the table above can reach `1`; for the rest it is unreachable. A
genuine failure returns **the same envelope** carrying `error` instead of `result`, so a parser never
meets a second shape.

For `docs check`, **`contradicted` alone** reaches `1`. `potentially stale` does not: ADR 0005
measured signals of exactly that character at **59–77% false alarms**, and wiring that to a red build
recreates the noise the ADR refused. `unable to verify` does not either, because failing a build for
an unmet precondition punishes the environment rather than the code, which ADR 0001 declined to do.
Uncovered sections are not a failure at all — [[Claim coverage]] is reported, never enforced.
`--fail-on <verdict>` raises the bar for teams that want it.

For `doctor`, **a remediable cause alone** reaches `1`, whichever signal evidenced it — a filesystem
signal and a group of unresolved specifiers are the same finding at different granularity, so the exit
code follows the cause, not the signal. `unmapped` and `broken` never reach it: both are findings with
no command to offer, and a red build that cannot be cleared is noise. One cause may be evidenced twice,
so `doctor` deduplicates causes across signals
([ADR 0009](0009-preflight-cost-and-signal-shapes.md)).

## Considered Options

- **A smaller operation set with commands composing several**, so `impact` calls `callers`,
  `docs affected` and a baseline diff and stitches them. Rejected: MCP then either exposes the
  primitives and every agent re-implements `impact`, or exposes the compositions and there are two
  operation sets to keep honest. "Thin wrapper" stops being checkable, which is the whole point of
  constraint 3.
- **Keeping `init`.** Rejected: ADR 0004 makes `.codedocs/` self-creating and self-ignoring, ADR 0005
  makes document discovery a **9 ms** scan needing no configuration, and ADR 0003's `codedocs.jsonc`
  is optional. `init` would create an empty file and print a welcome.
- **Keeping `search` as a ranked operation.** Rejected: ranking is a judgement, so PRD §27 makes it
  inferred, and an inferred ordering cannot also be the determinism guarantee. What remains after
  ranking is removed is pattern matching, which is `symbol`.
- **Renaming `walkthrough` rather than absorbing it.** Rejected: a separate operation returning the
  same traversal plus documents and labels is a second traversal implementation to keep in step with
  `trace`, and Q1's rule forbids composing above an operation.
- **`docs generate` emitting a skeleton** — headings from a trace, claims populated, prose blank.
  Rejected twice over: it is codedocs writing a document, which ADR 0005 refused because an unattended
  write puts an unreviewed fact into a committed file; and it inverts the coverage measure, which
  exists to say "this prose is unchecked", not "these claims have no prose".
- **Candidate claims on every answer by default.** ADR 0005's consequence says rendering facts as
  claim expressions "costs nothing". Trimmed to an opt-in **`--claims`**, machine renderer only: the
  claim string is pure restatement of a fact already in the payload, so always-on spends budget to
  send the same fact twice. A person writing a claim by hand reads the documented syntax; an agent
  passes the flag.
- **A per-operation default limit on `--json`.** Rejected, revising the position taken earlier in the
  same session: a capped answer an agent does not know is capped is a wrong answer with a footnote.
- **Auto-detecting a pipe to select `--json`.** Rejected: output that depends on where the command
  runs is not reproducible in the sense the second rule promises.
- **Two schema version numbers**, one for the envelope and one for result shapes. Rejected: a
  compatibility matrix nobody maintains, over a surface small enough for one integer.
- **Per-operation honesty fields by convention** instead of one envelope. Rejected: convention is what
  a new operation forgets. One envelope means a single test asserts every operation names its snapshot
  and its blind spots, and an agent learns the honesty fields once rather than eleven times.
- **Erroring on an ambiguous subject.** Rejected: the candidates _are_ the answer to "which did you
  mean", and returning them costs one round trip fewer.
- **Exit 1 on `potentially stale`.** Rejected on ADR 0005's measurements — it is the change that would
  get `docs check` removed from CI within a month.

## Consequences

- **The operation set is one declarative manifest**, and the CLI parser, the MCP tool list, the JSON
  schema and the reference docs are all derived from it. An operation added without a sort key, a
  limit unit or a documented exit code fails to build rather than shipping an unordered, unbounded
  answer. This is the only mechanism that makes the rest of this ADR enforceable rather than
  aspirational.
- **The MCP rule is fixed now, though the server is Phase 4**: one tool per operation, same name, same
  arguments, returning the machine envelope verbatim, and no tool that is not an operation. Without it
  written down, Phase 4 grows convenience tools and constraint 3 quietly becomes false.
- **Two named PRD deliverables are deleted and one renamed.** Phase 2 loses `init`; Phase 3 loses
  `docs generate` and gains `evidence` in place of `explain` and nothing in place of `walkthrough`.
  Phase 3's remaining shape is `evidence`, `docs check`, `docs affected`.
- **`--json` is unbounded, so callers own their context budget.** PRD §18 is satisfied by giving the
  caller `--limit`, `--depth` and `--label`, not by codedocs choosing for it.
- **The global flag set is closed** — `--json`, `--no-update`, `--limit`, `--claims`, `--label`,
  `--exclude-label`, `--cwd`, `--color` / `--no-color` — and **no operation may redefine a global
  flag's meaning**. Per-operation flags are additive only (`--to`, `--depth`, `--base`, `--fail-on`).
- **`docs affected` with no arguments uses the drift set**, not a diff against a guessed default
  branch. ADR 0004 already computes it before every answer, so the zero-argument case answers "what
  have I broken right now" with no git and no configuration; `--base <ref>` widens it.
- **The `report-bug` payload is still open, deliberately.** The operation is named and owes the
  envelope like any other, but _what is safe to include_ is a PRD §28 privacy question — paths, symbol
  names and dependency versions all leak repository content into a file a user may paste into a public
  issue. That deserves its own decision, not a paragraph at the end of a renderer ADR.
- **Agent discoverability stays unowned.** The `AGENTS.md` block that teaches an agent to shell out is
  the human-facing half of this contract, but it is writing that depends on the finished surface and
  is better done once, after this lands.
