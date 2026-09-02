/**
 * The reference sweep: every identifier that names a symbol without calling it.
 *
 * The same shape as the call sweep — collect client-side, resolve in checker
 * batches — because it is the same question asked of different nodes, and the
 * spike's measurement holds for both: one round trip per `BATCH_SIZE` sites
 * against 12.6 ms for every per-symbol query.
 *
 * ADR 0002 keeps `calls` and `references` apart, and this file is where that
 * separation is enforced: a callee identifier belongs to the call sweep and is
 * skipped here, so no site is ever counted twice.
 */

import type { Project, Symbol as CheckerSymbol } from 'typescript/unstable/sync'
import type { Node, SourceFile } from 'typescript/unstable/ast'
import { SyntaxKind } from 'typescript/unstable/ast'

import type {
  FilePath,
  ReferenceEdge,
  ReferenceKind,
  SymbolId,
} from '../../model.ts'
import { attribute, descriptorPath } from './descriptors.ts'
import { lookupDeclaration } from './lookup.ts'
import { lineOf } from './shared.ts'
import type { DeclarationResolver, OwnedFile, View } from './types.ts'

/** Identifiers resolved per checker request. The call sweep's measured size. */
const BATCH_SIZE = 500

/** One identifier collected client-side, with the kind its position gives it. */
interface ReferenceSite {
  readonly identifier: Node
  readonly kind: ReferenceKind
  readonly path: FilePath
  readonly sf: SourceFile
}

/**
 * Whether this identifier is the name a declaration declares.
 *
 * A declaration is not a reference to itself, and every named form is caught by
 * one rule: the parent's `name` is this node. That covers a function's name, a
 * parameter's, an object-literal key and an import binding alike, without a
 * table of kinds to keep in step with the language.
 */
const isDeclaredName = (identifier: Node, parent: Node): boolean =>
  (parent as { readonly name?: Node }).name === identifier

/**
 * Whether the call sweep has already claimed this identifier.
 *
 * Mirrors `calleeOf` from the other side: a call's callee — including the
 * property name of `a.b()` and the tag of `<a.B />` — is a `calls` edge, and
 * reporting it again here would make every call two facts.
 */
function isCallee(identifier: Node, parent: Node): boolean {
  const invoked = (node: Node | undefined): boolean =>
    node !== undefined &&
    (node.kind === SyntaxKind.CallExpression ||
      node.kind === SyntaxKind.NewExpression ||
      node.kind === SyntaxKind.JsxOpeningElement ||
      node.kind === SyntaxKind.JsxSelfClosingElement)

  if (invoked(parent)) return firstChild(parent) === identifier
  // `a.b()`: the property access is the callee, and its last identifier is the
  // one the call sweep resolved.
  if (parent.kind !== SyntaxKind.PropertyAccessExpression) return false
  return (
    invoked(parent.parent) &&
    firstChild(parent.parent) === parent &&
    lastIdentifier(parent) === identifier
  )
}

/** The first child of a node, which for a call is its callee expression. */
function firstChild(node: Node): Node | undefined {
  let found: Node | undefined
  node.forEachChild((child) => {
    if (found === undefined) found = child
  })
  return found
}

/** The last identifier child, which for `a.b` is `b`. */
function lastIdentifier(node: Node): Node | undefined {
  let found: Node | undefined
  node.forEachChild((child) => {
    if (child.kind === SyntaxKind.Identifier) found = child
  })
  return found
}

/**
 * Positions that are no reference at all.
 *
 * An import or an export is already an edge of its own kind, produced by the
 * import sweep against the file. Reporting it here as well would make every
 * re-export two facts about one line.
 */
const NOT_A_REFERENCE: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.ImportDeclaration,
  SyntaxKind.ExportDeclaration,
  SyntaxKind.ImportEqualsDeclaration,
])

/** Positions that make an identifier a type reference. */
const TYPE_POSITION: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.TypeReference,
  SyntaxKind.TypeQuery,
])

/**
 * Positions that settle nothing.
 *
 * `a.b` and `A.B` are the same shape in a value position and a type one, so the
 * answer is whatever encloses them.
 */
const UNDECIDED: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.QualifiedName,
  SyntaxKind.PropertyAccessExpression,
  SyntaxKind.ExpressionWithTypeArguments,
])

/**
 * The kind a position gives an identifier, or `undefined` where it is no
 * reference at all.
 *
 * Read by climbing from the identifier to the first ancestor that decides the
 * question, so a name qualified by a namespace — `types.Money` in an annotation,
 * `React.Component` in a heritage clause — is classified by what it is written
 * in rather than by its own immediate parent.
 */
function kindOf(identifier: Node): ReferenceKind | undefined {
  let child = identifier
  let parent: Node | undefined = identifier.parent
  while (parent !== undefined) {
    if (isDeclaredName(child, parent)) return undefined
    if (NOT_A_REFERENCE.has(parent.kind)) return undefined
    if (parent.kind === SyntaxKind.HeritageClause) return heritageKind(parent)
    if (TYPE_POSITION.has(parent.kind)) return 'typeReferences'
    if (!UNDECIDED.has(parent.kind)) return 'references'
    child = parent
    parent = parent.parent
  }
  return 'references'
}

