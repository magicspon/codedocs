/**
 * The call-edge sweep: every call site collected client-side, then resolved in
 * checker batches. The spike measured the per-symbol method at 12.6 ms a
 * query, unbatchable; this sweep produces a strict superset of the same edges
 * in one round trip per `BATCH_SIZE` sites.
 */

import type { Project, Symbol as CheckerSymbol } from 'typescript/unstable/sync'
import type { Node, SourceFile } from 'typescript/unstable/ast'
import { SyntaxKind } from 'typescript/unstable/ast'

import type {
  CallEdge,
  CallSource,
  FilePath,
  SymbolId,
  UnresolvedCall,
  UnresolvedCallCause,
} from '../../model.ts'
import { attribute, descriptorPath } from './descriptors.ts'
import { lookupDeclaration } from './lookup.ts'
import { declarationKey, lineOf, nameOf } from './shared.ts'
import type { DeclarationResolver, OwnedFile, View } from './types.ts'

/** Call sites resolved per checker request. The spike's measured batch size. */
const BATCH_SIZE = 500

/** One call site, collected client-side before any checker round trip. */
interface CallSite {
  readonly callee: Node
  readonly site: Node
  readonly path: FilePath
  /** The program's own spelling of the file, which keys the declaration join. */
  readonly programPath: string
  readonly sf: SourceFile
  readonly jsx: boolean
}

/**
 * The callee identifier of a call site, or `undefined` if this node is not one.
 *
 * The JSX branch is the client-side rule ADR 0002 names as a boundary
 * normalisation: a JSX element is an invocation of its component, and the
 * checker reports those with `call` undefined. It is 27% of a React
 * repository's call graph.
 */
function calleeOf(node: Node): Node | undefined {
  const isCall =
    node.kind === SyntaxKind.CallExpression ||
    node.kind === SyntaxKind.NewExpression
  const isJsx =
    node.kind === SyntaxKind.JsxOpeningElement ||
    node.kind === SyntaxKind.JsxSelfClosingElement
  if (!isCall && !isJsx) return undefined

  let target: Node | undefined
  node.forEachChild((child) => {
    if (target === undefined) target = child
  })
  if (!target) return undefined

  // `a.b()` and `<a.B />` — the property name is the callee, not the object.
  if (target.kind === SyntaxKind.PropertyAccessExpression) {
    let last: Node | undefined
    target.forEachChild((child) => {
      if (child.kind === SyntaxKind.Identifier) last = child
    })
    return last
  }
  return target.kind === SyntaxKind.Identifier ? target : undefined
}

/**
 * Every call site in the given files, grouped by project.
 *
 * Grouped because `getSymbolAtLocation` batches within one checker, so a batch
 * that spanned projects would resolve against the wrong one.
 */
function collectCallSites(
  files: readonly OwnedFile[],
): Map<Project, CallSite[]> {
  const byProject = new Map<Project, CallSite[]>()
  for (const { path, programPath, sf, project } of files) {
    const sites = byProject.get(project) ?? []
    const walk = (node: Node): void => {
      const callee = calleeOf(node)
      if (callee) {
        sites.push({
          callee,
          site: node,
          path,
          programPath,
          sf,
          jsx:
            node.kind === SyntaxKind.JsxOpeningElement ||
            node.kind === SyntaxKind.JsxSelfClosingElement,
        })
      }
      node.forEachChild(walk)
    }
    sf.forEachChild(walk)
    byProject.set(project, sites)
  }
  return byProject
}

const record = (
  site: CallSite,
  cause: UnresolvedCallCause,
): UnresolvedCall => ({
  file: site.path,
  line: lineOf(site.sf, site.site.getStart(site.sf)),
  cause,
  name: nameOf(site.callee) ?? site.callee.getText(site.sf),
})

/**
 * Turn one resolved call site into an edge, or say why it produced none.
 *
 * An import or re-export alias resolves to the alias symbol, so a target absent
 * from the symbol table is followed through `getAliasedSymbol` once before being
 * called external.
 */
