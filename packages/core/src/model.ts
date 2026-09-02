/**
 * The internal representation: ADR 0002's node types, its closed edge enum, and
 * the honesty fields every fact carries.
 *
 * Nothing here may depend on an analysis backend, at runtime or in its types.
 * The adapter owes these facts; how it produces them is its own problem.
 */

/**
 * A symbol's name in the index: ADR 0002's normalised SCIP symbol string.
 *
 * ``codedocs npm @codedocs/core . `src/auth/service.ts`/AuthService#login().``
 * — deterministic and snapshot-scoped, so it says what a symbol is called in
 * this working tree at this commit and nothing about the past. `symbol-id.ts`
 * owns the scheme; ADR 0005's shorthand is a projection of it, and is what both
 * renderers print and what a document anchors to.
 */
export type SymbolId = string

/** A file's path, relative to the repository root, with `/` separators. */
export type FilePath = string

/** How far a single fact can be trusted. Carried by the fact, never by its kind. */
export type Provenance = 'deterministic' | 'syntactic' | 'inferred'

/** The rule that produced a fact, named on the fact itself. */
export type Derivation =
  | 'checker-signature'
  | 'checker-base-types'
  | 'heritage-clause'
  | 'jsx-element-rule'
  | 'shared-method-name'
  | 'manifest'
  | 'resolver'
  // ADR 0003's label signals, in precedence order. Appended rather than
  // interleaved: the stored code is a position, so the enum is append-only.
  | 'user-config'
  | 'git-untracked'
  | 'generated-header'
  | 'codegen-path'
  | 'path-convention'
  | 'tsconfig-exclude'
  /** Nothing else fired, which is what makes a file `source` and `authored`. */
  | 'default'
  // ADR 0007's continuity signals, strongest first, appended for the same reason
  // the label signals were: the stored code is a position, so the enum is
  // append-only. None of these is ever stored — continuity persists nothing and
  // caches nothing — but a `Derivation` is a `Derivation` wherever it is named.
  | 'content-hash'
  | 'path-prefix-rewrite'
  | 'git-rename'
  | 'shape-hash'
  | 'descriptor-suffix'
  | 'declared-name'
  | 'name-in-head'
  | 'call-site-overlap'

/**
 * The closed edge set. Adding a variant is a model change, which is the cost we
 * want: it forces the question "which backend actually produces this?".
 *
 * The skeleton emits `calls` and `analysedIn` only; the rest are declared so a
 * later operation is additive rather than a widening of the enum.
 */
export type EdgeKind =
  | 'imports'
  | 'exports'
  | 'calls'
  | 'references'
  | 'extends'
  | 'implements'
  | 'typeReferences'
  | 'dependsOn'
  | 'analysedIn'

/**
 * The fine kind of a symbol, stored and `syntactic`. The coarse class is derived
 * from the id and never stored. Constants are `variable` with `mutable: false`.
 */
export type SymbolKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'typeAlias'
  | 'enum'
  | 'variable'
  | 'method'
  | 'namespace'

/**
 * Which node a call edge is credited to. `file` is the honest answer for a
 * module-level call or one in an anonymous callback, not a dropped edge.
 */
export type CallerAttribution = 'symbol' | 'variable' | 'file'

/**
 * Why a call site produced no edge. `dynamic` is the one cause where codedocs
 * cannot know what it missed, so it is recorded even though there is nothing to
 * point at.
 */
export type UnresolvedCallCause = 'external' | 'unresolvable' | 'dynamic'

/** Which analysis ran on a file — never a claim about completeness. */
export type Fidelity = 'typed' | 'syntactic'

/**
 * ADR 0003's two label axes, which are orthogonal because the fixtures refuse to
 * let them collapse: `next.config.ts` is config *and* type-checked source, and
 * `apps.metadata.generated.ts` is generated *and* real source.
 *
 * Declared here because `codedocs.jsonc`'s `classify` block validates against
 * them; the label store that produces them is ADR 0003's to build.
 */
export type Role = 'source' | 'test' | 'config'

