# Reconciling the edge count: the spike's 81,888 against the skeleton's 26,091

Resolves [#27](https://github.com/magicspon/codedocs/issues/27). Measured against
`repos/cal.com` at `176037d0af`, prepared as ADR 0001 requires, on TypeScript 7.0.2 and Node
v24.19.0. Harness: throwaway, run from a scratch directory, not committed — the numbers below are
the artefact.

---

## Verdict

**The spike counted each call site once per project that globs its file. Deduplicated, its 81,888
becomes 23,039, and the skeleton reproduces it edge for edge.** Nothing is dropped.

The whole difference decomposes with no residue:

| Step                                                              |      Edges |
| ----------------------------------------------------------------- | ---------: |
| Spike, verbatim — 31 projects, each sweeping every file it globs  | **81,888** |
| Collapsed on `(from, to, file, pos)`                              |     23,039 |
| Restricted to each file's canonical project, as the skeleton does |     23,037 |
| Skeleton's `symbol`- and `variable`-attributed edges              | **23,037** |
| Skeleton's `file`-attributed edges, which the spike discarded     |    + 3,054 |
| Skeleton total                                                    | **26,091** |

Compared **edge for edge** on the call site `(to, file, line)`, the two sets differ by **zero** in
either direction. The three quoting ADRs keep their verdicts and need their figures corrected.

One number in the ticket is not reproducible: the skeleton produces **26,091**, not 26,606, and it
produces 26,091 both at the walking-skeleton merge (`6a6d092`) and at current `main`. The
reconciliation is stated against 26,091.

---

## 1. Two discovery rules, and they see the same files

The spike and the skeleton do not agree on what a project is, which had to be ruled out before
multiplicity could be blamed for anything.

| Rule                          | Pattern                                               | Configs |
| ----------------------------- | ----------------------------------------------------- | ------: |
| Spike (`run.mjs`)             | `tsconfig(\..+)?\.json` bar `*.build.json`, depth ≤ 6 |      31 |
| Skeleton (`discoverProjects`) | exactly `tsconfig.json`, no depth cap                 |      28 |

The three the spike adds are `packages/trpc/tsconfig.server.json`,
`packages/trpc/tsconfig.react.json` and `packages/lib/tsconfig.test.json` — all variants beside a
`tsconfig.json` that the skeleton already opens.

**Both rules see exactly the same 4,827 repository files.** The stricter rule loses no coverage; it
only removes overlap, which is what `discoverProjects` already claimed in its doc comment and had
not measured. So the edge gap is not a membership gap.

## 2. How much cal.com's projects overlap

| Under                  | Distinct files | File–project pairs |      Ratio |
| ---------------------- | -------------: | -----------------: | ---------: |
| Skeleton's 28 projects |          4,827 |             17,113 | **3.545×** |
| Spike's 31 projects    |          4,827 |             19,231 | **3.984×** |

**2,874 of 4,827 files — 59.5% — belong to more than one project**, and one belongs to 18. The
largest project, `apps/web/tsconfig.json`, globs 3,396 files from 937 root files; five projects glob
over 1,500 each.

The ticket guessed "near 3×". The measured figure is 3.5–4×, which is the right order and slightly
under-stated.

## 3. The 81,888, decomposed

Re-running the spike's `backend-ts7-sweep.mjs` unchanged reproduces its stored result exactly —
81,888 edges, 48,517 symbols, 251,648 unattributed — which is what makes the decomposition
trustworthy.

The cause is one line. `symbols()` holds its `seen` set **outside** the project loop, so a file
contributes its declarations once. `callEdges()` declares `seen` **inside** it, so a file
contributes its call sites once per project. Symbols were deduplicated and edges were not.

Collapsing the raw edges on `(from, to, file, pos)` — the same call site, found again — gives
**23,039**, a 3.554× over-count that tracks the 3.545× file multiplicity almost exactly.

Restricting the sweep instead to each file's canonical project, which is the skeleton's rule, gives
**23,037**. So canonicalisation costs **2 edges** out of 23,039 (see §6).

## 4. Every call site, on both sides

Duplication also inflated the unattributed count, so the honest check is that all of cal.com's call
sites are accounted for identically. Restricting the spike to canonical files:

| Spike outcome, canonical files only            |       Count | Skeleton                          |       Count |
| ---------------------------------------------- | ----------: | --------------------------------- | ----------: |
| resolved to a repository symbol                |      23,037 | `symbol` + `variable` attribution |      23,037 |
| no named enclosing declaration — **discarded** |       3,054 | `file` attribution — **an edge**  |       3,054 |
| resolved outside the symbol table              |      83,503 | `unresolved_call`, `external`     |      83,503 |
| callee did not resolve to a symbol             |       6,116 | `unresolved_call`, `unresolvable` |       6,116 |
| **Total call sites**                           | **115,710** |                                   | **115,710** |

Every row matches. The spike's per-project total was 333,536 call sites over 19,231 file–project
pairs; the canonical total is 115,710 over 4,827 files.

**The spike's headline blind-spot claim survives.** In-repo call sites were 24.6% of the spike's
inflated total and are **22.5%** of the deduplicated one — a repository's call graph is still about
a quarter of its call sites, so ADR 0002's argument and PRD §27's honesty requirement are unchanged.

## 5. Edge for edge, not count for count

Comparing the spike's canonical edges against the skeleton's index as multisets:

- On the call site `(to, file, line)`: **0 edges only in the spike, 0 only in the skeleton.**
- On the full edge `(from, to, file, line)`: 5,905 differ — in `from` only.

Every one of the 5,905 is the skeleton crediting a **strict ancestor** of the node the spike
credited, with **zero** unrelated cases. That is ADR 0002's attribution rule, already documented in
`attribute()`: the spike stops at the nearest _named_ ancestor, the skeleton at the nearest
_callable_ one. Where a call sits in a variable initialiser the spike says `loadConfig.env` and the
skeleton says `loadConfig`.

Bucketed by the skeleton's own attribution: 12,749 agree as `symbol`, 4,383 agree as `variable`, and
5,905 disagree as `symbol` — the disagreements are exactly the sites where an enclosing callable
outranks a nearer named variable.

## 6. The two edges canonicalisation cannot see

Both are the same callee in the same file:

```
packages/features/bookings/lib/useFilterQuery.tsx#filterQuerySchema
  -> packages/types/business-days-plugin.d.ts#dayjs        (lines 15 and 19)
```

`business-days-plugin.d.ts` is an ambient declaration that only some projects include. The canonical
project for `useFilterQuery.tsx` is not one of them, so there the callee resolves outside the symbol
table and the site is recorded as `external` rather than as an edge.

Two edges in 23,039 is not worth a second sweep, and the loss is honest — the site is still stored,
with a cause. It is recorded here rather than fixed, and it is the shape of thing to watch if
ambient declarations ever carry more of a repository's surface.

## 7. A single-project control

If duplication is the whole story, a repository with one project must show no gap at all.
`next-fullstack-realworld-app` has one `tsconfig.json`:

|                           | Spike | Skeleton                                  |
| ------------------------- | ----: | ----------------------------------------- |
| Edges with a named caller |   223 | **223** (222 `symbol` + 1 `variable`)     |
| Unattributed / unresolved |   508 | **508** (506 unresolved + 2 `file` edges) |

Exact, in both directions, with no deduplication applied to either side.

## 8. A separate finding: 6,746 symbols collapse on their id

Not part of the edge question, but it fell out of the same run and it is the other place the spike's
figures and the skeleton's disagree.

The spike counted **48,517 declarations**. The skeleton's `symbol.id` is a primary key written with
`insert or ignore`, so declarations sharing a `file#qualified` collapse into one row: **41,771
distinct ids, 6,746 collapsed across 1,571 colliding ids**.

- **6,690 of the 6,746 are `variable`s**, and **6,695 are cases where every colliding declaration is
  a local** (`durable: false`).
- The worst is `getBookingResponsesSchema.test.ts#schema` at **69 declarations under one id** — a
  `const schema` repeated once per test case.
- Only **45** are cases where every colliding declaration is top level, which is the overload and
  declaration-merging collapse ADR 0002 chose deliberately.

The cause is that an anonymous callback contributes no segment to a qualified name, so two locals in
sibling `it(...)` blocks are indistinguishable. ADR 0002 anticipated naming locals "by descriptor
path rather than ordinal"; the descriptor path does not separate these, and it rejected an ordinal
for reasons that still hold. The consequence is bounded — the merged ids are non-durable locals,
overwhelmingly in test files — but a `callers` answer for such an id over-reports, so it is a real
imprecision rather than a cosmetic one. Filed as
[#34](https://github.com/magicspon/codedocs/issues/34).

## 9. Hand-off to #29

[#29](https://github.com/magicspon/codedocs/issues/29) is scoped against a corpus that no longer
exists, and its target moves. ADR 0004 sized the index from a 40 MB JSON dump of **48,517 symbols
and 81,888 edges**; the real index holds **41,771 symbols and 26,091 edges** and still measures
**51,302,400 bytes**. So the overshoot is worse than 48 MB against 20 MB — it is 48 MB for a third of
the edges.

Two tables the sized corpus never held account for 28% of the file. Per-table, from `dbstat`:

| Object                                    |   Bytes | Share |
| ----------------------------------------- | ------: | ----: |
| `symbol` + its four indexes               | 21.9 MB | 42.7% |
| `call_edge` + its two indexes             | 12.1 MB | 23.6% |
| `unresolved_call` (no index)              |  8.4 MB | 16.5% |
| `file_import` + its two indexes           |  5.7 MB | 11.1% |
| `file`, `file_project`, `seen_file`, rest |  3.2 MB |  6.1% |

Interning ids attacks the first two rows, which is 66% of the file and the right target. But
`unresolved_call` is 89,619 rows carrying a repeated file path and callee text, and it was never in
ADR 0004's arithmetic at all.

## 10. What changes

| Document                                | Was                                       | Now                                          | Verdict |
| --------------------------------------- | ----------------------------------------- | -------------------------------------------- | ------- |
| ADR 0002, external symbols              | 251,648 external vs 81,888 in-repo        | 92,673 vs 26,091 — a **wider** ratio         | Stands  |
| ADR 0004, the sized corpus              | 48,517 symbols, 81,888 edges, 4,344 files | 41,771 symbols, 26,091 edges, 4,827 files    | Stands  |
| ADR 0006, the budget default            | "cal.com's entire edge set is 81,888"     | 26,091 — a **smaller** set to send unbounded | Stands  |
| `adapter/ts7.ts`, the `isRepoFile` note | 251,648 against 81,888                    | 92,673 against 26,091                        | Stands  |

No verdict reverses, and two arguments get stronger: rejecting external symbols as nodes, and
refusing a silent `--json` limit.

ADR 0004's comparison table (110 ms JSON against 30 ms SQLite, 270 MB RSS against 48 MB) was
**measured on the inflated corpus** and is not re-run here. Its decision rests on the ratio, which a
uniformly smaller corpus does not reverse, but the absolute figures should be read as an upper bound
until #29 re-measures.

The [backend spike's own findings](./call-graph-backend-spike.md) are left as written. They record
what that spike measured, which is reproducible and correct for the method it used; a correction
note at §3 points here.
