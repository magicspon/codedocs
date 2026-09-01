---
status: accepted
---

# The reader is a developer, and the boundary is fallow

codedocs is a **deterministic semantic index of a TypeScript repository**, and the questions it
exists to answer are asked by a person: what calls what, where a declaration actually comes from, how
execution flows out of a handler, and what a change could reach. An agent is one more caller of the
same [[Operation]]s — the third binding ADR 0006 already names — and not the reader the operations are
shaped for. `evidence` is one operation among thirteen, not the point of the product.

Nothing in ADR 0006 changes. The [[Envelope]], the four renderer rules, the exit codes and the ban on
composing above an operation all stand. What this decision settles is **which unbuilt operations
survive**, and it settles it with one rule: **codedocs implements no analysis `fallow` already
ships.**

## The questions codedocs is for

Four shapes, each named against what fails at it today rather than against an audience.

| Question                                    | What fails at it now                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------ |
| What calls this, anywhere in the repository | An editor answers within one project; cal.com has 28 of them                         |
| Where does this declaration come from       | Text search finds the specifier, not the declaration behind a barrel and a re-export |
| How does execution flow out of here         | No editor offers it — `trace` is the operation with no equivalent elsewhere          |
| What could this change reach                | Needs call edges and a [[Baseline]]; neither a grep nor a diff has one               |

The last one is the whole of the change axis. It is one question, and the sections below spend most
of their length on it because it is the only place where a second tool has a claim.

## The boundary with fallow

This repository already depends on `fallow`, and half of what a "codebase intelligence" tool is
expected to report is what `fallow` reports. The split is not negotiated per feature; it follows from
the rule.

| Capability                                 | Owner      | Why                                                                   |
| ------------------------------------------ | ---------- | --------------------------------------------------------------------- |
| Unused files, exports, types, dependencies | `fallow`   | `dead-code`, with `--trace` to confirm before deleting                |
| Circular dependencies                      | `fallow`   | `dead-code`                                                           |
| Copy-paste and structural duplication      | `fallow`   | `dupes`                                                               |
| Complexity, maintainability, hotspots      | `fallow`   | `health`                                                              |
| Architecture boundary violations           | `fallow`   | configured boundaries in `.fallowrc.jsonc`                            |
| Changed-file risk in CI                    | `fallow`   | `audit --base`, and `ci` builds the PR envelope                       |
| Every call edge into or out of a symbol    | `codedocs` | needs a type checker resolving through barrels; `fallow` is syntactic |
| Call paths out of a root                   | `codedocs` | the index holds the graph; nothing else here walks it                 |
| What a symbol change reaches               | `codedocs` | needs call edges **and** a baseline index; `fallow` has neither       |
| Which tests a change reaches               | `codedocs` | the same walk, scoped to `role: test`                                 |
| Which documents a change contradicts       | `codedocs` | ADR 0005's [[Claim]]s exist nowhere else                              |

The rule is not politeness. Two tools reporting on the same repository will disagree, and a developer
holding two dead-code reports has no way to decide which is right — the second answer costs more than
it adds, whichever is more accurate. The temptation is real and specific: a typed index with a call
graph would answer "is this export reachable" better than a syntactic pass can. It is still refused.
The accuracy gain is unmeasured, the confusion is certain, and `fallow dead-code --trace` already
exists for the case where the syntactic answer is doubted.

Where the typed index has something `fallow` genuinely cannot get, it arrives phrased as a **change**
question — `impact` — and never as a second report about hygiene. The distinction is the question
asked, not the machinery underneath it.

## Phase 5 collapses to one operation

ADR 0006 named three composed operations for Phase 5 and specified them elsewhere. Two do not survive
the rule, and they fail for reasons already established in this repository.

**`review` is deleted.** Split PRD §16 and every half has an owner. "Does this change fit the
architecture" and "did it introduce an unexpected dependency" are boundary and dependency-hygiene
checks, which `fallow` ships and `ci` already formats for a pull request. What remains is _this change
touched a symbol with 176 callers, and four documents claim things about it_ — which is `impact` and
`docs affected` printed next to each other. Printing two answers together is a renderer's job, and
ADR 0006 forbids an operation that composes above operations.

**`plan` is deleted.** PRD §14 asked which files an agent should modify. That is a ranking, a ranking
is a judgement, and ADR 0006 already deleted `search` on exactly that reasoning — an inferred ordering
cannot also be the determinism guarantee. `plan` is the same deletion one level up. What is actually
needed to plan a change is the facts about the symbols involved, which is `evidence`.

