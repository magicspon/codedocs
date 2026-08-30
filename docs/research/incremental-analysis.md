# Incremental re-analysis with existing TypeScript tooling

Research for [#5](https://github.com/magicspon/codedocs/issues/5). Investigated 2026-08-30
against TypeScript **7.0.2** (published 2026-08-20) and TypeScript **6.0.3**, both installed
locally, plus the `microsoft/TypeScript` Go sources on `main`.

Every timing below was measured on this machine, on fixtures described in
[Method](#method). They are relative figures for comparing strategies, not portable benchmarks.

---

## The short answer

**Given one changed file, the minimum work to bring a type-aware symbol graph back to
correctness is:**

1. Tell the compiler the file changed — `api.updateSnapshot({ fileChanges: { changed: [f] } })`.
   **~2-5 ms**, independent of repo size. The server re-parses only that file and reuses every
   other AST and every unchanged project.
2. Re-extract symbol facts for `f` alone, and recompute its **export-shape hash**.
3. If — and only if — that hash changed, repeat step 2 for `f`'s **direct importers**, and keep
   propagating outward only through files whose own shape hash changed.

On a 3,000-file fixture this settles in **1-3 files and 3-5 ms**, against **535 ms** for a cold
rebuild — a **107-178x** saving. The naive alternative (re-extract the transitive dependent
closure) touches **1,435 files and 261 ms** for the same edit: still correct, but ~50x more work
than necessary.

**The tool that gets closest is TypeScript 7's own `typescript/unstable/sync` API.** It is the
only candidate that supplies both halves — a first-class incremental invalidation protocol _and_
full type-aware resolution — from one process. Nothing else is close. The cost is that the API is
explicitly unstable and moving release-to-release (see [Risks](#risks)).

---

## 1. `tsc --incremental` and `.tsbuildinfo`

### What is actually cached

Built the same 2-file `composite` project with both compilers and parsed the output. TS 7.0.2
writes JSON with these top-level keys:

```
version, root, fileNames, fileInfos, fileIdsList, options, referencedMap, latestChangedDtsFile
```

| Key                    | Contents                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `version`              | Compiler version string, e.g. `"7.0.2"`                                                                                                    |
| `fileNames`            | 1-based index → file path                                                                                                                  |
| `fileInfos`            | Parallel array: `version` (hash of file **text**), `signature` (hash of the file's emitted **`.d.ts`** — its _shape_), `impliedNodeFormat` |
| `fileIdsList`          | Deduplicated lists of file ids, referenced by index                                                                                        |
| `referencedMap`        | `[fileId, fileIdsListIndex]` pairs — **the import graph**                                                                                  |
| `options`              | Only the compiler options that affect emit                                                                                                 |
| `latestChangedDtsFile` | Last `.d.ts` written                                                                                                                       |

The two fields that matter are exactly the two the algorithm above needs: `referencedMap` is the
dependency graph, and `signature` is the shape hash. **TypeScript's own incremental builder uses
precisely the strategy this document recommends** — which is the strongest available evidence
that the strategy is sound.

### What invalidates it

- **Any compiler version change discards the entire file.** Feeding the TS 7.0.2 buildinfo to
  TS 6.0.3 produced: `Project 'tsconfig.json' is out of date because output for it was generated
with version '7.0.2' that differs with current version '6.0.3'`.
- A change to any emit-relevant option in `options`.
- Per file, a changed text hash (`version`) marks it dirty; a changed `signature` propagates to
  its referrers.

### Is the format documented or stable? Can a third party read it?

**Not documented, not stable, but mechanically readable.**

The [official `tsBuildInfoFile` docs](https://www.typescriptlang.org/tsconfig/tsBuildInfoFile.html)
describe only the file's _location_ and purpose. They say nothing about its contents, structure,
or stability. There is no published schema.

The format demonstrably changed between the two versions installed here:

|                                    | TS 6.0.3               | TS 7.0.2                    |
| ---------------------------------- | ---------------------- | --------------------------- |
| `root` encoding                    | `[64,65]` (flat)       | `[[64,65]]` (range-encoded) |
| Hash length                        | 64 hex chars (SHA-256) | 32 hex chars                |
| `impliedNodeFormat` in `fileInfos` | absent                 | present                     |
| Key order                          | `version` last         | `version` first             |

**Verdict: read it for inspiration, never depend on it.** Beyond instability, it is a poor fit
for codedocs on its own terms: it only exists if you run a `composite`/`incremental` build that
_emits_, which a read-only analysis tool otherwise has no reason to do, and `signature` is a hash
— it tells you _that_ a shape changed, never _what_ it is. Its real value here is as
**corroboration of the design**, and as a fallback source of the import graph for repos that
already build with `composite: true`.

---

## 2. TypeScript project references

### How they partition a monorepo

Each `tsconfig.json` becomes one `Project`, with its own `Program` and its own `Checker`. On a
3-package fixture, opening all three explicitly:

```
open 3 projects: 62ms
  app/tsconfig.json:   903 project files
  core/tsconfig.json:  602 project files
  utils/tsconfig.json: 301 project files
```

Change reporting is **per project**, and correctly names the same changed file in each project
that contains it:

```
per-project change report for 1 edit in packages/utils:
  utils/tsconfig.json: changed=1 deleted=0
  app/tsconfig.json:   changed=1 deleted=0
  core/tsconfig.json:  changed=1 deleted=0
```

### Is that partitioning reusable as an analysis boundary?

**Partly — with two sharp caveats.**

**Caveat 1: a solution-style root tsconfig is not an entry point.** Opening a root config of the
form `{ "files": [], "references": [...] }` yields _one project with zero files_. The API does
**not** expand it into its referenced projects. codedocs must discover and open each leaf
tsconfig itself.

**Caveat 2: `paths`-to-source defeats the partition.** In the fixture above `app` loads all 903
files, because `paths` maps package specifiers to sibling _sources_. The boundary only becomes
real when packages resolve through built `.d.ts` outputs. Since `paths`-to-source is the dominant
convention in pnpm/Turborepo monorepos, **codedocs cannot assume project references give it
cheap partitioning.** It must handle the case where "one package" pulls in the whole workspace.

The consequence: a file can appear in N projects and legitimately have N different sets of symbol
facts (different `strict`, different `lib`). codedocs must pick a rule. `getDefaultProjectForFile`
exists for exactly this and is the natural choice — one canonical project per file, with other
projects' views treated as secondary.

---

## 3. `LanguageService` + `DocumentRegistry` (TypeScript 6)

**Yes, it can be driven headlessly.** A CLI supplies a `LanguageServiceHost` (script file names,
per-file version strings, snapshots) and calls `ts.createLanguageService(host, registry)`. Bumping
a file's version string is the entire invalidation protocol; `DocumentRegistry` reuses unchanged
ASTs across `getProgram()` calls, and is shared between services so a monorepo parses `lib.d.ts`
and shared dependencies once.

Measured on the 3,000-file fixture with TS 6.0.3, in-process:

|                                       | Time   | RSS    |
| ------------------------------------- | ------ | ------ |
| Cold `getProgram()`                   | 627 ms | 350 MB |
| Cold full typed graph (9,000 exports) | 88 ms  | 390 MB |
| `getProgram()` after 1 file changed   | 64 ms  | 395 MB |
| Re-extract just the changed file      | 1 ms   | 396 MB |

**The incremental model works and is genuinely cheap.** Its problems are the constant factors:
**627 ms and 350 MB just to open a 3,000-file project**, versus 132 ms and 63 MB for TS 7. On a
real repo an order of magnitude larger, that is the difference between a CLI that starts in under
a second and one that does not.

The one place TS 6 _wins_ is bulk traversal: 88 ms to walk 9,000 exports in-process, because
there is no serialization. TS 7 pays an IPC round-trip per call — but see
[batching](#batching-is-not-optional) below, which more than reverses the result.

TS 6 remains the only option for anything that must run **in-process** (Volar-style embedding),
which the TS 7.0 announcement acknowledges: _"tools (such as Volar) which embed TypeScript into
their own compilers and language services can only currently rely on TypeScript 6.0."_

---

## 4. Oxc and ast-grep — what is lost without cross-file resolution

Per-file parsing is trivially incremental: hash the file, re-parse on change, done. Oxc is very
fast and [returns ESM import/export information directly](https://oxc.rs/docs/guide/usage/parser.html)
("no need for es-module-lexer"). Paired with `oxc-resolver` it yields a file-level import graph
with no typechecker at all.

But Oxc's own docs are explicit that the parser "does not perform semantic analysis, module
resolution, or type checking" — its role "is strictly syntactic".

**What that costs, measured.** On a barrel file of 300 `export * from "./mN"` statements:

```
barrel utils/src/index.ts:
  syntactic view: 300 'export * from' statements, 0 named symbols visible
  checker view  : 601 concrete exported symbols
  of which declared in a DIFFERENT file: 601 (100%)
```

A purely syntactic tool sees **zero** of the 601 symbols this module actually exports. Barrel
files are ubiquitous in the TS ecosystem — they are the standard package entry point — so this is
not an edge case, it is the common case.

Beyond re-exports, syntax alone cannot: resolve an aliased import to its true declaration;
distinguish two same-named symbols; resolve inferred types (`export const x = compute()`);
follow declaration merging; or compute an export-shape hash, which is the very thing the
incremental algorithm gates on.

**Correct role for Oxc/ast-grep in codedocs:** the cheap outer loop — file discovery, content
hashing, a first-cut import graph, and syntactic queries that genuinely need no types. Not the
symbol graph.

---

## 5. `typescript-go` / tsgo — performance and embeddability

**Status as of 2026-08-30.** The Go port is **finished and shipped**. TypeScript 7.0 was
[announced 2026-07-08](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/);
7.0.2 was published 2026-08-20 and is what is installed in this repo. The
`microsoft/typescript-go` repo is now a closed staging repo — _"This was the staging repo for the
TypeScript 7.0 release during the native port process, which is now completed!"_ — due to be
archived in September 2026. **Its README's "API: not ready" feature matrix is stale; do not cite
it.** Development is back in `microsoft/TypeScript`, which is now a Go repo (`go.work`, `tsc/`).

### Performance

Microsoft's published figures: 8-12x faster full builds; VS Code `125.7s → 10.6s`; Slack
type-checking `~7.5 min → 1.25 min`; memory down 6-26%; editor time-to-first-error
`17.5s → under 1.3s`.

Measured here on the 3,000-file fixture, TS 7.0.2 versus TS 6.0.3:

|                                 | TS 6.0.3 (in-process) | TS 7.0.2 (`unstable/sync`)           |
| ------------------------------- | --------------------- | ------------------------------------ |
| Open project                    | 627 ms                | **132 ms**                           |
| Memory                          | 390 MB (node RSS)     | 167 MB node + 225 MB `tsc` server    |
| Full typed graph, 9,000 exports | 88 ms                 | **31 ms batched** (518 ms unbatched) |
| Incremental update, 1 file      | 64 ms                 | **2-5 ms**                           |

### Embeddability

This splits cleanly in two.

**As a Go library: no, and not planned.** Every package in the `tsc` Go module lives under
`tsc/internal/` — `api`, `checker`, `compiler`, `ls`, `parser`, and the rest. Go's `internal/`
rule makes all of them unimportable from outside the module. The module exposes only `cmd`
binaries. The proof of what this costs in practice is
[`oxc-project/tsgolint`](https://github.com/oxc-project/tsgolint), the type-aware linter behind
`oxlint` (installed in this repo as `oxlint-tsgolint@7.0.2001`): to get at the Go checker it
carries typescript-go as a **git submodule** and builds it in-tree. Forking the compiler is the
only Go path. It is not one codedocs should take.

**As a JS library over IPC: yes — this is the real story, and it is new.** TypeScript 7.0.2 ships
these package exports:

```
"./unstable/sync":  "./dist/api/sync/api.js"
"./unstable/async": "./dist/api/async/api.js"
"./unstable/ast":   "./dist/ast/index.js"
```

`new API({ cwd })` spawns the bundled native binary and speaks msgpack over a socket. The surface
is substantial: `Snapshot`, `Project`, `Program`, `Checker`, `Symbol`, `Type`, `Signature`,
`NodeHandle`, plus `getReferencesToSymbolInFile`, `getReferencedSymbolsForNode` and
`getSignatureUsages` — verified present in the shipped 7.0.2 binary.

Note this **contradicts the 7.0 announcement**, which said _"TypeScript 7 does not ship with an
API."_ That was true at 7.0.0; the `unstable/*` exports landed during the 7.0.x line. Given the
6-week gap between the announcement and 7.0.2, treat anything written about the TS 7 API before
2026-08-20 as out of date.

---

## 6. How Nx, Turborepo, Bazel and Rush decide what changed

| Tool          | Unit of invalidation | What goes into the key                                                                                                                                                                                                   |
| ------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Nx**        | Task                 | "Project source files and files from project dependencies", workspace config, external dependency versions, OS/CPU arch, CLI args. `^production` inputs cascade through the project graph.                               |
| **Turborepo** | **Package**          | Two-tier: a _global_ hash (root config, lockfile, `globalEnv`, `globalDependencies`) and a _package_ hash (source-controlled files in the package dir, configurable via `inputs`). Explicitly per-package, not per-file. |
| **Bazel**     | **Action**           | An _action key_ computed from action metadata — command, compiler flags, library locations, system headers — mapped to outputs in an on-disk action cache. Finest granularity of the four.                               |
| **Rush**      | Project              | Same family: per-project content hashing plus dependency-graph cascade.                                                                                                                                                  |

**What to take, and what not to.** The universal pattern is _content hash + dependency-graph
cascade_, which is exactly the recommended algorithm — good corroboration. But every one of these
tools invalidates at **task, package or action** granularity, because their unit of work is "run
a command and cache its output". A symbol graph needs **file** and **symbol** granularity. Adopt
their _cache-key discipline_ — hash the inputs, including the tool version and the resolved
compiler options, and treat any change as a full invalidation of that scope — and reject their
granularity.

Bazel's action-level model is the closest analogue and the right mental picture: the unit of
invalidation should be "the symbol facts derived from one file in one project", keyed by
`(file content hash, project, compiler options, codedocs version, tsgo version)`.

---

## 7. The recommended algorithm, and the traps in it

```
on change(files):
  changed := api.updateSnapshot({ fileChanges: { changed: files } })   # ~2-5ms
  frontier := files
  while frontier is not empty:
    facts := extract(frontier)                # batched, see below
    next  := {}
    for f in frontier:
      if shapeHash(facts[f]) != storedShapeHash[f]:
        next += reverseImports[f] \ visited
      store facts[f]
    frontier := next
```

Four traps, each found the hard way and each capable of silently producing a stale graph.

### Trap 1: type ids are not stable — hash `typeToString`, not `Type.id`

A shape hash built from `Type.id` **cascades forever**. Type ids are assigned lazily per snapshot,
so _any_ re-checked file gets fresh ids, its hash always differs, and the wave never stops. This
was measured: an id-based hash turned a body-only edit into **10 waves and 1,436 of 3,000 files**;
the same edit with a `typeToString`-based hash settles in **1 wave and 1 file**.

Type ids _are_ stable for files that were not re-checked — which is precisely why this bug hides
in small tests and only appears once the wave reaches a second file.

### Trap 2: `getTypeOfSymbol` alone misses interface changes

Adding a member to an exported interface is invisible to a hash built only from
`typeToString(getTypeOfSymbol(s))`:

```
Added a member to an exported interface (S0_5):
  getTypeOfSymbol-only hash detects change?  false
  +getDeclaredTypeOfSymbol hash detects it?  true

  naive before: C0_5:S0_5|S0_5:any|mk0_5:(n: number) => S0_5
  naive after : C0_5:S0_5|S0_5:any|mk0_5:(n: number) => S0_5
  decl  before: C0_5:S0_5|S0_5<decl>{id:string;n:number}|...
  decl  after : C0_5:S0_5|S0_5<decl>{extra:boolean;id:string;n:number}|...
```

Interfaces report `any` from `getTypeOfSymbol`, and named types print as their own name. The shape
hash must expand type-ish symbols (`Interface | TypeAlias | Class | Enum`) structurally via
`getDeclaredTypeOfSymbol` + `getPropertiesOfType`. **This is a silent-wrong-answer bug**, not a
performance issue.

### Trap 3: `Symbol.getExports()` ≠ `Checker.getExportsOfModule()`

On the 300-statement barrel file, `Symbol.getExports()` returned **1** symbol;
`Checker.getExportsOfModule()` returned **601**. The former is the raw symbol table and does not
resolve `export *`. Always use the checker.

### Trap 4: batching is not optional

The API is IPC. Per-symbol calls cost a round-trip each; the array overloads
(`getSymbolAtLocation(nodes[])`, `getTypeOfSymbol(symbols[])`) do not:

| Full typed graph, 9,000 exports | Time      |
| ------------------------------- | --------- |
| Unbatched (one call per symbol) | 518 ms    |
| Batched (array overloads)       | **31 ms** |

**A 17x difference**, and the difference between TS 7 being slower than TS 6 for bulk traversal
(518 ms vs 88 ms) and being nearly 3x faster (31 ms vs 88 ms). Any adapter must be written
array-first from day one; retrofitting batching means rewriting the traversal.

### Measured results

3,000 files, 10 dependency layers, 9,000 typed exports, 8,100 import edges.
Cold: open 132 ms + graph 403 ms = **535 ms**. Node RSS 167 MB, `tsc` server RSS 225 MB.

| Edit                                                   | `updateSnapshot` | Re-extract | Files touched | Total    | vs cold |
| ------------------------------------------------------ | ---------------- | ---------- | ------------- | -------- | ------- |
| Body-only, leaf (layer 9)                              | 4 ms             | 1 ms       | 1 / 3000      | **5 ms** | 107x    |
| Body-only, base (layer 0, 1,435 transitive dependents) | 2 ms             | 1 ms       | 1 / 3000      | **3 ms** | 178x    |
| New export added, base                                 | 2 ms             | 1 ms       | 3 / 3000      | **3 ms** | 178x    |
| Breaking signature change, base                        | 2 ms             | 1 ms       | 1-3 / 3000    | **3 ms** | 178x    |
| _(naive transitive closure, for contrast)_             | 3 ms             | 257 ms     | 1,435 / 3000  | 261 ms   | 2.6x    |

The signature gate is the whole game. Without it, an edit at the base of the graph costs ~half a
rebuild; with it, essentially nothing.

---

## Risks

1. **The API is explicitly unstable.** The subpath is literally `typescript/unstable/sync`, and
   the announcement promises 7.1 will bring _"a new (and different) API"_. Expect breakage.
2. **The shipped binary lags `main`.** Probing the 7.0.2 server directly: `getReferencedSymbolsForNode`,
   `getReferencesToSymbolInFile`, `getSignatureUsages`, `getSourceFileMetadata` and
   `getCompletionsAtPosition` are **present**; `getDeclarationEmit`, `emitToString`, `emit`,
   `batchRequests`, `getSymbolsOfSourceFiles`, `updateTemporarySnapshot`, `getSymbolsInScope` and
   `formatNodeForInsertion` are **missing**, though all exist in `main`. Pin the TypeScript
   version exactly and probe capabilities at startup.
3. **No module resolution API.** [microsoft/TypeScript#64069](https://github.com/microsoft/TypeScript/issues/64069)
   confirms there is no counterpart to `ts.resolveModuleName`: _"a consumer cannot invoke it on
   its own."_ Import specifiers must be resolved via `checker.getSymbolAtLocation(moduleSpecifier)`
   and the resulting declaration's `NodeHandle.path`. Measured at 260 ms for 8,100 edges over
   3,000 files unbatched — batch it.
4. **The `SnapshotChanges` payload is not exposed in JS.** The server returns per-project
   `changedFiles`/`deletedFiles`, and `SourceFileCache` consumes it internally, but `Snapshot` does
   not re-expose it. Reaching it needs a deep import of `dist/api/sync/client.js` (not in the
   package `exports` map). Confirmed working, but fragile — and mostly unnecessary, since codedocs
   already knows which files it reported as changed.
5. **`changedFiles` is not the affected set.** Per `computeSnapshotChanges` in
   `tsc/internal/api/session.go`, it is the set of files whose `*ast.SourceFile` identity differs
   between snapshots — i.e. what was re-parsed. Semantic dependents are the consumer's problem.
   That is what the signature-gated wave is for.
6. **API roadmap is public and active.** [microsoft/TypeScript#63875](https://github.com/microsoft/TypeScript/issues/63875)
   ("API feature roadmap", milestone _TypeScript 7.1.0 Beta_, owned by Andrew Branch) lists
   `createProgram`, `createSourceFile`, `transpileModule` and `parseCommandLine` as committed for
   7.1. Worth tracking — several would simplify codedocs' adapter.

---

## Recommendation

**Build the symbol graph on `typescript/unstable/sync`, behind a narrow adapter, with a
signature-gated incremental wave.**

1. **Pin TypeScript exactly** and probe the server's method set at startup; fail loudly on a
   version the adapter has not been tested against.
2. **Keep the adapter thin and array-first.** PRD §25 already demands the tool's API not leak;
   here that is also the batching boundary. The adapter should expose "give me facts for these N
   files", never "give me a fact for this symbol".
3. **Persist per file**: content hash, export-shape hash, resolved import edges, and the extracted
   symbol facts. Key the whole cache on
   `(codedocs version, typescript version, resolved compilerOptions, project)` — the Nx/Turborepo
   discipline. Any change to the key invalidates wholesale, as `.tsbuildinfo` does on a version
   change.
4. **Compute the shape hash from `typeToString`**, expanding `Interface | TypeAlias | Class | Enum`
   via `getDeclaredTypeOfSymbol` + `getPropertiesOfType`. Never from `Type.id`.
5. **Enumerate leaf tsconfigs yourself**; do not expect a solution-style root config to expand.
   Use `getDefaultProjectForFile` to pick one canonical project per file.
6. **Use Oxc for the cheap outer loop** — file discovery, content hashing, a first-cut import
   graph — and never for symbol resolution.
7. **Treat `.tsbuildinfo` as corroboration, not a dependency.** Optionally read `referencedMap`
   as a fast-path import graph when a repo already builds with `composite: true`, always behind a
   version check, always with the checker as the fallback.

The honest caveat: this bets on an API whose next minor release is promised to be _"new (and
different)"_. That bet is defensible because the alternative — TypeScript 6's `LanguageService` —
is 4.7x slower to start and uses 2.3x more memory, and because the adapter seam PRD §25 already
requires is exactly the thing that makes the bet reversible. Keep the adapter small enough that
a 7.1 rewrite is a week, not a quarter.

---

## Method

Fixtures, both generated (scripts in the session scratchpad, not committed):

- **`big`** — 3,000 files in 10 layers of 300; each file imports 3 random files from the layer
  below and re-exports a typed interface, a factory function and a const. 8,100 import edges, one
  `tsconfig.json`, `noEmit`. Used for all timing tables.
- **`fixture`** — 3-package monorepo (`utils`/`core`/`app`, 903 files) with `composite: true`,
  project references, `paths`, and 300-statement barrel files. Used for the monorepo and barrel
  results.
- **`bi`** — 2-file `composite` project, built with both compilers to diff `.tsbuildinfo`.

Machine: darwin arm64, Node 24.19.0. Timings are single-run wall clock via `performance.now()`;
memory is `process.memoryUsage().rss` plus `ps -o rss=` for the native server. Cold figures follow
a fresh `API` instance. Treat all of it as order-of-magnitude.

## Sources

Primary, inspected directly:

- `node_modules/typescript@7.0.2` — `package.json` exports, `dist/api/**/*.d.ts`
  (`api.d.ts`, `proto.d.ts`, `sourceFileCache.d.ts`, `options.d.ts`, `client.d.ts`)
- `microsoft/TypeScript` on `main` — `tsc/go.mod`, `tsc/internal/api/proto.go`,
  `tsc/internal/api/session.go` (`computeSnapshotChanges`)
- `.tsbuildinfo` output from TypeScript 6.0.3 and 7.0.2
- Live probing of the shipped 7.0.2 native server

Published:

- [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) (2026-07-08)
- [`tsBuildInfoFile` reference](https://www.typescriptlang.org/tsconfig/tsBuildInfoFile.html)
- [microsoft/typescript-go](https://github.com/microsoft/typescript-go) (staging repo, closed)
- [microsoft/TypeScript#63875 — API feature roadmap](https://github.com/microsoft/TypeScript/issues/63875)
- [microsoft/TypeScript#64069 — No module resolution API](https://github.com/microsoft/TypeScript/issues/64069)
- [oxc-project/tsgolint](https://github.com/oxc-project/tsgolint)
- [Oxc parser guide](https://oxc.rs/docs/guide/usage/parser.html)
- [Nx — How caching works](https://nx.dev/concepts/how-caching-works)
- [Turborepo — Caching](https://turborepo.dev/docs/crafting-your-repository/caching)
- [Bazel glossary](https://bazel.build/reference/glossary)