/** The second axis. Defaults to `authored`. */
export type Authorship = 'authored' | 'generated'

/**
 * Why a precondition is unmet, from ADR 0009's closed set.
 *
 * The first two have a remediation and the last two do not, for opposite
 * reasons: nothing would help a `broken` import, and no *command* would help an
 * `unmapped` one — it resolves under a framework's own resolver, which codedocs
 * declines to run. A cause is what `doctor` deduplicates across signals, so the
 * same missing codegen seen twice is reported once.
 */
export type PreconditionCause =
  | 'unprepared'
  | 'missing-generated'
  | 'unmapped'
  | 'broken'

/**
 * ADR 0003's two axes, as the name of one.
 *
 * Orthogonal because a single exclusive enum misclassifies every interesting
 * file in the fixtures, and always in the same direction — it drops real source
 * out of the graph. `next.config.ts` is config *and* type-checked source;
 * `apps.metadata.generated.ts` is generated *and* real source.
 */
export type LabelAxis = 'role' | 'authorship'

/** One axis's value, which is a `Role` for `role` and an `Authorship` for `authorship`. */
export type LabelValue = Role | Authorship

/**
 * One classification fact about a node: an axis, its value, and where it came
 * from.
 *
 * The third kind of thing the index holds, alongside nodes and edges — never a
 * node itself, which would be a node whose entire existence is one edge back to
 * its subject. Keyed by node id, so it labels a `Symbol` as readily as a `File`.
 */
export interface Label {
  /** The node it classifies: a `FilePath` today, a `SymbolId` when one is labelled. */
  readonly node: string
  readonly axis: LabelAxis
  readonly value: LabelValue
  readonly provenance: Provenance
  readonly derivation: Derivation
}

/** One TypeScript project: a single tsconfig and the files it globs. */
export interface ProjectNode {
  /** Repository-relative path of the tsconfig. Its identity. */
  readonly configPath: FilePath
  readonly fidelity: Fidelity
  readonly rootFileCount: number
  /** ISO timestamp of the analysis that produced this project's facts. */
  readonly analysedAt: string
  /**
   * ADR 0009's environment fingerprint, and part of the index's cache key.
   *
   * Stored because fidelity is stored: it reports the analysis that ran, not the
   * machine as it is now, so something has to say when the machine moved
   * underneath it. A project whose fingerprint changed is re-analysed in full.
   */
  readonly fingerprint: string
  /** Why this project's fidelity is `syntactic`, or `null` where it is `typed`. */
  readonly cause: PreconditionCause | null
  /**
   * Signal 2: an install script is declared for this project.
   *
   * Never a cause on its own — once `node_modules` exists it has already run —
   * so it only sharpens what an unprepared project is told to run.
   */
  readonly postinstall: boolean
}

/** One file in the working tree, and the signature drift is detected against. */
export interface FileNode {
  readonly path: FilePath
  readonly contentHash: string
  readonly size: number
  readonly mtimeMs: number
}

/**
 * One module specifier, resolved to the file it names.
 *
 * The reverse of this relation is what the incremental wave propagates along:
 * a file whose export shape moved is re-extracted together with the files that
 * import it, and no further.
 *
 * `to` is `null` when a **relative** specifier resolved to nothing. That is the
 * only unresolved case worth storing, because it is what tells the wave that a
 * file appearing later may complete an import that is broken today. A bare
 * specifier that does not resolve is a package, and there are far too many of
 * those to keep.
 */
export interface ImportEdge {
  readonly from: FilePath
  /** The specifier as written, which is the key that makes the row idempotent. */
  readonly specifier: string
  readonly to: FilePath | null
}

/**
 * One module specifier that resolved to nothing, where it was written.
 *
 * ADR 0009's fourth signal, and per site rather than per project: a rate cannot
 * tell a caller whether *this* answer is affected, and the deduplication that
 * makes 302 copies of one specifier readable is the operation's job, not the
 * store's. The cause is filesystem knowledge — which package is declared, which
 * is on disk — so the adapter reports the specifier and something above it says
 * why.
 */