**`impact` survives, and is the only composed operation.** It is the one answer that needs more than
one part of the index at once — the [[Continuity]] matcher of ADR 0007 against a [[Baseline]] of
ADR 0008, then the reachability walk of `trace` — and no combination of the other operations produces
it, which is the test ADR 0006 set for composition living inside an operation.

## Affected tests are not an operation

The obvious next command after `impact` is `affected-tests`, and it must not be written. ADR 0003
already labels every file `source`, `test` or `config`, and ADR 0006 already routes label filters
through the scope channel. Which tests a change reaches is therefore:

```sh
codedocs impact --base main --label role=test
```

A dedicated operation would be a second traversal to keep in step with `impact` for the rest of the
project's life — the precise reason `walkthrough` was absorbed into `trace` rather than renamed.

## The order the rest is built in

Reordered by what a developer can use, rather than by ADR 0006's phases, which were ordered by what an
agent needed. Each step is gated by the one above it.

1. **`references` and `file`.** They complete the relationship set, and `impact` cannot be honest
   without `references` — a changed type reaches everything that names it, not only its callers.
2. **`doctor`.** All four of ADR 0001's signals are measured and stored and have nowhere to be read
   whole. It is also the first operation that can reach exit code `1`, so CI gets a shape to fail on
   before anything is built that depends on failing.
3. **The label layer**, which ADR 0003 specified, `codedocs.jsonc` already parses, and both the scope
   channel and affected tests are blocked on.
4. **`impact`**, with the [[Capture]] and retention of ADR 0008 underneath it.
5. **`evidence`**, once labels and fidelity exist for it to assemble.
6. **`docs check` and `docs affected`.**
7. **`report-bug`**, per ADR 0011.

## Considered Options

- **Take the `fallow`-covered analyses anyway**, on the grounds that a typed index with a call graph
  answers reachability better than a syntactic pass. Rejected: it produces two tools that disagree
  about one repository, with no procedure for deciding between them, in exchange for an accuracy gain
  nobody has measured.
- **Keep `review` as a pull-request report.** Rejected: `fallow ci` builds that envelope today, and
  what codedocs would add is two of its own operations rendered together.
- **Keep `plan` as an advisory operation** that names files without ranking them. Rejected: without a
  ranking it is `symbol` plus `references`, and with one it is a judgement the determinism rule
  forbids.
- **Historical coupling — how two areas' dependence on each other moved over time.** Rejected for
  now, not on principle: it needs an [[Index]] per commit across a window, and ADR 0008 keeps three
  [[Baseline]]s deliberately, on measured disk cost. Reopen it with a measurement showing a trend is
  readable at three points, or with a cheaper per-commit summary that is not a whole index.
- **A GitHub check or an IDE extension as a fourth binding.** Rejected as premature rather than
  wrong. A GitHub check is `--json` plus an exit code, and both already exist; an IDE extension is a
  binding to keep honest before the operation set it binds is finished.
- **A `context` command that bundles several subjects for a prompt.** Rejected: it is `evidence` with
  a loop above it, which is composition above an operation, and it privileges the one consumer this
  decision just declined to design for.
- **Leaving the framing alone**, since the README already says "no LLM" and "the CLI is the product".
  Rejected: `docs/REQUIREMENTS.md` opened with "AI writes the code", every operation in it was
  addressed to an agent, and PRD §33 measured success as an agent doing better with codedocs than
  without. The centre of gravity was in that document, not in the README.

## Consequences

- **ADR 0006's Phase 5 loses two names.** Its operation enum was to carry `impact`, `review` and
  `plan` from day one so their arrival would be additive; it now carries `impact` alone. Removing two
  enum members before anything is written against them costs nothing; removing them later would be a
  schema break.
- **`docs/REQUIREMENTS.md` is replaced** by a developer-first product definition. The original is
  frozen at [`docs/PRD-v1.md`](../PRD-v1.md), unedited, because ADRs 0001–0011 cite it by section
  number twenty-eight times and those citations record what was decided against.
- **PRD §33 is no longer the success criterion.** "An agent with codedocs beats an agent without" is
  measurable but tests the wrong thing; the criterion is a developer question answered correctly that
  an editor cannot answer at all. [#21](https://github.com/magicspon/codedocs/issues/21) is narrowed, not
  closed.
- **`fallow` becomes a documented neighbour** rather than an undiscussed overlap. The README says
  which tool to reach for, so the boundary is visible to someone deciding whether to file a feature
  request.
- **No new binding.** CI is `--json` and an exit code, which ADR 0006 already fixed.
