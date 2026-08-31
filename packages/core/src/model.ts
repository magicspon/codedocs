/**
 * The internal representation: ADR 0002's node types, its closed edge enum, and
 * the honesty fields every fact carries.
 *
 * Nothing here may depend on an analysis backend, at runtime or in its types.
 * The adapter owes these facts; how it produces them is its own problem.
 */

/**
 * A symbol's name in the index.
 *
 * The skeleton uses ADR 0005's shorthand — `src/auth/service.ts#AuthService.login`
 * — rather than ADR 0002's SCIP string. The shorthand is already the form both
 * renderers print and accept, and ADR 0004 makes a schema change a cold rebuild
 * rather than a migration, so the SCIP scheme stays cheap to add later.
 *
 * TODO(#7): replace with the normalised SCIP symbol string once documents or
 * continuity need a durable, cross-package name.
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

/** One TypeScript project: a single tsconfig and the files it globs. */
export interface ProjectNode {
  /** Repository-relative path of the tsconfig. Its identity. */
  readonly configPath: FilePath
  readonly fidelity: Fidelity
  readonly rootFileCount: number
  /** ISO timestamp of the analysis that produced this project's facts. */
  readonly analysedAt: string
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

/** A call site that produced no edge, stored as a fact with its cause. */
export interface UnresolvedCall {
  readonly file: FilePath
  readonly line: number
  readonly cause: UnresolvedCallCause
  /** The callee text, where there was one to read. */
  readonly name: string | null
}