/**
 * Which half of a heritage clause an identifier sits in.
 *
 * The AST types do not narrow a `Node` to its clause, and the token is the only
 * thing that separates a base class from an implemented interface.
 */
const heritageKind = (clause: Node): ReferenceKind =>
  (clause as { readonly token?: SyntaxKind }).token ===
  SyntaxKind.ExtendsKeyword
    ? 'extends'
    : 'implements'

/**
 * Every reference site in the given files, grouped by project.
 *
 * Grouped for the same reason the call sweep groups: `getSymbolAtLocation`
 * batches within one checker, so a batch spanning projects would resolve
 * against the wrong one.
 */
function collectReferenceSites(
  files: readonly OwnedFile[],
): Map<Project, ReferenceSite[]> {
  const byProject = new Map<Project, ReferenceSite[]>()
  for (const { path, sf, project } of files) {
    const sites = byProject.get(project) ?? []
    const walk = (node: Node): void => {
      if (node.kind === SyntaxKind.Identifier) {
        const parent = node.parent
        const kind =
          parent !== undefined && isCallee(node, parent)
            ? undefined
            : kindOf(node)
        if (kind !== undefined) sites.push({ identifier: node, kind, path, sf })
      }
      node.forEachChild(walk)
    }
    sf.forEachChild(walk)
    byProject.set(project, sites)
  }
  return byProject
}

/** Turn one resolved identifier into an edge, or drop it. */
function resolveSite(
  project: Project,
  site: ReferenceSite,
  symbol: CheckerSymbol | undefined,
  view: View,
  byDeclaration: ReadonlyMap<string, SymbolId>,
  resolve: DeclarationResolver | undefined,
): ReferenceEdge | undefined {
  if (!symbol) return undefined
  const target = lookupDeclaration(
    project,
    symbol,
    view,
    byDeclaration,
    resolve,
  )
  // Unlike an unresolved *call*, a reference that resolved to nothing is not
  // recorded: an identifier naming a package's type is the ordinary case, not a
  // fact about this repository, and 92,673 of them crossed into `node_modules`
  // on cal.com's call sweep alone.
  if (target === undefined) return undefined

  const { owner, attribution } = attribute(site.identifier)
  const from =
    owner === undefined
      ? site.path
      : `${site.path}#${descriptorPath(owner, site.sf)}`
  // A reference into the symbol it is written in says only that a declaration
  // mentions its own name — a recursive type, a class naming itself.
  if (from === target) return undefined

  return {
    from,
    to: target,
    kind: site.kind,
    attribution,
    file: site.path,
    line: lineOf(site.sf, site.identifier.getStart(site.sf)),
    // The checker resolved the identifier either way; the derivation names the
    // rule that decided *which* kind of reference it is, which for a heritage
    // clause is this adapter's reading of the clause rather than the checker's.
    provenance: 'deterministic',
    derivation:
      site.kind === 'extends' || site.kind === 'implements'
        ? 'heritage-clause'
        : 'checker-signature',
  }
}

/** One checker round trip, and the edges its answers produced. */
function resolveBatch(
  project: Project,
  chunk: readonly ReferenceSite[],
  view: View,
  byDeclaration: ReadonlyMap<string, SymbolId>,
  resolve: DeclarationResolver | undefined,
): ReferenceEdge[] {
  let resolved: (CheckerSymbol | undefined)[]
  try {
    resolved = project.checker.getSymbolAtLocation(
      chunk.map((site) => site.identifier),
    )
  } catch {
    // A failed batch yields no references. Unlike a call site there is nothing
    // to record: a reference has no unresolved counterpart in the model, and
    // inventing one would put a batch failure in the same list as a repository's
    // own broken names.
    return []
  }
  const edges: ReferenceEdge[] = []
  for (const [offset, site] of chunk.entries()) {
    const edge = resolveSite(
      project,
      site,
      resolved[offset],
      view,
      byDeclaration,
      resolve,
    )
    if (edge !== undefined) edges.push(edge)
  }
  return edges
}

/** Every non-call reference the given files make into this repository. */
export function sweepReferenceEdges(
  files: readonly OwnedFile[],
  view: View,
  byDeclaration: ReadonlyMap<string, SymbolId>,
  resolve: DeclarationResolver | undefined,
): ReferenceEdge[] {
  const edges: ReferenceEdge[] = []
  for (const [project, sites] of collectReferenceSites(files)) {
    for (let at = 0; at < sites.length; at += BATCH_SIZE) {
      edges.push(
        ...resolveBatch(
          project,
          sites.slice(at, at + BATCH_SIZE),
          view,
          byDeclaration,
          resolve,
        ),
      )
    }
  }
  return edges
}
