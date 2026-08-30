# Capability matrix: which tool produces which required fact?

Research for [issue #2](https://github.com/magicspon/codedocs/issues/2). Resolves the question of
whether PRD §24 ("no custom static-analysis engine") can be honoured, and by which combination of
existing tools.

**Date:** 2026-08-30
**Constraints applied** (from [issue #1](https://github.com/magicspon/codedocs/issues/1)): no LLM on
the deterministic path; the CLI is the product; language scope is TS + TSX with JS best-effort.

---

## 1. Method, and what "verified" means here

Three tiers of evidence are used, and every claim below is tagged with which one it rests on.

| Tier    | Meaning                                                                                          |
| ------- | ------------------------------------------------------------------------------------------------ |
| **RUN** | Verified by executing code against a fixture in this session. Strongest.                         |
| **SRC** | Verified by reading the shipped type definitions, source, or protobuf schema of the tool itself. |
| **DOC** | Verified against the vendor's own documentation or release announcement.                         |

Nothing in this document rests on a blog post, a comparison article, or recollection. Where a claim
could not be verified, it is marked **UNVERIFIED** and the reason is stated. Two claims in the
"required facts" list have no producer at all; they are called out in §6.

Fixtures used for RUN evidence:

- A four-file TS project exercising cross-file dispatch through an interface
  (`Repository.save` implemented by `UserRepository`, called via a variable typed as the interface),
  class inheritance, and a re-imported symbol.
- A pre-existing synthetic monorepo in the session scratchpad: three packages, project references,
  ~1,800 source files. Used only for order-of-magnitude cost, and heavily caveated in §5.

---

## 2. The required facts

Extracted verbatim from PRD §6 and §7, given IDs so the matrix can be read compactly.

**Repository structure (§6)** — R1 applications · R2 packages · R3 libraries · R4 source directories ·
R5 test directories · R6 configuration · R7 generated code · R8 monorepo boundaries

**Symbols (§6)** — S1 functions · S2 classes · S3 interfaces · S4 types · S5 variables · S6 constants ·
S7 enums · S8 methods · S9 components · S10 hooks

**Relationships (§6)** — L1 imports · L2 exports · L3 calls · L4 inheritance · L5 implementations ·
L6 type references · L7 symbol references · L8 dependencies · L9 package relationships

**Project information (§6)** — P1 package.json · P2 workspace configuration · P3 TypeScript
configuration · P4 build configuration · P5 test configuration · P6 lint configuration

**Graph queries (§7)** — Q1 who calls X · Q2 what does X call · Q3 what depends on X · Q4 what imports X ·
Q5 what implementations exist for interface X · Q6 what is reachable from X · Q7 what relationships
changed after this Git diff

Note that S9/S10 (components, hooks) are deferred to a later labelling layer by settled constraint 7,
and Q6/Q7 are graph-traversal and diff questions rather than parse-time facts. They are still scored,
because the ticket asks for gaps to be named explicitly.

---

## 3. The candidates

### A. TypeScript 6.0 language service — `typescript@6` / `@typescript/typescript6`

The last JavaScript-implemented TypeScript compiler, and the only candidate that ships the
**LSP-level aggregates** as callable functions.

- **SRC** `package/lib/typescript.d.ts` at `typescript@6.0.3` declares, on `LanguageService`:
  `findReferences`, `getReferencesAtPosition`, `getFileReferences`,
  `getImplementationAtPosition`, `getDefinitionAtPosition`, `prepareCallHierarchy`,
  `provideCallHierarchyIncomingCalls`, `provideCallHierarchyOutgoingCalls`, `getNavigationTree`,
  `getNavigateToItems`. Also `ts.createIncrementalProgram` and `ts.createLanguageService(host,
documentRegistry, ...)`.
- **SRC** `versionMajorMinor = "6.0"` in the same file.
- **DOC** TypeScript 7.0 ships `@typescript/typescript6`, "a new compatibility package … provides an
  executable named `tsc6`", precisely so tools needing the programmatic API can keep working
  ([Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)).
- Cross-file: **yes, type-resolved**. Requires a full `Program`, i.e. full type information.
- Incremental: yes — `DocumentRegistry` + `LanguageServiceHost` script versions is the mechanism
  every editor uses; `createIncrementalProgram` / `.tsbuildinfo` for the batch path.
- Consumable as: **library, in-process**. Node-native (JavaScript).
- Licence: Apache-2.0.
- Risk: it is the sunset branch. Its performance is the pre-native performance that TS 7 improved on
  by 7.7×–11.9× (**DOC**, same announcement).

### B. TypeScript 7.0 API — `typescript/unstable/sync` (the tsgo API)

This is where "TypeScript compiler API" and "typescript-go / tsgo" have **converged**. They are no
longer two candidates. `github/microsoft/typescript-go` is archived — "This repo will be permanently
archived in September 2026" (**DOC**) — and the native port ships as `typescript@7`.

- **SRC** `typescript@7.0.2`'s `package.json` exports only `./lib/version.cjs` from the root, plus
  `./unstable/sync`, `./unstable/async`, `./unstable/ast`, `./unstable/fs`, `./unstable/proto`. The
  JS side is a **client**: `ClientSpawnOptions.tsserverPath` — "Path to the tsgo executable. Defaults
  to the bundled tsgo binary" — or a Unix socket / named pipe, including attaching to a running LSP
  server's API session via `API.fromLSPConnection`.
- **RUN** Cross-file, type-resolved call attribution works. Given
  `const user: Repository = makeService(); user.save("42")` in one file and `class UserRepository
implements Repository { save() {} }` in another, `Checker.getSignatureUsage(<UserRepository.save
declaration>)` returned **both** call sites, in both files, each flagged `isCall: true`. Querying
  the interface's `Repository.save` signature returned the same two. This is exactly the
  `user.save()` → `UserRepository.save` resolution the ticket names as the discriminator between
  syntactic and type-aware tools.
- **RUN** `Checker.getBaseTypes` returns `["UserRepository"]` for `class AdminRepository extends
UserRepository`, and returns **`[]`** for `class UserRepository implements Repository`. Inheritance
  (`extends`) is available from the checker; **`implements` is not** — it must be read from the AST
  heritage clauses or recomputed from type assignability.
- **RUN** Symbol identity across an import boundary is **not** unified for free: the declaration
  symbol had `id: 1`, the import specifier and its use site both had `id: 3`, and
  `Checker.getAliasedSymbol` collapsed both to `1`. An adapter must follow aliases explicitly.
- **RUN** `Checker.getReferencesToSymbolInFile(file, symbol)` found the 2 in-file references in the
  declaring file and **0** in the two files that import and use the symbol.
  `Checker.getReferencedSymbolsForNode(node, position)` returned `[]` for every position tried.
  Treat whole-program "find references" as **not demonstrated** on this API; either the calling
  convention differs from the one inferred from the `.d.ts`, or it is incomplete. This is a
  first-order question for the spike.
- **SRC** There is **no** `getNavigationTree`, no `documentSymbol`, no call-hierarchy, and no
  `getImplementationAtPosition` equivalent anywhere in `dist/api/sync/api.d.ts` (grep count: 0).
  Symbol enumeration means walking the AST yourself.
- **RUN** The full AST _is_ available client-side: `Program.getSourceFile(path)` returns a lazily
  decoded `SourceFile` with `.statements`, `.imports`, `.referencedFiles`, `getLineStarts()`.
  Decoding 200 files took 6 ms.
- **RUN** Incremental and multi-project are first-class.
  `updateSnapshot({ openProjects: [...] })` opened 3 projects from one API instance;
  `updateSnapshot({ fileChanges: { changed: [...] } })` returned in ~1 ms. **SRC** `FileChanges` is
  `{ changed?, created?, deleted? } | { invalidateAll: true }`, reported back per-project as
  `changedProjects` / `removedProjects`.
- **RUN** `api.parseConfigFile(tsconfigPath)` returns `{ options, fileNames }` — P3 solved directly.
- **The stability caveat, and it is severe.** **DOC**, verbatim from the 7.0 announcement: _"While
  TypeScript 7.0 is here, it does not ship with an API."_ and _"We expect TypeScript 7.1 to ship with
  a new (and different) API, but until then we have made it a priority to ensure TypeScript can be
  run side-by-side with TypeScript 6.0."_ The API demonstrated above is real and works, but Microsoft
  explicitly does not consider it shipped, and states the eventual one will be _different_.
- Consumable as: library (Node) driving an out-of-process Go binary over a pipe. Rust/Go-native cost
  profile, Node-native ergonomics.
- Licence: Apache-2.0.

### C. tsgo LSP — `textDocument/*`

The same binary, reached over LSP rather than the API pipe.

- **SRC** The shipped `tsc` binary (23 MB, Go) contains the method strings
  `textDocument/prepareCallHierarchy`, `callHierarchy/outgoingCalls`, `textDocument/references`,
  `textDocument/implementation`, `textDocument/documentSymbol`, `textDocument/definition`,
  `textDocument/prepareTypeHierarchy`, `textDocument/moniker`.
- **UNVERIFIED**: string presence proves the protocol vocabulary is compiled in, not that each
  request is _handled_. The Go LSP types are generated from the LSP metamodel, so unimplemented
  methods still appear. The archived typescript-go README rated the language service "in progress —
  nearly all features implemented" (**DOC**). An initialize handshake against the running server
  would settle it; that is a 30-minute spike task and it was not done here.
- If the handlers are real, this route restores exactly the aggregates the 7.0 API omits
  (call hierarchy, implementations, document symbols) at native speed. That makes it the single
  highest-value unknown in this document.

### D. ts-morph 28

- **SRC** `@ts-morph/common@0.29.0` vendors its own compiler: `package/dist/typescript.js` contains
  `versionMajorMinor = "6.0"`, and the repo's `packages/common/package.json` pins
  `"typescript": "6.0.2"` as a devDependency. ts-morph is therefore **TypeScript 6, not 7**.
- It is a wrapper, so it inherits candidate A's capabilities with a much better API surface
  (`findReferences`, `getImplementations`, `getDerivedClasses`, navigation helpers), at the cost of a
  second, heavier object model and a full second copy of the compiler in `node_modules`.
- Licence: MIT.
- Verdict: an ergonomics layer over A, not an independent producer. It cannot reach TS 7 performance
  and it ties codedocs to a third party's compiler-upgrade cadence.

### E. oxc-parser (Oxc)

- **DOC** `parseSync(filename, sourceText, options)` / `parse(...)` return
  `{ errors, program, comments, module }`, where `module` carries `hasModuleSyntax`, `staticImports`,
  `staticExports`, `dynamicImports`, `importMetas`
  ([napi/parser README](https://github.com/oxc-project/oxc/blob/main/napi/parser/README.md)).
  Also ships a `Visitor` class and `visitorKeys`.
- No type checker, no cross-file resolution. Purely per-file and syntactic.
- Notable corroborating evidence for the layered architecture: **SRC** this repo already depends on
  `oxlint-tsgolint`, described in its own `package.json` as a _"High-performance type-aware
  TypeScript linter powered by typescript-go, for use with oxlint"_. The Oxc project did not write a
  type checker to get type-aware analysis — **it embedded typescript-go.** That is the strongest
  available external endorsement of "fast syntactic layer + tsgo for types".
- `oxc-resolver` (already a dependency of this repo) resolves module specifiers to files — the piece
  that turns `staticImports` into edges without a type checker.
- Node-native via napi (Rust under the hood). Node `^20.19 || >=22.12`. MIT.

### F. ast-grep

- **DOC**, verbatim from the official FAQ: ast-grep _"at the moment does not support the following
  information: scope analysis, type information, control flow analysis, data flow analysis, taint
  analysis, constant propagation"_ ([ast-grep FAQ](https://ast-grep.github.io/advanced/faq.html)).
- It is a structural **pattern matcher**, consumable as a library via `@ast-grep/napi` (MIT). It is
  excellent for §15 existing-pattern discovery and for rule-driven labelling, and it is the wrong
  tool for building the symbol graph.

### G. tree-sitter (+ tags queries)

- **DOC** The tags system is _"the act of identifying the entities that can be named in a program"_,
  producing `@definition.function` / `@reference.call` style captures. The documentation describes
  **single-file** tagging only; it does not offer inter-file linking or type information
  ([tree-sitter code navigation docs](https://tree-sitter.github.io/tree-sitter/4-code-navigation.html)).
- Its genuine differentiator is error-tolerant incremental _parsing_, which matters for editor-speed
  reparse of a dirty buffer — not something the CLI product needs in v1.
- MIT. Native bindings (`tree-sitter@0.25`) or WASM (`web-tree-sitter@0.26`).

### H. scip-typescript

- **SRC** `npm view` shows `@sourcegraph/scip-typescript@0.4.0`, Apache-2.0, depending on
  `typescript: ^5.6.2` — it is on the _pre-6_ JS compiler API.
- **SRC** Its `FileIndexer.ts` imports `* as ts from 'typescript'` and is constructed with a
  `ts.TypeChecker`. It emits `enclosing_range` for `FunctionDeclaration`, `EnumDeclaration`,
  `TypeAliasDeclaration`, `ClassDeclaration`, `MethodDeclaration`, `InterfaceDeclaration`,
  `ConstructorDeclaration`, and for function-valued variable declarations. It emits
  `scip.Relationship({ symbol, is_implementation: true, is_reference })` by walking ancestors of
  class declarations and matching same-named members of ancestor types.
- **SRC** The SCIP schema itself (`sourcegraph/scip/scip.proto`): `Occurrence` carries
  `symbol`, `symbol_roles`, `syntax_kind`, and single/multi-line enclosing ranges; `SymbolRole` is
  `Definition | Import | WriteAccess | ReadAccess | Generated | Test | ForwardDefinition`;
  `SymbolInformation` carries `relationships`, `kind`, `display_name`, `enclosing_symbol`;
  `Relationship` carries `is_reference | is_implementation | is_type_definition | is_definition`.
- **There is no call edge in SCIP.** Calls must be _derived_: an occurrence with a call-ish role,
  located inside the `enclosing_range` of some definition, yields caller → callee. That derivation is
  routine but it is derivation, not consumption.
- **DOC** SCIP's own design document states it _"is meant as a transmission format … not meant as a
  storage format for querying"_, while listing "adding file-level incrementality should be easy" as a
  design goal for indexers. scip-typescript itself indexes a whole project per invocation; per-file
  incrementality is a property of the format, not of this indexer.
- Consumable as: **CLI only**, emitting a protobuf file. Node-native.
- Strategic value: SCIP symbol IDs are **stable, structured, cross-repo identifiers**. If codedocs
  adopts SCIP-shaped symbol IDs for its internal model, it gets a durable identity scheme and an
  interchange format for free, whether or not it ever runs scip-typescript.

### I. Graphify

- **SRC** Its own skill file: _"structural extraction (deterministic, free) and semantic extraction
  (LLM, costs tokens)"_. The deterministic half is `graphify/extract.py`, docstring: _"Deterministic
  structural extraction from source code using tree-sitter."_ TS/TSX are handled by `extract_js` over
  `tree_sitter_typescript` (`language_typescript` for `.ts`, `language_tsx` for `.tsx`), with a
  heuristic post-pass `_resolve_typescript_member_calls` registered as a `LanguageResolver` and
  described in `symbol_resolution.py` as _"conservative cross-file resolution helpers"_.
- **SRC** The `calls` edges the extraction spec cares most about are explicitly the LLM's job:
  _"Code files: focus on semantic edges AST cannot find (call relationships, shared data, arch
  patterns)."_ Every edge carries `confidence: EXTRACTED | INFERRED | AMBIGUOUS`.
- **SRC** This repo's own `graphify-out/graph.json`: 222 nodes, 238 edges, relations
  `contains` 130, `references` 46, `rationale_for` 29, `conceptually_related_to` 14,
  `semantically_similar_to` 7, `shares_data_with` 5, `implements` 4, `imports` 3 — and confidence
  `EXTRACTED` 202, `INFERRED` 33, `AMBIGUOUS` 3. This is a **concept graph over a corpus**, not a
  symbol graph over a program.
- It is a Python tool requiring a separate runtime, and its highest-value edges require an LLM.
- **Verdict against settled constraint 2: Graphify cannot sit on codedocs' deterministic path.** Its
  type-blind, name-heuristic TS resolution is also strictly weaker than any checker-backed candidate.
  It remains a perfectly good _sibling_ tool for documents and rationale — the role it already plays
  in this repo — and `graphify/scip_ingest.py` shows the two could interoperate later.

### J. Auxiliary producers (non-negotiable, uncontroversial)

| Need               | Producer                                                                           | Evidence                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| R2, R8, P1, P2, L9 | `@manypkg/get-packages@3.1.0` (MIT) or `find-workspaces@0.3.1` (MIT)               | **SRC** npm metadata; "get the packages from a monorepo, whether they're using Yarn, npm, Lerna, pnpm, Bun or Rush" |
| P3                 | TS 7 `api.parseConfigFile`                                                         | **RUN** returned `{ options, fileNames }`                                                                           |
| L1 file-level, L8  | `oxc-resolver` (already a repo dependency) over oxc-parser's `staticImports`       | **DOC** oxc README                                                                                                  |
| L1/L8 cross-check  | `dependency-cruiser@18` (MIT), `madge@8` (MIT), `skott@0.35` (MIT), `knip@6` (ISC) | **SRC** npm metadata                                                                                                |
| Q7                 | `git` itself                                                                       | trivially available                                                                                                 |
| R7 (partial)       | `linguist-js@3.0.3` (ISC)                                                          | **SRC** npm metadata; see §6 for the caveat                                                                         |
| S9/S10 (partial)   | `react-docgen@8` (MIT), `react-docgen-typescript@2.4` (MIT)                        | **SRC** npm metadata; deferred by constraint 7                                                                      |

### Ruled out during the search

- **Stack graphs** (`github/stack-graphs`, `tree-sitter-stack-graphs-typescript`). Conceptually the
  perfect middle layer: incremental, cross-file name binding without a build system, explicitly
  designed so that _"adding file-level incrementality should be easy"_. **SRC** But the GitHub repo
  is **archived** (`archived: true`, last push 2025-09-09) and the TypeScript crate is at 0.4.0, last
  updated 2024-12-13. Dead. Do not depend on it.
- **`ts-morph` as a backend in its own right** — see D; it is a wrapper on candidate A.

---

## 4. The matrix

Fidelity legend:

- **T** — type-resolved. Correct through interfaces, aliases, generics, and dynamic dispatch.
- **S** — syntactic / name-based. Correct for the easy cases; silently wrong on indirection.
- **D** — the primitive exists but the fact must be _derived_ by codedocs (traversal, enclosing-range
  attribution, or an AST walk).
- **—** — not produced.
- **?** — plausible but not verified in this session.

### Symbols and structure

| Fact               | A · TS6 LS                | B · TS7 API                  | C · tsgo LSP       | E · oxc | F · ast-grep | G · tree-sitter | H · scip-ts                  | I · graphify        | J · aux            |
| ------------------ | ------------------------- | ---------------------------- | ------------------ | ------- | ------------ | --------------- | ---------------------------- | ------------------- | ------------------ |
| S1 functions       | **T** `getNavigationTree` | **D** AST walk               | ? `documentSymbol` | **S**   | **S**        | **S**           | **T**                        | **S**               | —                  |
| S2 classes         | **T**                     | **D**                        | ?                  | **S**   | **S**        | **S**           | **T**                        | **S**               | —                  |
| S3 interfaces      | **T**                     | **D**                        | ?                  | **S**   | **S**        | **S**           | **T**                        | **S**               | —                  |
| S4 types           | **T**                     | **D**                        | ?                  | **S**   | **S**        | **S**           | **T**                        | **S**               | —                  |
| S5 variables       | **T**                     | **D**                        | ?                  | **S**   | **S**        | **S**           | **T**                        | **S**               | —                  |
| S6 constants       | **T**                     | **D**                        | ?                  | **S**   | **S**        | **S**           | **T**                        | **S**               | —                  |
| S7 enums           | **T**                     | **D**                        | ?                  | **S**   | **S**        | **S**           | **T**                        | **S**               | —                  |
| S8 methods         | **T**                     | **D**                        | ?                  | **S**   | **S**        | **S**           | **T**                        | **S**               | —                  |
| S9 components      | —                         | —                            | —                  | —       | **S** rule   | —               | —                            | —                   | **S** react-docgen |
| S10 hooks          | —                         | —                            | —                  | —       | **S** rule   | —               | —                            | —                   | —                  |
| R1 applications    | —                         | —                            | —                  | —       | —            | —               | —                            | —                   | **D** manifests    |
| R2 packages        | —                         | —                            | —                  | —       | —            | —               | **D** `Packages.ts`          | —                   | **T** manypkg      |
| R3 libraries       | —                         | —                            | —                  | —       | —            | —               | —                            | —                   | **D** convention   |
| R4 source dirs     | **D** `parseConfigFile`   | **D** `parseConfigFile`      | —                  | —       | —            | —               | —                            | —                   | **D**              |
| R5 test dirs       | —                         | —                            | —                  | —       | —            | —               | **D** `SymbolRole.Test`      | —                   | **D** convention   |
| R6 configuration   | —                         | —                            | —                  | —       | —            | —               | —                            | **S** `json_config` | **D** globs        |
| R7 generated code  | —                         | —                            | —                  | —       | —            | —               | **D** `SymbolRole.Generated` | —                   | ? linguist-js      |
| R8 monorepo bounds | **D** project refs        | **D** multi-project snapshot | —                  | —       | —            | —               | —                            | —                   | **T** manypkg      |

### Relationships and graph queries

| Fact                            | A · TS6 LS                          | B · TS7 API                                     | C · tsgo LSP                    | E · oxc                      | F · ast-grep | G · tree-sitter | H · scip-ts                        | I · graphify        | J · aux               |
| ------------------------------- | ----------------------------------- | ----------------------------------------------- | ------------------------------- | ---------------------------- | ------------ | --------------- | ---------------------------------- | ------------------- | --------------------- |
| L1 imports                      | **T**                               | **T** `SourceFile.imports`                      | ?                               | **T** `module.staticImports` | **S**        | **S**           | **T** `SymbolRole.Import`          | **S**               | **T** dep-cruiser     |
| L2 exports                      | **T**                               | **T** `getExportsOfModule`                      | ?                               | **T** `module.staticExports` | **S**        | **S**           | **T**                              | **S**               | **T** knip            |
| **L3 calls**                    | **T** call hierarchy                | **T** `getSignatureUsage` **(RUN)**             | ? `callHierarchy/*`             | —                            | —            | **S** tags      | **D** occurrence ∈ enclosing_range | **LLM**             | —                     |
| L4 inheritance                  | **T**                               | **T** `getBaseTypes` **(RUN)**                  | ?                               | **S**                        | **S**        | **S**           | **T** `is_implementation`          | **S**               | —                     |
| L5 implementations              | **T** `getImplementationAtPosition` | **D** _not_ in `getBaseTypes` **(RUN)**         | ? `textDocument/implementation` | **S** heritage clause        | **S**        | **S**           | **T**                              | **S**               | —                     |
| L6 type references              | **T**                               | **T** `getTypeFromTypeNode`, `getTypeArguments` | ?                               | **S**                        | —            | —               | **T** `is_type_definition`         | —                   | —                     |
| L7 symbol references            | **T** `findReferences`              | **? not demonstrated (RUN)**                    | ? `textDocument/references`     | —                            | **S**        | **S**           | **T** occurrences                  | **S**               | —                     |
| L8 dependencies                 | —                                   | —                                               | —                               | **D** + resolver             | —            | —               | **D** `Packages.ts`                | **S**               | **T** manifests       |
| L9 package relationships        | **D** project refs                  | **D** multi-project                             | —                               | —                            | —            | —               | **D**                              | —                   | **T** manypkg         |
| P1 package.json                 | —                                   | —                                               | —                               | —                            | —            | —               | —                                  | **S**               | **T** trivial         |
| P2 workspace config             | —                                   | —                                               | —                               | —                            | —            | —               | —                                  | —                   | **T** manypkg         |
| P3 tsconfig                     | **T** `parseJsonConfigFileContent`  | **T** `parseConfigFile` **(RUN)**               | —                               | —                            | —            | —               | —                                  | —                   | —                     |
| P4/P5/P6 build/test/lint config | —                                   | —                                               | —                               | —                            | —            | —               | —                                  | **S**               | **D** known filenames |
| Q1 who calls X                  | **T** incoming calls                | **T** `getSignatureUsage` **(RUN)**             | ?                               | —                            | —            | —               | **D**                              | **LLM**             | —                     |
| Q2 what does X call             | **T** outgoing calls                | **D** walk body + resolve each                  | ?                               | —                            | —            | —               | **D**                              | **LLM**             | —                     |
| Q3 what depends on X            | **D** over L1/L7                    | **D** over L1/L7                                | **D**                           | **D**                        | —            | —               | **D**                              | **S**               | **T** dep-cruiser     |
| Q4 what imports X               | **T** `getFileReferences`           | **D** over `SourceFile.imports`                 | ?                               | **T**                        | —            | —               | **T**                              | **S**               | **T**                 |
| Q5 implementations of X         | **T**                               | **D**                                           | ?                               | —                            | —            | —               | **T**                              | **S**               | —                     |
| Q6 reachable from X             | —                                   | —                                               | —                               | —                            | —            | —               | —                                  | **D**               | —                     |
| Q7 changed after diff           | —                                   | **D** `fileChanges` re-check                    | —                               | —                            | —            | —               | —                                  | **D** `affected.py` | **T** git             |

---

## 5. Cost

| Candidate           | Runtime                               | In-process?  | Incremental                                    | Measured          |
| ------------------- | ------------------------------------- | ------------ | ---------------------------------------------- | ----------------- |
| A · TS 6 LS         | Node (JS compiler)                    | yes          | `DocumentRegistry` / `.tsbuildinfo`            | not measured here |
| B · TS 7 API        | Node client → **Go** binary over pipe | no (IPC)     | `updateSnapshot({fileChanges})`, **RUN** ~1 ms | see caveat        |
| C · tsgo LSP        | same Go binary                        | no (LSP)     | LSP `didChange`                                | not measured      |
| D · ts-morph        | Node (bundles TS 6.0)                 | yes          | inherits A                                     | not measured      |
| E · oxc-parser      | Rust via napi                         | yes          | per-file, trivially                            | not measured      |
| F · ast-grep        | Rust via napi                         | yes          | per-file                                       | not measured      |
| G · tree-sitter     | C via napi or WASM                    | yes          | true incremental reparse                       | not measured      |
| H · scip-typescript | Node (TS 5.6)                         | **no — CLI** | whole project per run                          | not measured      |
| I · graphify        | **Python** + LLM                      | no           | `--update` re-extracts changed files           | not measured      |

**Caveat on the one number I do have.** On the synthetic ~1,800-file monorepo fixture, candidate B
opened 3 projects in 73 ms and returned a full `getSemanticDiagnostics()` for a 903-file project in
11 ms. **Do not quote these.** The fixture's modules are two statements each with no interesting
types; the number measures the harness, not a real repo. **DOC** the vendor's own figure — 7.7×–11.9×
faster than TS 6 with 6–26% less memory on production codebases — is the honest one to plan against.
Settled constraint 8 (measure every claim against a real repo) applies squarely here, and §26's
performance requirements should be validated in the spike, not from this document.

---

## 6. Facts with no producer

This is the section the ticket says matters most. Four items, in descending order of consequence.

**1. Nothing produces a whole-program call graph. (L3, Q1, Q2)**
This is the single largest engineering item and it deserves to be stated plainly. Every candidate
that can resolve a call correctly does so **one symbol at a time**: TS 6 answers "incoming calls for
_this_ position", TS 7's `getSignatureUsage` answers "usages of _this_ signature", SCIP does not model
calls at all and requires deriving them from occurrence-inside-enclosing-range. To get PRD §7's "Who
calls X?" over a repository, codedocs must **drive** a per-symbol API across every symbol and
assemble the result. That is adapter-and-model work — exactly the shape §24's own preferred diagram
prescribes (`Existing tool → Adapter → CodeGuide internal model`) — but it is real work, it is where
the performance risk lives, and it must not be mistaken for "an existing tool already does this".

**2. Nothing classifies source vs. test vs. generated code. (R4, R5, R7)**
SCIP _has_ `SymbolRole.Test` and `SymbolRole.Generated` in its schema, but that is a slot in a
transmission format, not a producer. `linguist-js` claims Linguist's rules, but I did **not** verify
that it implements Linguist's generated-file heuristics (`linguist-generated` in `.gitattributes`, the
`@generated` marker, known output paths) — **UNVERIFIED**, and it is the likeliest genuine gap.
Mitigation is cheap and does not breach §24: this is classification over paths, `.gitattributes`,
tsconfig `include`/`exclude`, and test-runner config — not parsing and not analysis.

**3. Nothing produces components or hooks as symbol kinds. (S9, S10)**
`react-docgen` extracts prop documentation from components; it is heuristic and oriented at docs
generation, not at graph nodes. There is no deterministic producer of "this symbol is a React hook".
Settled constraint 7 already defers this to a labelling layer over plain symbols, so this gap is
**pre-accepted** — but it should be recorded as a real absence rather than a scoping convenience,
because it means the eventual labelling layer will be codedocs-authored, most plausibly as ast-grep
rules over already-extracted symbols.

**4. Nothing answers reachability. (Q6)**
"What code is reachable from X?" is graph traversal, not extraction. It has no producer because it
needs no producer — it needs the assembled graph. PRD §7 nominates Graphify for this; Graphify's TS
edges are tree-sitter-plus-heuristics with LLM-generated call edges, which fails settled constraint 2
on the deterministic path. Traversal over codedocs' own normalised model (§25) is the answer, and
writing a BFS is not "a custom static-analysis engine".

One more thing that is _not_ a gap but is a trap: **symbol identity is not free**. **RUN** showed the
TS 7 checker gives an import specifier a different symbol id from the declaration it aliases, and
`getReferencesToSymbolInFile` found zero references in files that import the symbol. Alias-following
via `getAliasedSymbol` is mandatory, and a stable cross-file symbol ID scheme (SCIP's is the obvious
prior art) is a §25 design decision that should be made before implementation, not during it.

---

## 7. Verdict

### Can PRD §24 be honoured?

**Yes — with one honest amendment.**

No required fact obliges codedocs to write a TypeScript parser or a type checker. Every symbol fact
and every relationship fact has at least one existing producer, and for the hard ones — cross-file
calls resolved through an interface — a producer was **verified by execution**, not merely by
documentation. The `implements`/`extends` asymmetry, the alias-following requirement, and the missing
navigation helpers are all _inconveniences of the API surface_, not missing capabilities.

The amendment: §24 forbids reproducing capabilities that mature tooling provides. It does **not**
supply the assembly. No tool in this survey emits a whole-repository symbol-and-relationship graph
for TypeScript; every one of them answers point queries or per-file questions. Codedocs' irreducible
job is the driver, the normalised model (§25), and the store — which is precisely the
`Existing tool → Adapter → CodeGuide internal model` pipeline §24 asks for. §24 should be read as
constraining the _analysis_, not the _aggregation_, and the SOLUTION doc should say so in as many
words so that nobody later mistakes the assembler for a violation.

Corroboration worth weighing: **Oxc, a Rust project with every incentive and capability to write its
own checker, embedded typescript-go instead** (`oxlint-tsgolint`, already a dependency of this repo).
If the fastest JS-tooling project in the ecosystem concluded that reusing TypeScript's checker beats
writing one, that is the strongest external validation of §24 available.

### The combination

```
              ┌─ type layer (one of A / B, chosen by spike) ─┐
              │   symbols · calls · inheritance · implements  │
              │   type refs · symbol refs                     │
tsconfig ─────┤                                               ├──> adapter ──> codedocs model ──> store
              │                                               │
              ├─ syntactic sweep: oxc-parser + oxc-resolver ──┤
              │   imports · exports · file-level dep graph     │
              │   (cheap first pass; also the JS best-effort   │
              │    path where types are absent)                │
              │                                               │
              ├─ manifests: @manypkg/get-packages ────────────┤
              │   packages · workspaces · monorepo bounds      │
              │                                               │
              └─ git ─────────────────────────────────────────┘
                  change facts for Q7 / docs affected

  later, over the assembled model, not under it:
    ast-grep  → pattern discovery (§15), component/hook labelling (S9/S10)
    graphify  → document & rationale graph, alongside — never on the deterministic path
```

`scip-typescript` is **not** in the pipeline, but SCIP is: adopt SCIP-shaped symbol identifiers for
the internal model. It is a solved, stable, cross-repo identity scheme, and it keeps the door open to
emitting a SCIP index later as an interchange artifact.

### The two backend candidates to spike

Both are TypeScript's own checker. The choice is which era of it, and the whole decision turns on
tradeoffs that cannot be settled from documentation.

**Candidate 1 — TypeScript 6.0 language service (`typescript@6` / `@typescript/typescript6`).**
Everything codedocs needs already exists as a function call: `findReferences`,
`provideCallHierarchyIncomingCalls` / `OutgoingCalls`, `getImplementationAtPosition`,
`getNavigationTree`. In-process, stable, documented, and the API that `scip-typescript` and every
editor tool already targets. The cost is speed — it is the pre-native compiler — and a sunset
trajectory: it exists today largely as a compatibility bridge.

**Candidate 2 — TypeScript 7.0 `typescript/unstable/sync` (tsgo).**
7.7×–11.9× faster per Microsoft's own benchmarks, with genuinely good incremental and multi-project
primitives (`updateSnapshot({fileChanges})`, `openProjects`) that map cleanly onto PRD §26. Verified
here to resolve `user.save()` to `UserRepository.save` across files through an interface. The costs
are real and must be measured, not assumed: no navigation/call-hierarchy/implementations helpers, so
codedocs writes the AST walkers; find-references was **not demonstrated working**; and Microsoft says
in writing that 7.0 "does not ship with an API" and that 7.1 will bring "a new (and different) API".

**Recommendation.** Spike both behind a single adapter interface — the §25 model makes this natural,
and the interface itself is the deliverable that survives whichever backend wins. Rank the spike's
questions in this order:

1. **Does the tsgo LSP actually handle `callHierarchy/*`, `textDocument/references` and
   `textDocument/implementation`?** (Candidate C.) If yes, it collapses candidate 2's biggest weakness
   and the decision is close to made. This is a half-day task and it should be done first.
2. **What is the real cost of driving a per-symbol call API across a real repository** — codedocs
   itself, then a maintainer-supplied repo — for each backend? This is the §26 question and the one
   the synthetic fixture cannot answer.
3. **Can `getReferencedSymbolsForNode` be made to work on candidate 2**, or must whole-program
   references be assembled from per-file `getReferencesToSymbolInFile` plus alias-following?
4. **How much does the "new and different" 7.1 API threaten the adapter?** If the adapter is thin
   enough that a 7.1 rewrite is a day's work, candidate 2's instability is priced acceptably.

If the spike is inconclusive, ship on candidate 1 and keep candidate 2 behind the same interface:
correctness first, per PRD §26's own instruction to prioritise correctness over premature
optimisation.

---

## 8. Licensing note (§30)

All candidates carry permissive licences: TypeScript **Apache-2.0**; scip-typescript **Apache-2.0**;
oxc-parser, ast-grep, tree-sitter, ts-morph, `@manypkg/get-packages`, `find-workspaces`,
dependency-cruiser, madge, skott, react-docgen all **MIT**; knip and linguist-js **ISC**. Nothing here
constrains codedocs' own licensing. Graphify's licence was **not** checked, because it is not
proposed as a dependency.

---

## 9. Open questions handed back to the map

- **tsgo LSP handler coverage** — the highest-value unknown in this document (§3 C).
- **Whole-program find-references on the TS 7 API** — not demonstrated (§3 B).
- **`linguist-js` generated-code detection** — unverified; the likeliest genuine producer gap (§6.2).
- **Symbol identity scheme** — SCIP-shaped IDs are recommended but this is a §25 decision, not a
  research finding.
- **Real-repo performance** — every number in §5 is synthetic and should be replaced by measurements
  against codedocs itself plus a maintainer-supplied repo, per settled constraint 8.
