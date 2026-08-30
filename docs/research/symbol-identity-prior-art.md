# Prior art: how existing code-intelligence indexes model and persist symbols

Research for [issue #4](https://github.com/magicspon/codedocs/issues/4). Investigated against primary
sources (specifications and source repositories) on 2026-08-30.

---

## Recommendation

**Adapt SCIP, in two separable pieces, and reject the third.**

1. **Adopt the SCIP symbol string grammar as codedocs' `SymbolId`, verbatim.** Do not invent a
   symbol ID format. SCIP's grammar is an open, Apache-2.0, versioned, actively maintained
   specification that already solves fully-qualified cross-package naming for TypeScript, and has
   working bindings in TypeScript. PRD §25's `Symbol` gets a **name**, not just a shape.
2. **Reject SCIP as the storage substrate.** This is not a judgement call — SCIP's own design
   document rules it out: _"SCIP is meant to be a transmission format for sending data from some
   producers to some consumers — it is not meant as a storage format for querying"_, and
   _"Support efficient code navigation by itself"_ is an explicit **non-goal**.[^scip-design] PRD
   §25's normalised internal representation is therefore justified — but as a **store schema**, not
   as a naming scheme. Those are two decisions the PRD currently conflates into one.
3. **Do not make `scip-typescript` the sole producer.** Keep the format, not the tool (details in
   [§ scip-typescript](#the-tool-scip-typescript)). It is whole-project-only with no incremental
   mode, has had no `main`-branch commit since 2025-10-03, OOMs on large repos by its own README,
   ships no library API or type declarations, and cannot distinguish a call from a reference.

And the finding that matters most for PRD §12/§17:

4. **No system in the prior art has a rename- or move-stable symbol identity.** Not one. Every
   surveyed format derives identity from _name + path_ and re-derives it per snapshot. Identity
   continuity across commits must be an explicit, separate, **inferred** layer in codedocs
   (PRD §27's "inferred results"), computed by matching two snapshots. It cannot be baked into the
   ID, because nobody has managed to bake it into an ID.

The one-line defence codedocs owes the world: _we did not invent a symbol ID format; we adopted
SCIP's, normalised two fields that make it unstable within a single repository's history, and built
our own store because SCIP's authors explicitly say it is not one._

---

## 1. SCIP (Sourcegraph → `scip-code`)

Primary sources: [`scip.proto`](https://github.com/scip-code/scip/blob/main/scip.proto),
[`docs/DESIGN.md`](https://github.com/scip-code/scip/blob/main/docs/DESIGN.md),
[`docs/CLI.md`](https://github.com/scip-code/scip/blob/main/docs/CLI.md).

### Governance and health

The canonical repository is now **`scip-code/scip`**, not `sourcegraph/scip` — the protobuf declares
`option go_package = "github.com/scip-code/scip/bindings/go/scip/"` and the code of conduct points at
`scip-code.org`. It is Apache-2.0, 758 stars, last pushed 2026-08-29. The TypeScript bindings
`@scip-code/scip` published 0.9.0 on 2026-06-29. **The protocol is alive and has moved to a
vendor-neutral home.** This materially de-risks depending on it: it is no longer a single vendor's
internal format.

### How is a symbol named?

The grammar, quoted verbatim from `scip.proto`:[^scip-proto]

```
<symbol>               ::= <scheme> ' ' <package> ' ' (<descriptor>)+ | 'local ' <local-id>
<package>              ::= <manager> ' ' <package-name> ' ' <version>
<scheme>               ::= any UTF-8, escape spaces with double space. Must not be empty nor start with 'local'
<manager>              ::= any UTF-8, escape spaces with double space. Use the placeholder '.' to indicate an empty value
<package-name>         ::= same as above
<version>              ::= same as above
<descriptor>           ::= <namespace> | <type> | <term> | <method> | <type-parameter> | <parameter> | <meta> | <macro>
<namespace>            ::= <name> '/'
<type>                 ::= <name> '#'
<term>                 ::= <name> '.'
<meta>                 ::= <name> ':'
<macro>                ::= <name> '!'
<method>               ::= <name> '(' (<method-disambiguator>)? ').'
<type-parameter>       ::= '[' <name> ']'
<parameter>            ::= '(' <name> ')'
<name>                 ::= <identifier>
<method-disambiguator> ::= <simple-identifier>
<identifier>           ::= <simple-identifier> | <escaped-identifier>
<simple-identifier>    ::= (<identifier-character>)+
<identifier-character> ::= '_' | '+' | '-' | '$' | ASCII letter or digit
<escaped-identifier>   ::= '`' (<escaped-character>)+ '`', must contain at least one non-<identifier-character>
<escaped-characters>   ::= any UTF-8, escape backticks with double backtick.
<local-id>             ::= <simple-identifier>
```

with the constraint that _"the list of descriptors for a symbol should together form a fully
qualified name for the symbol… it should serve as a unique identifier across the package"_ and
_"Local symbols MUST only be used for entities which are local to a Document, and cannot be accessed
from outside the Document."_

**In practice for TypeScript**, from `scip-typescript`'s own golden snapshots — this is the real
emitted output, not a paraphrase:[^st-class]

```
scip-typescript npm syntax 1.0.0 src/`class.ts`/Class#method().(methodParam)
scip-typescript npm syntax 1.0.0 src/`class.ts`/Class#`<constructor>`().
scip-typescript npm @example/a 1.0.0 src/`a.ts`/a().
scip-typescript npm typescript 5.6.2 lib/`lib.es5.d.ts`/String#length.
local 2
```

Three things to notice, all load-bearing:

- **The file path is inside the symbol.** `Packages.ts` walks up from the file to the nearest
  `package.json`; every directory and the filename in between becomes a `Namespace` descriptor
  (`src/`, `` `class.ts` ``).[^st-packages] There is no path-independent name.
- **The package version is inside the symbol.** `ScipSymbol.package(name, version)` produces
  `` `scip-typescript npm ${name} ${version} ` ``, falling back to `HEAD` when `version` is absent
  and to `. .` (anonymous package) when there is no parseable `package.json`.[^st-symbol]
- **Locals are ordinals.** `ScipSymbol.local(counter)` produces `` `local ${counter}` `` from a
  monotonic per-document `Counter` that starts at `-1` and pre-increments.[^st-counter] The
  snapshots show `local 2`, `local 5`, `local 8` — the gaps are traversal artefacts.

Cross-package resolution genuinely works: in the pnpm-workspace snapshot, package `b` references
package `a`'s symbol as `@example/a 1.0.0 src/\`a.ts\`/a().` — the consumer emits the producer's
symbol string, and a consumer of both indexes joins them on the string.[^st-workspace]

### What happens under rename, move, extraction, deletion?

| Operation                                           | Effect on the SCIP symbol                                                                                                                          |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Rename** a function/class/method                  | Symbol changes. The name is a descriptor. No rename record anywhere.                                                                               |
| **Move** a file                                     | Every global symbol defined in it changes, because the path is in the ID. Every reference to them, repo-wide, changes too.                         |
| **Move** a symbol between files in the same package | Same as above — symbol changes.                                                                                                                    |
| **Extract** a function out of another               | New symbol; no link to the code it came from.                                                                                                      |
| **Delete**                                          | Symbol simply stops appearing. Absence is the only signal.                                                                                         |
| **Bump `package.json` version**                     | Every symbol in that package changes, **and** every reference to it from every other package changes. A no-op release invalidates the whole index. |
| **Insert a local above another local**              | Every subsequent `local N` in that document shifts.                                                                                                |
| **Reformat / move a definition within a file**      | Symbol is **unchanged** (ranges are separate from identity). This one is genuinely stable.                                                         |

`docs/scip.md` — the generated schema reference — makes **no stability claim of any kind** across
commits. SCIP's model is one index per snapshot; Sourcegraph uploads one per commit. Cross-_repo_
identity is a design goal; cross-_commit_ identity is not addressed.

### How is it stored? Is it incremental?

A single Protobuf `Index` message: `metadata`, `repeated Document documents`, `repeated
SymbolInformation external_symbols`. `Document` holds `relative_path`, `repeated Occurrence
occurrences`, `repeated SymbolInformation symbols`.

It is a **file**, not a database. Explicitly:

> SCIP is meant to be a _transmission_ format for sending data from some producers to some consumers
> — it is not meant as a _storage_ format for querying.[^scip-design]

Non-goals, quoted:[^scip-design]

- _"Support use cases involving code modifications."_
- _"Ease of writing consumers."_ (_"we expect the number of SCIP producers to be much higher than the
  number of consumers, so it makes sense to optimize for producers"_)
- _"Support efficient code navigation by itself… code navigation fundamentally requires some form of
  bidirectional lookup which is best served by a query engine."_

Goals, also quoted: _"Adding file-level incrementality should be easy"_ and _"Making the indexer
parallel should be easy."_ The mechanism is protobuf's TLV encoding — _"TLV format enables streaming
reads and writes as well as merging by concatenation."_ So **the format is incrementality-friendly;
whether you get incrementality depends entirely on the indexer.**

The `scip` CLI ships `lint`, `print`, `snapshot`, `test`, `stats` and `expt-convert` — the last being
_"[EXPERIMENTAL] Convert a SCIP index to a SQLite database"_, with tables `documents`, `chunks`,
`global_symbols`, `mentions`, `defn_enclosing_ranges` and occurrences _"stored opaquely as a blob to
prevent the DB size from growing very quickly."_[^scip-cli] Worth reading as prior art for codedocs'
own store schema; too experimental to depend on.

### The tool: `scip-typescript`

Apache-2.0, `sourcegraph/scip-typescript`, 111 stars. Reality check as of 2026-08-30:

- **Last `main` commit: 2025-10-03.** Latest npm release `@sourcegraph/scip-typescript@0.4.0`,
  2025-10-02. Eleven months quiet, 29 releases lifetime.
- **No incremental mode.** The full CLI option set is `--cwd`, `--pnpm-workspaces`,
  `--yarn-workspaces`, `--yarn-berry-workspaces`, `--infer-tsconfig`, `--output`, `--progress-bar`,
  `--no-global-caches`, `--max-file-byte-size`, plus positional project paths.[^st-cli] There is no
  changed-files flag. Granularity is one whole tsconfig project.
- **Known OOM on large codebases** — the README has a dedicated "Dealing with out of memory issues"
  section with a Node heap-limit stack trace and workarounds.[^st-readme] Directly in tension with
  PRD §26.
- **No programmatic API.** `main: ./dist/src/main.js` is also the `bin`; no `exports`, no `types`.
  Integration means shelling out — which does at least match settled constraint 3 in the map
  (codedocs already shells out to `graphify` and `fallow`).
- **Bundles its own TypeScript** (`"typescript": "^5.6.2"` as a direct dependency), so it indexes
  with its compiler rather than the project's.
- **No call/reference distinction.** SCIP's `SymbolRole` bitset is `Definition | Import |
WriteAccess | ReadAccess | Generated | Test | ForwardDefinition`.[^scip-proto] There is no `Call`.
  `SyntaxKind.IdentifierFunction` is documented as _"Function references, including calls"_ —
  conflated by design.

### Deriving callers/callees from SCIP

This is possible but is the consumer's work. `Occurrence.enclosing_range` is documented for exactly
this: _"Call hierarchies: to determine what symbols are referenced from the body of a
function."_[^scip-proto] A consumer intersects each reference occurrence with the innermost
definition occurrence whose `enclosing_range` contains it.

`scip-typescript` emits `enclosing_range` **only for definitions**, and only when the symbol is
non-empty and non-local, and the declaration is a function/enum/type-alias/class/method/interface/
constructor declaration or a variable declaration with a function-like initialiser.[^st-fileindexer]
Consequences:

- Module-level calls fall into the file symbol's enclosing range (the whole `SourceFile`).
- Calls inside a `const foo = () => {}` bound to a **local** symbol get no own enclosing range, so
  they are attributed to the nearest enclosing _global_ definition. Usually what you want; not
  always.
- A "call" derived this way is really "a reference lexically inside this definition." Passing
  `handler` as a callback is indistinguishable from invoking `handler()`.

**PRD §8 requires `callers`/`callees` as first-class commands.** SCIP alone gives you "references
within", not calls. Recovering the distinction requires the TypeScript AST.

### Could codedocs consume SCIP as its substrate? What would it lose?

**As a wire format for symbol identity: yes, and it should.** Parse `index.scip` with
`@scip-code/scip` + `@bufbuild/protobuf` in a few lines.[^scip-tsbindings]

**As the substrate for the product: no.** What it loses:

| Lost                                      | Why                                                                                                                                    |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Call graph fidelity                       | No `Call` role; `IdentifierFunction` explicitly conflates calls and references.                                                        |
| Incrementality                            | Whole-project indexing per run; PRD §26 wants changed-file analysis.                                                                   |
| Query performance                         | _"Support efficient code navigation by itself"_ is a stated non-goal. A store is still required.                                       |
| Repository structure (PRD §6)             | No concept of app vs library vs test vs generated vs config. `Package` is `manager/name/version` only.                                 |
| Documents and Changes (PRD §25)           | Entirely out of scope for SCIP; `is_definition`/`is_reference`/`is_implementation` relationships are all it models beyond occurrences. |
| Version stability                         | A `package.json` version bump churns every symbol in and every reference to that package.                                              |
| React components/hooks (map constraint 7) | No labelling layer; deferred anyway, but SCIP will never supply it.                                                                    |

---

## 2. LSIF (Microsoft) — SCIP's predecessor

Primary source: [LSIF specification
0.6.0](https://microsoft.github.io/language-server-protocol/specifications/lsif/0.6.0/specification/).

**Naming.** Two layers. Internally, integer vertex/edge IDs, meaningful only within one dump. For
cross-file/cross-repo identity, **monikers**: _"a handle in string format that is bound to the
corresponding range declaration"_, with `scheme` (e.g. `tsc`, `npm`), `identifier`, `kind`
(export/import/local) and `unique` — one of `document`, `project`, `workspace`, `scheme`, `global`.
Note the difference from SCIP: LSIF's moniker `identifier` is **opaque and scheme-defined**; there is
no standard grammar. SCIP's is a specified grammar. That is the single biggest improvement.

**Under refactoring.** Same as SCIP or worse — `tsc`-scheme monikers are path-and-name based; no
stability across commits.

**Storage.** Newline-delimited JSON vertices and edges forming a directed graph — _"It should be easy
for a tool to consume a dump and, for example, import it into a database without holding the dump in
memory."_ Begin/end events for documents and projects allow streaming import.

**Incremental?** No. The spec contains no incrementality provision; each dump is a complete snapshot,
and it notes _"much of the information would be invalidated by a change to the workspace."_

**Why SCIP replaced it.** From SCIP's design doc, first-party: _"Sourcegraph historically supported
LSIF uploads as well as maintained LSIF indexers, but ran into issues of development velocity,
debugging, as well as indexer performance bottlenecks. LSIF support has since been fully deprecated
and removed."_ The named causes were the graph-of-integer-IDs encoding (_"we've had off-by-one bugs
in indexers cause code navigation to fail repo-wide"_) and the wholesale-merge indexer shape that
resisted parallelism and file-level incrementality.[^scip-design]

**Verdict for codedocs: dead end.** Deprecated by its largest consumer, superseded by SCIP, no
standard symbol grammar. Reading it is only useful for understanding why SCIP is shaped as it is.

---

## 3. Stack Graphs (GitHub)

Primary source: [`github/stack-graphs`](https://github.com/github/stack-graphs),
[`stack-graphs/src/storage.rs`](https://github.com/github/stack-graphs/blob/main/stack-graphs/src/storage.rs).

**⚠ Archived 2025-09-09.** The README's first line: _"This repository is no longer supported or
updated by GitHub. If you wish to continue to develop this code yourself, we recommend you fork
it."_ 875 stars, MIT/Apache-2.0 dual, four language definitions —
`tree-sitter-stack-graphs-{java,javascript,python,typescript}`.

**Naming.** There isn't one, and that is the whole point. Stack graphs _"allow you to define the name
resolution rules for an arbitrary programming language in a way that is efficient, incremental, and
does not need to tap into existing build or program analysis tools."_ Based on the
[scope graphs](https://pl.ewi.tudelft.nl/research/projects/scope-graphs/) framework from Eelco
Visser's group at TU Delft. A definition is a _node in a file's partial graph_; resolution is
path-finding across stitched partial paths. There is no serialisable global symbol name to hand to a
downstream tool.

**Under refactoring.** Not applicable — no persistent identity exists to break.

**Storage and incrementality.** This is the part worth stealing. SQLite, schema version 6, with
tables `metadata`, `graphs (file TEXT PRIMARY KEY, tag TEXT NOT NULL, error, value)`, `file_paths`,
`root_paths`. Each file's partial stack graph is serialised as a blob keyed by path, alongside a
**`tag`** — a content fingerprint. `status_for_file(file, tag)` returns the file's status _"If a tag
is provided, it must match"_. The CLI: _"Indexing will skip any files that have already be indexed.
To force a re-index, add the `-f` flag."_ **This is genuinely per-file incremental analysis, with no
compiler and no build.** It is the only surveyed system with real file-level incrementality out of
the box.

**Could codedocs consume it?** No — as a source of symbols. It resolves names but does not name them;
codedocs needs exportable identifiers. And it is archived, which under the map's tool-selection
criteria is close to disqualifying.

**But copy the storage model.** `(file, content-tag) → serialised per-file analysis, skip on tag
match` is exactly the shape PRD §26 asks for ("analyse only changed files when possible"), and it is
independent of the analysis being stack graphs.

---

## 4. Kythe (Google)

Primary sources: [Kythe URI specification](https://kythe.io/docs/kythe-uri-spec.html),
[Kythe storage model](https://kythe.io/docs/kythe-storage.html),
[Writing an indexer](https://kythe.io/docs/schema/writing-an-indexer.html).

Alive (`kythe/kythe`, 2149 stars, last pushed 2026-07-16) and has a TypeScript indexer at
`kythe/typescript` — though its last substantive commit was 2025-03-06 and it is Bazel-only to build
and test.

**Naming.** VNames (five fields: `signature`, `corpus`, `root`, `path`, `language`), serialised as a
Kythe URI:

```
kythe-uri    = "kythe:" [corpus] attrs ["#" signature]
corpus       = "//" label 0*{"/" path-segment}
attrs        = ["?" lang-attr] ["?" path-attr] ["?" root-attr]
lang-attr    = "lang=" language
path-attr    = "path=" path-segment 0*{"/" path-segment}
root-attr    = "root=" root-segment 0*{"/" root-segment}
```

Semantic nodes take the defining file's `path` plus a signature encoding semantic identity. The
indexer guide's own example gives a variable `foo` the signature `"foo#0"` — _"the zeroth binding of
`foo` at global scope"_ — yielding `vname("foo#0", "hello", "ex", "", "example")` where `hello` is
the path. Guidance is _"Where possible, VNames should be generated without reference to source
locations"_ and _"generated consistently"_ across compilation units.

**Under refactoring.** Same failure modes as SCIP, plus one more: **ordinal disambiguators in the
signature** (`foo#0`) are traversal-order dependent, like SCIP's `local N` but for global symbols
too. The URI spec is silent on cross-revision stability.

**Storage.** A stream of **entries** — `(source, kind, target, fact_label, value)` — where node
entries leave `kind`/`target` empty and edge entries populate both: _"If Kind and Target are set, the
entry denotes a fact about an edge in the graph; otherwise the entry denotes a fact about a node."_
Entries sort lexicographically by `Source, Kind, Target, Fact, Value`. Concrete stores: a single
sequential file (LevelDB/CSV/JSON), or SQL with three normalised tables (`Tickets`, `Nodes`,
`Edges`). Crucially, the docs draw the same line SCIP does: _"This is a 'storage' representation —
intended for persistent storage of Kythe data — in contrast to 'serving' representations."_ You still
build serving tables to query it.

**Incremental?** Per-compilation-unit analysis is the natural granularity, but the storage doc makes
no incrementality claim.

**Could codedocs consume it?** No. Bazel-centric, entry/triple model is far heavier than PRD §25
needs, TypeScript support is a side project, and the ecosystem outside Google is thin. The
`(source, kind, target)` triple is worth noting as the maximally-general alternative to a typed
node/edge schema — and worth rejecting for exactly that reason: it pushes all schema into
convention.

---

## 5. Glean (Meta)

Primary sources: [glean.software](https://glean.software/docs/introduction),
[`facebookincubator/Glean`](https://github.com/facebookincubator/Glean),
[`glean/schema/source/scip.angle`](https://github.com/facebookincubator/Glean/blob/main/glean/schema/source/scip.angle).

Alive and busy (1396 stars, pushed 2026-08-30). _"A system for working with facts about source
code"_ — facts are _"immutable terms described by user-defined schemas, and form a DAG"_, queried
with **Angle**, _"a declarative query language… similarities to Datalog"_ (currently non-recursive
only), stored in **RocksDB** with automatic fact de-duplication. Notably it stores _"only the parts
we need… typically locations of definitions and cross-references"_, not full ASTs.

**The finding that matters is what Glean did about symbol identity.** Its `glean/lang/` directory
contains, alongside native indexers: `scip`, `python-scip`, `rust-scip`, `dotnet-scip`, `lsif`,
`typescript-lsif`. And `glean/schema/source/scip.angle` says, in a comment:

> ```
> # Symbols in SCIP. Globally unique identifiers.
> #
> # Local symbols (e.g., "local 0") are made globally unique by prefixing a
> # document path (e.g., "fbcode/foo/bar/baz.rs/local 0").
> #
> # These are similar in intent to qualified names in Python, or
> # symbol ids in Glass.
> #
> predicate Symbol: string
> ```

**Meta — with the resources to define anything it wants — stores SCIP symbol strings verbatim as a
`string` predicate, and patches exactly one defect: it qualifies `local N` with the document
path.** That is precisely the architecture recommended above (adopt the naming, own the store), and
precisely the local-symbol fix recommended below, arrived at independently by the largest engineering
org to attempt this.

**Under refactoring.** No rename/move tracking. Databases are per-revision and immutable.

**Storage / incrementality.** Immutable stacked RocksDB databases; incrementality by stacking a delta
DB over a base rather than by mutating.

**Could codedocs consume it?** No — Haskell/Hack build, server-oriented, operationally heavy for a
local-first CLI. But it is the single strongest corroboration of the recommendation.

---

## 6. CodeQL (GitHub)

Primary sources: [About CodeQL](https://codeql.github.com/docs/codeql-overview/about-codeql/),
[CodeQL CLI licence](https://github.com/github/codeql-cli-binaries/blob/main/LICENSE.md).

**Ruled out on licensing before the technical merits matter.** The CodeQL CLI terms permit academic
research, demonstrating the software, testing OSI-licensed queries, and analysing an Open Source
Codebase hosted on GitHub.com. They prohibit using the software _"in connection with any codebase
that is not an Open Source Codebase (e.g., code in a private repo in GitHub)"_ and prohibit
generating a database _"for or during automated analysis, CI or CD"_ outside that. The only relief is
_"a paid customer license for GitHub Advanced Security."_

codedocs is a local-first tool aimed at private codebases (PRD §28) with a commercial model (§31).
**Any dependency on the CodeQL CLI would make codedocs unusable by its own target users.** Note the
trap: `github/codeql` (the _queries_) is MIT; the _CLI_ is not. Easy to get wrong.

Technically, for the record: a CodeQL database is _"queryable data extracted from a codebase, for a
single language at a particular point in time"_, containing _"a full, hierarchical representation of
the code, including… the abstract syntax tree, the data flow graph, and the control flow graph"_,
with a per-language relational schema. No stable cross-commit symbol identity; databases are
snapshot-scoped and built by a full extraction run.

---

## Cross-cutting findings

### A. Nobody has solved cross-commit symbol identity

| System       | Rename | Move file | Extract | Mechanism                                    |
| ------------ | ------ | --------- | ------- | -------------------------------------------- |
| SCIP         | breaks | breaks    | breaks  | name + path + package version in ID          |
| LSIF         | breaks | breaks    | breaks  | scheme-defined opaque moniker                |
| Stack Graphs | n/a    | n/a       | n/a     | no persistent global identity at all         |
| Kythe        | breaks | breaks    | breaks  | path + signature (with ordinals) in VName    |
| Glean        | breaks | breaks    | breaks  | stores SCIP/native strings; per-revision DBs |
| CodeQL       | breaks | breaks    | breaks  | snapshot database                            |

This is not an oversight repeated six times. Stable identity under refactoring is **not derivable
from a single snapshot** — it requires comparing two, and the comparison is heuristic (git similarity
detection, descriptor matching, signature matching). Every one of these systems correctly refused to
put a heuristic inside a primary key.

**Implication for codedocs.** PRD §12 (documentation impact analysis) and §17 (change impact
analysis) both want to say "this symbol changed" across a diff. That capability must be built as a
**snapshot-matching layer** that emits _inferred_ results under PRD §27's taxonomy — never as a
property of the `SymbolId`. The `SymbolId` stays deterministic and snapshot-scoped; "is this the same
symbol as before?" is a separate, fallible question with a confidence attached. This is a real
architectural decision the map does not yet record.

### B. Transmission format ≠ storage format

SCIP and Kythe both state this explicitly, in their own words. PRD §25 reads as though defining an
internal representation were an alternative to adopting a standard. It isn't; they are orthogonal
layers, and the two mature systems that solved this (Glean, Sourcegraph) each adopted a wire format
_and_ built a store. PRD §24's "Existing tool → Adapter → internal model" diagram is exactly right —
§25 is the "internal model" box and needs no defence. What needed defending, and what §25 does not
address, is the **naming scheme inside `Symbol`**. That is where SCIP wins outright.

### C. Version-in-the-ID is wrong for a single-repo tool

SCIP puts `<version>` in `<package>` because Sourcegraph indexes many repos at many versions and
needs to distinguish `lodash@4` from `lodash@5`. codedocs indexes **one working tree at one commit**.
Inside that tree, embedding `package.json` versions means a routine `version` bump in a monorepo
package silently invalidates every symbol in it and every cross-package reference to it. Normalise it
away for first-party workspace packages; keep it for third-party dependency symbols, where it carries
real information.

### D. `local N` is unusable as-is; Glean already published the fix

`local 0`, `local 1`, … are (a) document-scoped, so not globally unique, and (b) traversal-ordinal,
so unstable under any edit that inserts an earlier binding. Glean's fix — prefix the document path —
solves (a) but not (b). codedocs should do both: prefix the path, **and** treat local symbols as
non-durable, excluded from anything that must survive an edit (documentation anchors, impact
baselines).

---

## What this means concretely for codedocs

1. **`SymbolId` is a SCIP symbol string**, in codedocs' own scheme (e.g. `codedocs`), with two
   normalisations:
   - workspace-package `<version>` replaced with a fixed placeholder;
   - `local N` rewritten as `<relative-path>/local N`, and flagged non-durable.
     Store it as a string. Parse on demand. Descriptors give you the ancestry chain for free — PRD §25's
     `Package → File → Symbol` containment is _already encoded in the ID_.
2. **PRD §25's internal representation survives**, reframed as the store schema over SCIP-named
   symbols, plus everything SCIP does not model: repository structure (§6), `Document`, `Change`.
3. **Producer decision is separate and still open.** The evidence does not say "use
   `scip-typescript`" — it is stale, non-incremental, memory-hungry, has no library API, and cannot
   distinguish calls from references, which PRD §8 requires. Nor does it say "write a parser" — PRD
   §24 forbids that, and rightly. The live option is codedocs' own extractor over the **TypeScript
   compiler API** (a mature existing tool, not a custom parser — §24-compliant), emitting
   SCIP-format symbol IDs. That keeps §24 satisfied, gets the call/reference distinction, gets
   incrementality, and keeps the door open to ingesting third-party `.scip` indexes later. **This
   deserves its own ticket**, benchmarked against `scip-typescript` on a real repo.
4. **Steal stack-graphs' storage contract** for PRD §26: SQLite, per-file rows keyed by path, a
   content `tag`, skip-on-match, force flag. Independent of the analysis engine.
5. **Cross-commit identity is an inferred layer**, not an ID property. Separate ticket.
6. **CodeQL is licence-blocked.** Record it so nobody re-litigates it.

---

## Open questions for follow-up

- Benchmark: `scip-typescript` on a real target repo — wall time, peak RSS, index size, and how
  much of PRD §6/§8 is recoverable from the output. Settles item 3 with numbers rather than argument.
- Does codedocs need `<scheme>` = `codedocs` or `scip-typescript`? Using `scip-typescript`'s scheme
  makes indexes directly comparable for validation; using its own is more honest. Probably: own
  scheme, with a documented equivalence mapping.
- Snapshot-matching algorithm for cross-commit identity — git rename detection plus descriptor-suffix
  matching is the obvious first cut, but wants a spike.
- Third-party dependency symbols: index `node_modules` `.d.ts` at all, or resolve lazily?

---

## Sources

All accessed 2026-08-30. Primary sources only — specifications and source repositories.

[^scip-proto]: [`scip-code/scip` — `scip.proto`](https://github.com/scip-code/scip/blob/main/scip.proto) (Apache-2.0). Symbol grammar, `Occurrence`, `SymbolRole`, `SyntaxKind`, `enclosing_range`.

[^scip-design]: [`scip-code/scip` — `docs/DESIGN.md`](https://github.com/scip-code/scip/blob/main/docs/DESIGN.md). Goals, non-goals, LSIF post-mortem.

[^scip-cli]: [`scip-code/scip` — `docs/CLI.md`](https://github.com/scip-code/scip/blob/main/docs/CLI.md) and [`cmd/scip/convert.go`](https://github.com/scip-code/scip/blob/main/cmd/scip/convert.go). SQLite schema.

[^scip-tsbindings]: [`scip-code/scip` — `bindings/typescript/README.md`](https://github.com/scip-code/scip/blob/main/bindings/typescript/README.md); [`@scip-code/scip`](https://www.npmjs.com/package/@scip-code/scip) 0.9.0, 2026-06-29.

[^st-symbol]: [`scip-typescript` — `src/ScipSymbol.ts`](https://github.com/sourcegraph/scip-typescript/blob/main/src/ScipSymbol.ts).

[^st-packages]: [`scip-typescript` — `src/Packages.ts`](https://github.com/sourcegraph/scip-typescript/blob/main/src/Packages.ts).

[^st-counter]: [`scip-typescript` — `src/Counter.ts`](https://github.com/sourcegraph/scip-typescript/blob/main/src/Counter.ts).

[^st-class]: [`scip-typescript` — `snapshots/output/syntax/src/class.ts`](https://github.com/sourcegraph/scip-typescript/blob/main/snapshots/output/syntax/src/class.ts) and `.../local.ts`.

[^st-workspace]: [`scip-typescript` — `snapshots/output/pnpm-workspaces/packages/b/src/b.ts`](https://github.com/sourcegraph/scip-typescript/blob/main/snapshots/output/pnpm-workspaces/packages/b/src/b.ts).

[^st-cli]: [`scip-typescript` — `src/CommandLineOptions.ts`](https://github.com/sourcegraph/scip-typescript/blob/main/src/CommandLineOptions.ts).

[^st-readme]: [`scip-typescript` — `README.md`](https://github.com/sourcegraph/scip-typescript/blob/main/README.md).

[^st-fileindexer]: [`scip-typescript` — `src/FileIndexer.ts`](https://github.com/sourcegraph/scip-typescript/blob/main/src/FileIndexer.ts), `enclosing_range` emission conditions.

Also: [LSIF 0.6.0 specification](https://microsoft.github.io/language-server-protocol/specifications/lsif/0.6.0/specification/) ·
[`github/stack-graphs`](https://github.com/github/stack-graphs) (archived 2025-09-09) and [`stack-graphs/src/storage.rs`](https://github.com/github/stack-graphs/blob/main/stack-graphs/src/storage.rs) ·
[Kythe URI spec](https://kythe.io/docs/kythe-uri-spec.html), [Kythe storage model](https://kythe.io/docs/kythe-storage.html), [Writing an indexer](https://kythe.io/docs/schema/writing-an-indexer.html) ·
[Glean introduction](https://glean.software/docs/introduction) and [`glean/schema/source/scip.angle`](https://github.com/facebookincubator/Glean/blob/main/glean/schema/source/scip.angle) ·
[About CodeQL](https://codeql.github.com/docs/codeql-overview/about-codeql/) and [CodeQL CLI licence](https://github.com/github/codeql-cli-binaries/blob/main/LICENSE.md).