function resolveSite(
  project: Project,
  site: CallSite,
  symbol: CheckerSymbol | undefined,
  view: View,
  byDeclaration: ReadonlyMap<string, SymbolId>,
  resolve: DeclarationResolver | undefined,
): { edge: CallEdge } | { cause: UnresolvedCallCause } {
  if (!symbol) return { cause: 'unresolvable' }

  const target = lookupDeclaration(
    project,
    symbol,
    view,
    byDeclaration,
    resolve,
  )
  if (target === undefined) return { cause: 'external' }

  const { owner, attribution } = attribute(site.site)
  const from = callerOf(site, owner, view, byDeclaration)

  return {
    edge: {
      from,
      to: target,
      attribution,
      file: site.path,
      line: lineOf(site.sf, site.site.getStart(site.sf)),
      // A plain call resolved by the checker is observed. A JSX element is an
      // invocation by a rule this adapter applies, so it is syntactic — ADR 0002
      // forbids an edge inheriting its provenance from its kind.
      provenance: site.jsx ? 'syntactic' : 'deterministic',
      derivation: site.jsx ? 'jsx-element-rule' : 'checker-signature',
    },
  }
}

/**
 * The node a site's edge is credited to.
 *
 * Through the symbol table rather than rebuilt from the owner, because the two
 * can disagree: a merged `interface Foo`/`const Foo` is one node under the first
 * declaration's descriptors, and an edge credited to the other half would name
 * an id no row holds. A file caller keeps the path as its identity, per ADR
 * 0002's node table — only a `Symbol` is ever a SCIP string.
 */
function callerOf(
  site: { path: FilePath; programPath: string; sf: SourceFile },
  owner: Node | undefined,
  view: View,
  byDeclaration: ReadonlyMap<string, SymbolId>,
): CallSource {
  if (owner === undefined) return site.path
  const start = owner.getStart(site.sf)
  return (
    byDeclaration.get(declarationKey(site.programPath, start)) ??
    view.naming.idOf(site.path, descriptorPath(owner, site.sf))
  )
}

/** One checker round trip, and the edges or causes its answers produced. */
function resolveBatch(
  project: Project,
  chunk: readonly CallSite[],
  view: View,
  byDeclaration: ReadonlyMap<string, SymbolId>,
  resolve: DeclarationResolver | undefined,
): { callEdges: CallEdge[]; unresolvedCalls: UnresolvedCall[] } {
  let resolved: (CheckerSymbol | undefined)[]
  try {
    resolved = project.checker.getSymbolAtLocation(
      chunk.map((site) => site.callee),
    )
  } catch {
    // A failed batch is recorded site by site rather than dropped: a call site
    // that yields no edge is a fact with a cause, per ADR 0002.
    return {
      callEdges: [],
      unresolvedCalls: chunk.map((site) => record(site, 'unresolvable')),
    }
  }

  const callEdges: CallEdge[] = []
  const unresolvedCalls: UnresolvedCall[] = []
  for (const [offset, site] of chunk.entries()) {
    const outcome = resolveSite(
      project,
      site,
      resolved[offset],
      view,
      byDeclaration,
      resolve,
    )
    if ('cause' in outcome) unresolvedCalls.push(record(site, outcome.cause))
    else callEdges.push(outcome.edge)
  }
  return { callEdges, unresolvedCalls }
}

export function sweepCallEdges(
  files: readonly OwnedFile[],
  view: View,
  byDeclaration: ReadonlyMap<string, SymbolId>,
  resolve: DeclarationResolver | undefined,
): { callEdges: CallEdge[]; unresolvedCalls: UnresolvedCall[] } {
  const callEdges: CallEdge[] = []
  const unresolvedCalls: UnresolvedCall[] = []

  for (const [project, sites] of collectCallSites(files)) {
    for (let i = 0; i < sites.length; i += BATCH_SIZE) {
      const batch = resolveBatch(
        project,
        sites.slice(i, i + BATCH_SIZE),
        view,
        byDeclaration,
        resolve,
      )
      callEdges.push(...batch.callEdges)
      unresolvedCalls.push(...batch.unresolvedCalls)
    }
  }
  return { callEdges, unresolvedCalls }
}
