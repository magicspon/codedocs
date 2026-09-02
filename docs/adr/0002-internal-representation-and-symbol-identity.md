---
status: accepted
---

# Symbol identity is a normalised SCIP string, scoped to one snapshot

The internal representation is **five node types** (`Package`, `Project`, `File`, `Symbol`,
`Document`), **nine edge kinds**, and a `SymbolId` that is a [SCIP](https://github.com/scip-code/scip)
symbol string in codedocs' own scheme with two normalisations. Identity is **deterministic and
snapshot-scoped**: it says what a symbol is called in this working tree at this commit, and nothing
about the past. Recognising the same symbol across commits is a separate **inferred** layer that
matches two snapshots and never touches the id. **Provenance is carried per edge instance**, with the
rule that produced it, because the same edge kind can be deterministic at one call site and inferred
at the next.

Three of PRD §25's seven boxes do not survive. `Relationship` is the edge set, not a sibling of
`File`. `Change` is git's job. `Repository` is the index header — with containment derived from the
`SymbolId`, it is the source and target of no edges, and a node with no edges is a header wearing a
costume.

## The node types

| Node       | Identity                 | Notes                                                                                                     |
| ---------- | ------------------------ | --------------------------------------------------------------------------------------------------------- |
| `Package`  | workspace-relative path  | A workspace package, from `@manypkg/get-packages`. External packages are nodes too, named but not walked. |
| `Project`  | `tsconfig` path          | **Not** in PRD §25, and not a `Package`: cal.com has 34 `tsconfig`s and no root config.                   |
| `File`     | repository-relative path | A first-class participant in edges, not only a container — see consequences.                              |
| `Symbol`   | `SymbolId`               | One per declaration name in its scope; overloads collapse into one node.                                  |
| `Document` | path                     | What it points at is [#8](https://github.com/magicspon/codedocs/issues/8)'s decision, not this one.       |

## The edge kinds

Closed enum. Adding a variant is a model change, which is the cost we want: it forces the question
"which backend actually produces this?" every time.

| Kind             | Source → Target               | Typical provenance                                                                         |
| ---------------- | ----------------------------- | ------------------------------------------------------------------------------------------ |
| `imports`        | `File` → `File`               | `deterministic`; stored with its cause when resolution fails                               |
| `exports`        | `File` → `Symbol`             | `deterministic`; carries the **exported name**, which may differ from the declaration name |
| `calls`          | `Symbol` \| `File` → `Symbol` | per instance                                                                               |
| `references`     | `Symbol` \| `File` → `Symbol` | per instance                                                                               |
| `extends`        | `Symbol` → `Symbol`           | `deterministic` — `Checker.getBaseTypes`                                                   |
| `implements`     | `Symbol` → `Symbol`           | `syntactic` — `getBaseTypes` returns `[]` for `implements`; read from AST heritage clauses |
| `typeReferences` | `Symbol` → `Symbol`           | `deterministic`                                                                            |
| `dependsOn`      | `Package` → `Package`         | `deterministic` — manifests                                                                |
| `analysedIn`     | `File` → `Project`            | `deterministic`; carries `canonical`, because one file can belong to several projects      |

`calls` and `references` stay separate kinds. SCIP's conflation of them — `IdentifierFunction` is
documented as _"function references, including calls"_ — is the defect that ruled it out as the
producer, and `Checker.getSignatureUsage` hands the distinction over as `{ name, call? }`. Collapsing
them here would discard the reason the backend was chosen.

## Considered Options

- **`(path, offset)` as identity**, which is what the call-site sweep already produces. Rejected: an
  offset is not durable across _any_ edit. Add a newline at the top of a file and every symbol in it
  gets a new id, so a body-only edit — which the incremental design settles in **one wave and one
  file** — would instead churn every symbol in that file. `(normalisedPath, startOffset)` survives as
  a build-time join index, alive for one analysis run, never persisted and never exposed.
- **A bespoke `SymbolId` format.** Rejected: it cannot defend itself against SCIP, which is an open,
  versioned, vendor-neutral grammar that already solves fully-qualified cross-package naming for
  TypeScript. Meta, with the resources to define anything it wants, stores SCIP symbol strings
  verbatim.
- **SCIP as the storage substrate.** Rejected on the authors' own terms: _"it is not meant as a
  storage format for querying"_, and efficient navigation is an explicit non-goal. The naming scheme
  and the store are two decisions PRD §25 conflates into one.
- **`local N` ordinals, or Glean's path-prefixed variant.** Rejected: prefixing the document path
  fixes uniqueness but not stability — the ordinal still shifts when a binding is inserted above it.
  Locals are named by their descriptor path from the nearest global ancestor instead
  (`` `src/page.ts`/renderPage().t. ``), which SCIP's grammar permits and which nothing above it can
  disturb.
- **Excluding local symbols from the index**, as the prior art recommends. Rejected on measurement:
  **25 of the Next.js fixture's 175 call edges** are calls to local bindings (`const t =
useTranslations()` and then `t(...)`), and the per-symbol method structurally cannot find them.
  Fourteen per cent of a repository's call graph is not an edge case. They are indexed and flagged
  `durable: false` instead.
- **Kythe's open `(source, kind, target)` triple.** Rejected: it pushes all schema into convention,
  and PRD §27's deterministic/inferred distinction needs exhaustiveness to be checkable.
- **Provenance as a table of edge types.** Rejected on measurement, and this is the decision most
  likely to be got wrong by anyone who has not read the spike. Given `interface Gateway { capture() }`
  and two implementing classes, `getSignatureUsage` returns **both call sites for all three
  declarations** — `PaypalGateway.capture` is reported as called at a site that constructs a
  `StripeGateway`. A plain function-call edge is `deterministic`; the same edge kind through a shared
  method name is `inferred`. An edge cannot inherit its provenance from its kind.
- **Overload disambiguators.** A declaration ordinal reintroduces the defect just rejected for
  locals. A signature hash makes an ordinary signature edit read as delete-plus-create. Both were
  rejected in favour of collapsing overloads into one node, because no operation the product offers
  — `callers`, `callees`, `impact`, `docs check`, `trace` — is meaningfully per-overload, and a
  document anchored to "overload 2 of `parse`" is a document nobody wants.
- **Materialising external symbols.** Rejected on scale: cal.com's sweep left **92,673** call sites
  crossing into `node_modules` against **26,091** resolved in-repo, and the first-party index is
  already 48 MB. External _packages_ are nodes; external _symbols_ are named on the edge and never
  materialised. (Both figures were re-measured by
  [#27](https://github.com/magicspon/codedocs/issues/27), which widened the ratio from 3.1:1 to
  3.6:1; the argument is unchanged.)
- **Storing `contains` edges.** Rejected: `Package → File → Symbol` containment is already encoded in
  the `SymbolId`'s descriptors, so storing it creates a second source of truth that can disagree with
  the first. `Project` membership is stored, because it is _not_ in the id and is genuinely
  many-to-many.
- **Migrating an index across a schema change.** Rejected: a full rebuild of cal.com is 22.9 s and is
  unconditionally correct, where a migration is neither.
- **A rename- or move-stable `SymbolId`.** Rejected because nobody has one. Six surveyed systems —
  SCIP, LSIF, Stack Graphs, Kythe, Glean, CodeQL — all derive identity from name plus path and
  re-derive it per snapshot. That is not an oversight repeated six times: stable identity under
  refactoring is not derivable from a single snapshot, and every one of those systems correctly
  refused to put a heuristic inside a primary key.

## Consequences

- **The `SymbolId` is a SCIP symbol string** in a `codedocs` scheme, with two normalisations: the
  `<version>` field is a fixed placeholder for workspace packages (a routine `version` bump would
  otherwise invalidate every symbol in a package and every cross-package reference to it), and locals
  are named by descriptor path rather than by ordinal. Third-party symbols keep their real version,
  where it carries information. In full:
  ``codedocs npm @fixture/pages . `src/page.ts`/renderPage().t.`` — scheme, manager, package,
  placeholder version, then the descriptors. The placeholder is `.`, SCIP's own convention for a
  field carrying no information, and it is also the `<package>` of a file no manifest above it names.
- **The file is one backtick-escaped namespace descriptor**, rather than one per path segment. The
  segmented form reads better and cannot be parsed: a `declare module "foo/bar"` is a namespace
  descriptor whose name needs escaping too, so no rule over the leading run separates the path from
  the descriptors below it. Reading a `SymbolId` back has to be total, because ADR 0006 accepts one
  as input, and the `Package → File → Symbol` containment this ADR refuses to store twice is encoded
  either way.
- **A descriptor's suffix comes from the declaration's kind, never from its initialiser.** `const f =
() => {}` is a term like every other `const`; reading the initialiser would make rewriting it as
  `const f = memo(() => {})` a rename, which is the churn on a body-only edit that offsets were
  rejected for. The consequence is that a merged `interface Foo` beside a `const Foo` would take two
  descriptors for one declaration, so **the collapse above is decided on the shorthand** — otherwise
  the form every document anchors to would be ambiguous for a pattern the language encourages.
- **A descriptor path segment is taken from what the author wrote**, which is what makes it survive a
  sibling being inserted above it where an ordinal does not. Four things name a scope: a declared
  name, an object-literal key, `constructor` or `static` for the one unnamed member a class may hold,
  and — for an anonymous callback — the call it is an argument to, including that call's first
  string-literal argument (`it("rejects an unknown field")`). Each segment is capped at 96
  characters: cal.com's longest id is 540 rather than 827, and the shortening costs 31 colliding
  declarations out of 48,517. Naming only the declarations, as the skeleton first did, collapsed
  **6,746 of cal.com's declarations onto 1,571 ids** — one per test case in the worst file — because
  an anonymous callback contributed no segment ([#34](https://github.com/magicspon/codedocs/issues/34)).
- **An id several unrelated declarations claim is reported, never merged silently.** Two declarations
  claiming one id from the _same_ declaration space are one symbol, and the overload and
  declaration-merging collapse above is deliberate. From _different_ spaces they are unrelated
  bindings, and the `Symbol` carries `collisions` — how many claim it — so an operation that walks
  its edges names the union as a blind spot instead of presenting it as `deterministic`. What
  survives is same-named locals in sibling blocks a language gives no name — `catch (err)` twice in
  one function, a `const` in each arm of an `if` — which is **405 declarations across 330 ids** on
  cal.com and **none** on the Next fixture. **No durable id collides.** An ordinal would close the
  remainder and is still refused for the reason above; an over-report that names itself is wrong in a
  way an over-report presented as complete is not.
- **`File` is a caller.** Module-level calls have no enclosing declaration and dropping them is not
  an option. This dissolves one of the three buckets the spike found conflated: with a `File` caller
  available, "no named caller" stops being an omission and becomes **caller attribution** — `symbol`,
  `variable` (the `brokenCaller.result` case, now a deliberate decision rather than an accident of a
  parent walk), or `file`.
- **The attribution walk seeks the nearest _callable_ ancestor, not the nearest _named_ one.** An
  enclosing variable takes the credit only when there is no callable ancestor at all, and that
  two-stage order is the decision rather than a detail of it. Read as "stop at the nearest named
  declaration", the split above credits `const clientI18n = useClientLocale()` inside `useLocale` to
  `clientI18n` instead of to the hook — so `callees` on any hook returns nothing and the call graph
  fragments into single-edge islands. The spike's own helper had exactly this defect, which is why
  the ordering is stated here rather than left to be inferred
  ([#26](https://github.com/magicspon/codedocs/issues/26)).
- **A call site that yields no edge is a stored fact with a cause**, following ADR 0001's precedent
  for unresolved specifiers. Three causes: `external` (resolved, target outside the repository),
  `unresolvable` (the checker returned nothing), and `dynamic` (`gateway[method](n)` — no target at
  all, and **the one case where codedocs cannot know it under-reported**, so it must be recorded even
  though there is nothing to point at).
- **Every edge instance carries `provenance` and `derivation`** — the latter a closed enum naming the
  rule that produced it: `checker-signature`, `checker-base-types`, `heritage-clause`,
  `jsx-element-rule`, `shared-method-name`, `manifest`, `resolver`. "This edge is inferred" is not
  actionable; "inferred because it was matched by shared method name across implementations" is. The
  field is `derivation` rather than `method` because `method` already means a class member here.
- **No fidelity field on an edge.** Per-edge provenance already carries what an edge out of a
  `syntactic` file looks like, and ADR 0001 warns against collapsing fidelity and completeness; a
  second copy on the edge is how that warning gets violated by accident.
- **Ranges are data, never identity.** Every `Symbol` carries its definition ranges — plural, per the
  overload collapse — and every edge instance carries the range of the site that produced it, because
  an edge without its call site cannot be shown to anyone (PRD §3.5). Making that affordable is
  [#9](https://github.com/magicspon/codedocs/issues/9)'s problem.
- **Three hashes are persisted, and one of them has a measured trap.** Per `File`: a content hash and
  an **export-shape hash** (distinct facts — the second gates incremental propagation). Per `Symbol`:
  a **shape hash**, computed from `typeToString` and expanding `Interface | TypeAlias | Class | Enum`
  via `getDeclaredTypeOfSymbol` + `getPropertiesOfType`. **Never from `Type.id`**, which was measured
  turning a body-only edit into 10 waves and 1,436 of 3,000 files, because type ids are assigned
  lazily per snapshot and the wave never terminates.
- **A symbol's kind lives at two grains.** The SCIP descriptor suffix gives the coarse class
  (`#` type, `.` term, `()` method, `/` namespace) and is derived, never stored. The fine kind —
  `function | class | interface | typeAlias | enum | variable | method | namespace` — is a stored
  `syntactic` attribute. Constants are `variable` with `mutable: false`, not a ninth kind. Components
  and hooks stay out entirely; they are a labelling layer over these kinds, and this is what keeps
  that layer additive.
- **The index header carries a `schemaVersion`**, and a mismatch is a full re-analysis with no
  migration path — reported when it fires, exactly as an environment-fingerprint change is.
- **The model has no dependency on any analysis backend**, at runtime or in its types, enforced
  mechanically rather than by review. The boundary is specified as **the facts the adapter owes**, not
  as the types it hides — because the leaks that hurt are semantic, not typed. Nobody was ever going
  to put a `NodeHandle` in a public signature; what actually costs is that `NodeHandle.path` is
  case-normalised on macOS while `Program.getSourceFileNames()` is not (this presented as a total
  0-of-13 edge disagreement that was purely a casing artefact), that JSX invocations arrive with
  `.call` undefined (**27% of a React repository's call graph**), and that `getSignatureUsage` returns
  0 for an `ArrowFunction` where it wanted the `VariableDeclaration`. Each of those is a normalisation
  the adapter performs once, at the boundary, and each is testable against a fixture.
- **The adapter contract is array-first.** "Give me facts for these N files", never "give me a fact
  for this symbol". Batching is a 17x effect that cannot be retrofitted without changing every call
  site, and this is also the seam that makes the bet on an explicitly unstable API reversible.
- **Cross-commit continuity is a separate inferred layer**
  ([#11](https://github.com/magicspon/codedocs/issues/11)) and may never touch the `SymbolId`. What
  this model makes possible: **move** is detectable (shape hash and descriptor suffix both survive
  it, and git's rename detection corroborates — cal.com offers 4,908 renames to test against);
  **rename** is detectable with a confidence (shape survives, name does not); **extract** is
  indistinguishable from delete-plus-create and codedocs should say so rather than guess; **delete**
  is only ever an absence. All four are `inferred`.
- **A `Document` may anchor only to a durable `SymbolId`, a `File`, a `Package` or a `Project`** —
  never to a range, never to a local symbol, never to an offset. Everything else about what a document
  points at is [#8](https://github.com/magicspon/codedocs/issues/8)'s.
- **"Which implementations could run at this call site" is not an edge kind.** It is per-call-site
  rather than per-symbol-pair, so materialising it costs O(call sites x implementations), and it is
  `inferred` where the call edge's declared target is not. It becomes a derived query over
  `implements` — [#10](https://github.com/magicspon/codedocs/issues/10)'s operation.