export interface SpecifierSite {
  readonly file: FilePath
  /** The specifier as written, which is what a remediation has to name. */
  readonly specifier: string
  readonly line: number
}

/** One unresolved specifier, once the filesystem has said why. */
export interface UnresolvedSpecifier extends SpecifierSite {
  readonly cause: PreconditionCause
}

/** One declaration name in its scope. Overloads collapse into one node. */
export interface SymbolNode {
  readonly id: SymbolId
  /** The declared name, as written. */
  readonly name: string
  /** The dotted path from the file root, e.g. `AuthService.login`. */
  readonly qualified: string
  readonly kind: SymbolKind
  readonly file: FilePath
  /** Byte offset of the declaration. Data, never identity. */
  readonly start: number
  /** 1-based line, so an answer can render `file:line`. */
  readonly line: number
  /** Whether this id may be relied on to mean the same thing after an edit. */
  readonly durable: boolean
  readonly callable: boolean
  /**
   * How many declarations claim this id when they are not one symbol.
   *
   * `0` for the ordinary case, and for ADR 0002's deliberate collapse of
   * overloads and declaration merging — those *are* one symbol. Above `0` the id
   * is a collision: unrelated bindings share a descriptor path, so every edge
   * touching it is a union of that many bindings' edges. Reported rather than
   * hidden, because an over-report presented as `deterministic` is wrong where
   * an over-report that names itself is merely imprecise.
   */
  readonly collisions: number
}

/**
 * What a call edge is credited to.
 *
 * A `SymbolId` when the attribution is `symbol` or `variable`, a `FilePath` when
 * it is `file`. Both are strings, so the distinction is carried by
 * `CallEdge.attribution` rather than by the type — writing it as a union would
 * only claim a discrimination the compiler cannot make.
 */
export type CallSource = string

/**
 * Where one call happens, and how far that instance may be trusted.
 *
 * Named apart from the edge because ADR 0002 puts provenance on the edge
 * *instance* rather than the edge type — method dispatch over-approximates
 * across implementations, so only the site says which rule produced it. `trace`
 * needs the site without the endpoints, since a path already names those.
 */
export interface CallSite {
  readonly attribution: CallerAttribution
  /** The file the call site is in. */
  readonly file: FilePath
  readonly line: number
  readonly provenance: Provenance
  readonly derivation: Derivation
}

/** One call site that resolved to a symbol in this repository. */
export interface CallEdge extends CallSite {
  readonly from: CallSource
  readonly to: SymbolId
}

/**
 * The kinds of edge a reference produces, which are ADR 0002's edge enum minus
 * `calls`.
 *
 * `calls` and `references` stay separate, and that separation is why this
 * backend was chosen: SCIP conflates them — `IdentifierFunction` is documented
 * as "function references, including calls" — while `Checker` hands the
 * distinction over. Collapsing them here would discard the reason.
 */
export type ReferenceKind =
  | 'references'
  | 'extends'
  | 'implements'
  | 'typeReferences'

/**
 * One place a symbol is named without being called.
 *
 * Carries its own `provenance` and `derivation` for the same reason a call site
 * does: ADR 0002 puts both on the edge *instance*, so an edge may never inherit
 * them from its kind. A heritage clause and a type annotation are both resolved
 * by the checker and are the same kind of fact at different granularity, which
 * is what `derivation` says and `kind` does not.
 */
export interface ReferenceEdge {
  /** The symbol or file the reference is written in. */
  readonly from: CallSource
  readonly to: SymbolId
  readonly kind: ReferenceKind
  /** Which node the reference is credited to, by the same walk a call uses. */
  readonly attribution: CallerAttribution
  readonly file: FilePath
  readonly line: number
  readonly provenance: Provenance
  readonly derivation: Derivation
}

/** A call site that produced no edge, stored as a fact with its cause. */
export interface UnresolvedCall {
  readonly file: FilePath
  readonly line: number
  readonly cause: UnresolvedCallCause
  /** The callee text, where there was one to read. */
  readonly name: string | null
}
