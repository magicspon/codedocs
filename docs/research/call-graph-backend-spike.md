# Spike: cross-file call graph on a real repo, two backends, measured

Resolves [#6](https://github.com/magicspon/codedocs/issues/6). Spike code:
`spike/call-graph/` on the `spike/call-graph-backends` branch — throwaway, not part of the
workspace, expected to be deleted once the ADR lands.

---

## Verdict

**Build on TypeScript 7.0.2's `typescript/unstable/sync`, and build the call graph by sweeping call
sites, not by querying symbols.**

Three findings, in descending order of consequence:

1. **The era question is settled empirically, and the capability matrix was wrong about TS 7.**
   TypeScript 7.0.2 ships a real, typed navigation surface. `Checker.getSignatureUsage` resolves
   call sites through barrel files and renamed re-exports, and distinguishes an invocation from a
   mere reference. With one client-side JSX rule it reproduces TS 6's call hierarchy **edge for
   edge** (150/150) on a real 73-file Next.js app. TS 6 wins nothing on capability.

2. **TS 6 cannot open a real monorepo.** In-process, cal.com's 31 projects exhaust an 8 GB heap
   after 66 s and abort. TS 7 completes the same work at 2.4 GB peak. TS 6 survives only
   process-per-project, at roughly half the speed everywhere.

3. **The obvious algorithm is the wrong one, and this is the spike's most valuable result.**
   Asking "who calls X" per symbol costs 12.6 ms per query at 3,000 files, is **unbatchable**, and
   scans the whole program every time — a projected **122 s** for one cal.com project. Sweeping
   call sites instead and resolving callees in batches produces a **strict superset** of the same
   edges in **4.1 s**: a 30× improvement, more precise, and with no callable-classification
   heuristic needed. Whole-repo, all 31 projects, 81,888 edges: **22.9 s**.

The cost of the recommended path is a hard dependency on an explicitly unstable API. That is a
known, accepted risk from the incremental-analysis findings; this spike does not change it.

---

## 1. What TypeScript 7.0.2 actually exposes

The `.d.ts` is a claim; every row below was verified by calling the method against the shipped
binary (`spike/call-graph/probe-surface.mjs`).

| Method                                                                          | Result                                                       |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `Checker.getSignatureUsage(decl)`                                               | **works** — the call-graph primitive; see §2                 |
| `Checker.getReferencedSymbolsForNode(node, pos)`                                | **works** — find-all-references shape, grouped by definition |
| `Checker.getReferencesToSymbolInFile(file, symbol)`                             | **works**, but file-scoped and alias-blind; see §2           |
| `Checker.getSymbolAtLocation(node \| node[])`                                   | **works, batched**                                           |
| `Checker.getSymbolAtPosition(file, pos \| pos[])`                               | **works, batched**                                           |
| `Checker.getTypeOfSymbol(sym \| sym[])`                                         | **works, batched**                                           |
| `Checker.getTypeAtLocation(node \| node[])`                                     | **works, batched**                                           |
| `Checker.getExportsOfModule`, `getAliasedSymbol`, `getResolvedSignature`        | **works**                                                    |
| `Checker.getDeclaredTypeOfSymbol` + `getPropertiesOfType` + `getBaseTypes`      | **works**                                                    |
| `Program.getSourceFileMetadata`, `isSourceFileFromExternalLibrary`              | **works**                                                    |
| `Program.getSemanticDiagnostics(file)`                                          | **works**                                                    |
| `api.parseConfigFile`, `Snapshot.getDefaultProjectForFile`, `api.getTimingInfo` | **works**                                                    |
| `getImplementationAtPosition`                                                   | **absent** — not declared, not on the object                 |
| call hierarchy (`prepareCallHierarchy` and friends)                             | **absent**                                                   |
| `batchRequests`                                                                 | **absent**                                                   |

So the two research tickets were each half right, and the split is not where either expected.
[Capability matrix](https://github.com/magicspon/codedocs/issues/2) was correct that TS 7 ships no
call hierarchy and no `getImplementationAtPosition`. It was wrong that this costs codedocs PRD §8:
`getSignatureUsage` covers callers and callees directly, and better than call hierarchy does.
[Incremental re-analysis](https://github.com/magicspon/codedocs/issues/5) was correct that the
navigation surface is real and the published guidance is stale.

Two API notes for the adapter:

- **`DocumentIdentifier` is `string | { uri: string }`.** Passing any other object shape — a
  plausible `{ fileName }`, say — yields **zero projects and no error**. `updateSnapshot` returning
  an empty project list must be a hard failure in the adapter.
- **`Diagnostic` is flat** — `{ fileName, pos, end, code, category, text }`. There is no
  `messageText` chain to walk, unlike TS 6.

---

## 2. The call-graph primitive, and what it gets right

`getSignatureUsage(decl)` returns `{ name: NodeHandle, call?: NodeHandle }[]`. `name` is every
reference; `call` is present when that reference is invoked. Measured against a hand-written
adversarial fixture (`spike/call-graph/fixture/`), it is correct on every case that matters:

| Case                                                               | Result                                                         |
| ------------------------------------------------------------------ | -------------------------------------------------------------- |
| plain cross-file call                                              | ✅ exact                                                       |
| call through a **barrel** `export *`                               | ✅ resolved to the original declaration                        |
| call through a **renamed re-export** (`chargeCard as charge`)      | ✅ resolved                                                    |
| callee passed through a **generic** (`withRetry(() => charge(n))`) | ✅ both edges found                                            |
| **arrow const** callee (`const f = () => {}`)                      | ✅ — but see the trap below                                    |
| call inside a file with a **type error**                           | ✅ edges still returned                                        |
| **JS → JS** internal call, no types                                | ✅                                                             |
| **TS → JS** call into an untyped module                            | ✅                                                             |
| symbol with no callers                                             | ✅ zero usages                                                 |
| **dynamic dispatch** (`gateway[method](n)`)                        | ⚠️ no edge — correctly no _false_ edge, silently no _real_ one |
| **interface / implementation dispatch**                            | ❌ over-approximated; see §3                                   |

The re-export result is worth dwelling on, because it is the case a syntactic tool cannot reach:
`checkout.ts` imports `charge` from a barrel that renames it from `payments.ts`, and
`getSignatureUsage(chargeCard)` reports the `checkout.ts` call site directly.

**`getReferencesToSymbolInFile` is a different and much weaker thing.** Asked for references to
`chargeCard` in `checkout.ts` — a file that calls it through the alias — it returns **0**. It is
name-bound within one file and does not follow aliases. It is not a substitute.

### Trap: `getSignatureUsage` silently returns nothing for the wrong node

`const f = () => {}` is the dominant callable shape in modern TypeScript. `getSignatureUsage` wants
the **`VariableDeclaration`**:

| Node passed                     | Usages returned |
| ------------------------------- | --------------- |
| `VariableDeclaration`           | **2** (correct) |
| its `ArrowFunction` initialiser | 0               |
| its name `Identifier`           | 0               |

No error, no warning. An implementation that passes the `ArrowFunction` gets an empty call graph
for most of a modern codebase and no indication anything is wrong. This joins the two
silent-wrong-answer traps from the incremental findings; it is the third.

### Trap: JSX invocations arrive with `call` absent

This is the fourth, and the most expensive to miss. Compared against TS 6's call hierarchy on the
Next.js fixture, TS 7's edges were a **strict subset — 109 of 150** — and every one of the 41
missing edges was a JSX element: `<ArticlePreview />`.

The usages _are_ reported. `getSignatureUsage` lists them with `call` **undefined** and the `name`
handle's parent a `JsxOpeningElement`, `JsxSelfClosingElement` or `JsxClosingElement`. Trusting
`.call` alone drops **27% of this repo's call graph** — and far more in a component-heavy one —
without a single diagnostic.

Adding one client-side rule (an opening or self-closing tag is an invocation; the closing tag is
the same invocation and would double every edge) brought TS 7 to **150/150 exact parity** with TS
6, symbol for symbol and edge for edge.

**A JSX element is a call.** For a product whose language scope is TS + TSX, that is not an edge
case, and no API flag will tell you.

### Trap: `NodeHandle.path` is case-normalised

`NodeHandle.path` comes back lowercased on macOS; `Program.getSourceFileNames()` preserves real
casing. A symbol id built from one will not match an id built from the other. This surfaced as an
apparent 0-of-13 edge disagreement between backends that was purely a path-casing artefact. Path
normalisation belongs in the adapter, at the boundary, once.

---

## 3. What the chosen backend cannot do

These are the "unable to verify" cases for doc validation and the honesty boundary PRD §27 demands.
They are properties of the type checker, not of this spike's code, and **TS 6 exhibits every one of
them identically** — they are not a reason to prefer the other era.

### Method dispatch is over-approximated across implementations

Given `interface Gateway { capture() }` with two implementing classes, and two call sites — one
through the interface, one on a concrete `StripeGateway` — `getSignatureUsage` returns **both call
sites for all three declarations**:

```
callers of Gateway.capture        → gateway.capture(amount)   new StripeGateway().capture(amount)
callers of StripeGateway.capture  → gateway.capture(amount)   new StripeGateway().capture(amount)
callers of PaypalGateway.capture  → gateway.capture(amount)   new StripeGateway().capture(amount)
```

`PaypalGateway.capture` is reported as called at a site that constructs a `StripeGateway`. That
edge does not exist. Callers of one implementation include the callers of every sibling
implementation.

Plain function edges are exact. **Method edges through a shared name are `inferred`, not
`deterministic`**, and the model must carry that distinction per edge — which is precisely what the
call-site sweep of §4 fixes, because it resolves to the declared target instead.

### Dynamic dispatch is invisible

`gateway[methodName](n)` produces no edge. No false edge either — but `impact` will under-report,
and codedocs cannot know it did.

### Reachable-but-callerless code looks dead

The sharpest available case, and the one the map flagged in advance. Redwood Cells export a
`QUERY` const the framework consumes and no code calls:

| Cell export | cells | zero usages | zero **calls** |
| ----------- | ----- | ----------- | -------------- |
| `QUERY`     | 5     | 4           | **5**          |
| `Loading`   | 5     | 3           | **5**          |
| `Empty`     | 4     | 2           | **4**          |
| `Failure`   | 5     | 3           | **5**          |
| `Success`   | 5     | 0           | **5**          |

Every single Cell export has zero call edges. A naive "no callers ⇒ dead" rule deletes a Redwood
app's entire data layer.

Worse than uniform silence: the signal is **inconsistent**. `Success` has one usage in all five
cells and `ArticlesCell`'s `QUERY` has one, while its siblings have none. Partial evidence reads
like real evidence. Any dead-code claim needs an explicit framework-entry-point escape hatch, and
its absence must degrade to `unable to verify` rather than to `dead`.

### A call site can have no named caller

`enclosingNamed` walks out from a call site to the nearest named declaration. Sometimes there
isn't one, and the two shapes are both common:

- **module-level calls** — a call in a file's top-level statements has no enclosing declaration.
  The honest caller is the **File** or **Module** node, which means the model needs one.
- **calls inside anonymous callbacks** — Redwood's test files call components from arrow functions
  inside `it(...)`. 28 of Redwood's call sites are unattributed for this reason, and _all_ of them
  are in test files.
- **calls in a variable initialiser** attribute to the variable, not the enclosing function:
  `const result = chargeCard(...)` inside `brokenCaller` yields the caller key
  `brokenCaller.result`. Defensible, but it must be a deliberate decision, not an accident of a
  parent walk.

### Most calls leave the repo

On cal.com, the sweep resolved **81,888** call sites to symbols in the repo's own symbol table and
left **251,648** unattributed — overwhelmingly calls into `node_modules`. **A repository's call
graph is about a quarter of its call sites.** Whatever `trace` and `impact` claim about
completeness has to be honest about the other three quarters.

> **Both counts are per project, not per file** — this sweep visits a file once for every project
> that globs it, and cal.com's files belong to 3.5 apiece. Deduplicated they are 26,091 and 92,673.
> The ratio is what this section is about and it barely moves: 24.6% becomes **22.5%**, so the
> quarter still holds. See
> [`edge-count-reconciliation.md`](./edge-count-reconciliation.md), which decomposes the 81,888 and
> reproduces it edge for edge.

---

## 4. The algorithm: sweep call sites, do not query symbols

### Why the obvious way does not scale

Per-callable cost of `getSignatureUsage`, holding the code identical and varying only program size:

| Program                       | files | ms per callable |
| ----------------------------- | ----- | --------------- |
| hand fixture                  | 5     | 1.1             |
| next-fullstack-realworld-app  | 72    | 1.3             |
| redwood-realworld-example-app | 101   | 1.9             |
| cal.com `packages/lib`        | 461   | 4.0             |
| cal.com all 31 projects       | 4,344 | 13.2            |
| cal.com `apps/web`            | 3,028 | **17.6**        |

The cost is in the query, not in the harness. Splitting it (`probe-cost-split.mjs`) on cal.com
`apps/web`:

```
getSignatureUsage:  12.60 ms per call   ← 98% of the time
handle.resolve():    0.024 ms per handle ←  2%
client-side parse of every file walked: 116 ms total
```

Each call scans the whole program, and **it cannot be batched** — passing an array throws
`getNodeId requires a RemoteNode`. So a whole-repo call graph this way is
O(callables × program size): a projected **122 s** for cal.com `apps/web` alone, and **124 s**
across all 31 projects.

The batching that the incremental findings measured at 17× is real, but it is available on
`getSymbolAtLocation`, `getSymbolAtPosition`, `getTypeOfSymbol` and `getTypeAtLocation` — and _not_
on the one method the naive call graph is built from.

### The inversion

The AST is already local and cheap to walk (116 ms for 3,396 files). So enumerate every call site
client-side — `CallExpression`, `NewExpression`, `JsxOpeningElement`, `JsxSelfClosingElement` —
collect the callee identifiers, and resolve them in **batches of 500** with
`getSymbolAtLocation(nodes[])`, matching each resolved symbol's declaration back to the symbol
table by `(path, start)`.

One pass over call sites, batched, instead of one whole-program scan per callable.

| cal.com `apps/web`, full call graph | per-symbol            | call-site sweep |
| ----------------------------------- | --------------------- | --------------- |
| call-graph wall time                | 121.9 s _(projected)_ | **4.1 s**       |
| edges                               | —                     | 17,238          |
| peak RSS                            | 3.0 GB                | 3.6 GB          |

**30× faster.** And it is not a trade of accuracy for speed — on the Next.js fixture the sweep is a
**strict superset**: all 150 edges the per-symbol method found, plus 25 more.

The 25 extra edges are real and instructive. They are calls to _local_ bindings —
`const t = useTranslations()` and then `t(...)`, `const formatDateTime = …` and then calling it.
The per-symbol approach structurally cannot find them, because you have to decide in advance which
symbols are callable and ask about those. **The sweep needs no callable-classification heuristic at
all: the call site tells you.** Given how much of §3's trouble comes from classifying
declarations, deleting that decision is worth as much as the speed.

The sweep is also **more precise on method dispatch**. Where `getSignatureUsage` returns the union
across an interface and all its implementations, the sweep resolves the callee to its _declared_
target and emits one edge. The implementations that could actually run at that site become a
separate, explicit, `inferred` query — which is the honest shape, and the one PRD §27 asks for.

Two costs, both fixable and neither load-bearing:

- **Alias following is unbatched.** When a resolved symbol is an import or re-export alias, the
  sweep falls back to `getAliasedSymbol` one symbol at a time. That is most of the 100,161 requests
  in the whole-repo run. Resolving through declaration handles, or batching the follow-up, is the
  first optimisation to make.
- **Unattributed call sites need triage.** 46,534 on `apps/web` — mostly library calls, which are
  correct to exclude, but the bucket currently conflates "outside the repo", "unresolvable", and
  "no named caller". Those are three different facts and the model owes them three different names.

---

## 5. The numbers

Measured on macOS (Darwin 25.5.0), Node v24.19.0, TypeScript 7.0.2 and 6.0.3. Peak RSS is this
process **plus every descendant**, so TS 7's figures include the spawned `tsc` server. Index size
is the serialised symbol table plus edges — what codedocs would actually persist.

### Cold analysis, full runs

| Fixture              | files | symbols | backend         | open     | enumerate | call graph      | edges  | peak RSS  | index  |
| -------------------- | ----- | ------- | --------------- | -------- | --------- | --------------- | ------ | --------- | ------ |
| hand fixture         | 5     | 23      | TS 7 per-symbol | 31 ms    | 2 ms      | 21 ms           | 16     | 121 MB    | 11 KB  |
|                      |       |         | TS 6            | 169 ms   | 0 ms      | 34 ms           | 16     | 216 MB    | 11 KB  |
|                      |       |         | **sweep**       | 29 ms    | —         | **3 ms**        | 13     | 113 MB    | 11 KB  |
| next-fullstack       | 72    | 359     | TS 7 per-symbol | 59 ms    | 14 ms     | 128 ms          | 166    | 250 MB    | 178 KB |
|                      |       |         | TS 6            | 541 ms   | 2 ms      | 298 ms          | 166    | 422 MB    | 177 KB |
|                      |       |         | **sweep**       | 51 ms    | 12 ms     | **137 ms**      | 223    | 325 MB    | 200 KB |
| redwood _(prepared)_ | 101   | 434     | TS 7 per-symbol | 121 ms   | —         | 298 ms          | 107    | 317 MB    | 181 KB |
|                      |       |         | TS 6            | 1,156 ms | 3 ms      | 817 ms          | 107    | 689 MB    | 178 KB |
|                      |       |         | **sweep**       | 84 ms    | 18 ms     | **160 ms**      | 116    | 387 MB    | 183 KB |
| cal.com `apps/web`   | 3,028 | 30,586  | TS 7 per-symbol | 566 ms   | —         | _121.9 s proj._ | —      | 3.0 GB    | 10 MB  |
|                      |       |         | TS 6            | 3,759 ms | —         | _240.1 s proj._ | —      | 3.4 GB    | 10 MB  |
|                      |       |         | **sweep**       | 467 ms   | 526 ms    | **4.1 s**       | 17,238 | 3.6 GB    | 16 MB  |
| cal.com **all 31**   | 4,344 | 48,517  | TS 7 per-symbol | 1,565 ms | 732 ms    | _124.4 s proj._ | —      | 2.6 GB    | 16 MB  |
|                      |       |         | TS 6            | **OOM**  | —         | —               | —      | **>8 GB** | —      |
|                      |       |         | **sweep**       | 1,336 ms | 792 ms    | **22.9 s**      | 81,888 | 2.4 GB    | 48 MB  |

Projected figures are `measured ms-per-callable × total callables`, from a deterministic every-Nth
sample of the callables (247–386 of them). They are the reason the per-symbol design was rejected
before paying for a full run.

**TS 6 on cal.com's 31 projects:** `FATAL ERROR: Ineffective mark-compacts near heap limit` at
`--max-old-space-size=8192`, 66 s in, during project open. It never reached the call graph. It
completes `packages/lib` (461 files, 1.1 GB) and `apps/web` (3,028 files, 3.4 GB) individually, so
process-per-project would work — at roughly 2× the cost of TS 7 everywhere.

### Warm query

**0.04–0.05 µs** per "who calls X", from the in-memory reverse index, on every fixture. This is not
a meaningful measurement of anything except that **once the graph exists, answering is free**. The
entire cost of this product is in building and invalidating the index, which is where the
incremental findings already pointed.

### Preflight, recorded beside every run

| Fixture                | unresolved specifiers | semantic errors | preflight time |
| ---------------------- | --------------------- | --------------- | -------------- |
| next-fullstack         | —                     | —               | —              |
| redwood **unprepared** | **24**                | 320             | 117 ms         |
| redwood **prepared**   | **9**                 | 298             | 98 ms          |
| cal.com `packages/lib` | 18                    | 190             | 576 ms         |
| cal.com `apps/web`     | 542                   | 2,813           | 5.4 s          |
| cal.com **all 31**     | 2,359                 | 17,464          | **36.4 s**     |

Preflight is `getSemanticDiagnostics` over every repo file, and at 36 s whole-repo it costs more
than the call graph does. It cannot be an unconditional first phase of every analysis; it needs to
be incremental, or scoped, or both.

---

## 6. The unprepared run, and what it says about ADR 0001

[ADR 0001](../adr/0001-analysis-preconditions-and-answer-honesty.md) rests on a premise this spike
was asked to test: that a type-aware backend returns confidently wrong answers rather than failing
loudly. Redwood was measured before and after `yarn rw g types`:

|                       | unprepared | prepared |
| --------------------- | ---------- | -------- |
| files                 | 87         | **101**  |
| symbols               | 303        | **434**  |
| call edges            | 102        | **107**  |
| unresolved specifiers | 24         | 9        |
| semantic errors       | 320        | 298      |

**The premise holds, in the worst way available.** Unprepared, the analysis returned a graph — 5
edges short and 131 symbols short — and never signalled a problem. Not an error, not an empty
result, not a warning: a plausible, wrong answer, 30% short on symbols. The honesty machinery in
ADR 0001 is not over-engineered.

Two further corroborations:

**Missing codegen cascades.** Of cal.com `apps/web`'s 542 unresolved specifiers, **302 are the
single specifier `@calcom/prisma/enums`** — one absent generated artefact producing 302 unresolved
imports across the repo. `missing-generated` is not a per-file property; a remediation grouped by
cause fixes hundreds of blind spots at once, which is exactly why ADR 0001 groups them that way.
The remaining 240 split as 222 bare `app/…` specifiers and 6 relative ones — a distinct cause that
resolves only under the framework's own resolution, not the declared `tsconfig`.

**A remediation command can itself fail.** cal.com's `prisma generate` aborts in its own
`prisma-enum-generator` under Node 24 (`ts-node` reading `ts.ScriptTarget` as undefined), so
cal.com was measured in the partially-prepared state its own tooling permits. ADR 0001 rules that
codedocs reports remediations and never runs them; this adds that a reported remediation **may not
work**, for reasons internal to the repository. `doctor` must present a remediation as the command
to try, never as a promise that fidelity will rise.

---

## 7. Consequences for the open tickets

- **[#7 internal representation]** — an edge's `provenance` is not a per-edge-type constant. A
  function call edge is `deterministic`; the same edge kind through a shared method name is
  `inferred`. The model must carry provenance per edge instance. It also needs a **File/Module node
  that can be a caller**, or every module-level call is dropped. And path normalisation has to be
  settled at the adapter boundary, because `NodeHandle.path` and `getSourceFileNames()` disagree on
  case.
- **[#9 local index]** — 48 MB for cal.com's symbols and edges, uncompressed JSON, before any
  documents or history. Warm queries are free from an in-memory reverse index, so the format's job
  is load time and partial invalidation, not query speed.
- **[#10 operation set]** — "who calls X" needs a companion "which implementations could run here",
  because the honest answer at an interface call site is two different facts with two different
  provenances. And a `dead`/`unused` verdict cannot be offered without a framework-entry-point
  escape hatch; the Cells result shows what it costs.
- **[#12 structure classification]** — every unattributed call site in Redwood is in a test file,
  and Redwood's Cells put `.tsx`, `.test.tsx`, `.stories.tsx` and `.mock.ts` in one directory. The
  sweep's caller attribution needs classification to report sensibly, which sharpens #12 from
  "nice for `impact`" to "load-bearing for the call graph".
- **Preflight cost (36 s whole-repo)** is a new constraint on ADR 0001's "always the first phase of
  an analysis". The phase can stay; running it eagerly over everything cannot.

## 8. What was not measured

- **Incremental re-analysis.** Owned by
  [#5](https://github.com/magicspon/codedocs/issues/5), which measured 3–5 ms per changed file
  against 535 ms cold. This spike measured cold analysis only, and its per-request numbers do not
  transfer: #5's figures are for the type-shape wave, not for call-site resolution.
- **codedocs itself**, the ladder's intended first rung. The repo currently contains **one**
  TypeScript file (`vitest.config.ts`), so the self-hosting rung is not yet a fixture. It returns
  as soon as there is source.
- **`microsoft/vscode`**, held in reserve. cal.com did not defeat the sweep, so the ceiling test is
  still worth running before the ADR is final.
- **`tsconfig` globs matching no files.** Zero empty configs across all 31 cal.com projects, so the
  signal ADR 0001 calls load-bearing never fired here. It remains untested against a repo that
  actually exhibits it.
