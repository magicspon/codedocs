/**
 * The TypeScript 7 adapter: the only file in codedocs that knows a backend exists.
 *
 * It sweeps call sites and resolves callees in batches, rather than asking
 * "who calls X" per symbol. The spike measured the per-symbol method at 12.6 ms
 * a query, unbatchable, and projected 122 s for one cal.com project; the sweep
 * produces a strict superset of the same edges in 4.1 s.
 *
 * ADR 0002 makes this seam array-first — "facts for these N files", never "a
 * fact for this symbol" — because batching is a 17x effect that cannot be
 * retrofitted, and because it is what keeps the bet on an unstable API
 * reversible.
 */

import {
  API,
  type Project,
  type Symbol as CheckerSymbol,
} from 'typescript/unstable/sync'
import { type Node, type SourceFile, SyntaxKind } from 'typescript/unstable/ast'

import { toRepoPath } from '../discovery.ts'
import type {
  CallEdge,
  CallerAttribution,
  FilePath,
  SymbolId,
  SymbolKind,
  SymbolNode,
  UnresolvedCall,
  UnresolvedCallCause,
} from '../model.ts'

/** Call sites resolved per checker request. The spike's measured batch size. */
const BATCH_SIZE = 500

/** A node that carries a declared name. The AST types do not narrow this for us. */
interface NamedNode extends Node {
  readonly name?: { readonly text?: string }
}

/**
 * Declaration kinds that become a `Symbol` node and contribute a segment to a
 * qualified name.
 */
const NAMED_DECLARATION: ReadonlyMap<SyntaxKind, SymbolKind> = new Map([
  [SyntaxKind.FunctionDeclaration, 'function'],
  [SyntaxKind.ClassDeclaration, 'class'],
  [SyntaxKind.InterfaceDeclaration, 'interface'],
  [SyntaxKind.MethodDeclaration, 'method'],
  [SyntaxKind.MethodSignature, 'method'],
  [SyntaxKind.TypeAliasDeclaration, 'typeAlias'],
  [SyntaxKind.EnumDeclaration, 'enum'],
  [SyntaxKind.GetAccessor, 'method'],
  [SyntaxKind.SetAccessor, 'method'],
  [SyntaxKind.PropertyDeclaration, 'variable'],
  [SyntaxKind.VariableDeclaration, 'variable'],
  [SyntaxKind.ModuleDeclaration, 'namespace'],
] as const)

/** Initialisers that make a variable or property declaration callable. */
const FUNCTION_INITIALISER: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.ArrowFunction,
  SyntaxKind.FunctionExpression,
])

/** Kinds that are callable on their own, without inspecting an initialiser. */
const CALLABLE_KIND: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.MethodDeclaration,
  SyntaxKind.MethodSignature,
  SyntaxKind.Constructor,
  SyntaxKind.GetAccessor,
  SyntaxKind.SetAccessor,
])

/** Kinds that introduce a new scope, and so end a local symbol's durability. */
const SCOPE_KIND: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.MethodDeclaration,
  SyntaxKind.ArrowFunction,
  SyntaxKind.FunctionExpression,
  SyntaxKind.Constructor,
  SyntaxKind.GetAccessor,
  SyntaxKind.SetAccessor,
])

/** Everything one analysis run produced, ready for the store. */
export interface AdapterResult {
  /** Repository-relative paths of every file the analysis saw, per project. */
  readonly filesByProject: ReadonlyMap<FilePath, readonly FilePath[]>
  readonly symbols: readonly SymbolNode[]
  readonly callEdges: readonly CallEdge[]
  readonly unresolvedCalls: readonly UnresolvedCall[]
  /** Projects whose tsconfig globbed no files, so nothing could be analysed in them. */
  readonly emptyProjects: readonly FilePath[]
}

const isCallable = (node: Node): boolean => {
  if (CALLABLE_KIND.has(node.kind)) return true
  if (
    node.kind !== SyntaxKind.VariableDeclaration &&
    node.kind !== SyntaxKind.PropertyDeclaration
  ) {
    return false
  }
  let hasFunction = false
  node.forEachChild((child) => {
    if (FUNCTION_INITIALISER.has(child.kind)) hasFunction = true
  })
  return hasFunction
}

const nameOf = (node: Node): string | undefined =>
  (node as NamedNode).name?.text

/**
 * A file the repository owns. `node_modules` and the default libraries are
 * walked by the program but are never nodes: cal.com's sweep left 251,648 call
 * sites crossing into `node_modules` against 81,888 resolved in-repo.
 */
const isRepoFile = (path: string): boolean =>
  !path.includes('/node_modules/') && !/\/lib\.[a-z0-9.]*d\.ts$/.test(path)

/** The dotted path from the file root, e.g. `AuthService.login`. */
function qualifiedName(node: Node): string {
  const parts: string[] = []
  let current: Node | undefined = node
  while (current) {
    const text = nameOf(current)
    if (text !== undefined && NAMED_DECLARATION.has(current.kind))
      parts.unshift(text)
    current = current.parent
  }
  return parts.join('.')
}

/**
 * Whether an id may be relied on to mean the same thing after an edit.
 *
 * A symbol declared inside a function body is not durable: nothing above it in
 * the index may anchor to one. They are still indexed — 25 of the Next.js
 * fixture's 175 call edges are calls to local bindings, and dropping 14% of a
 * repository's call graph is not an edge case.
 */
function isDurable(node: Node): boolean {
  let current: Node | undefined = node.parent
  while (current) {
    if (SCOPE_KIND.has(current.kind)) return false
    current = current.parent
  }
  return true
}

/**
 * Which node a call site is credited to, and how.
 *
 * ADR 0002's three-way split, in the order that matters: the nearest **callable**
 * ancestor wins, and only when there is none does an enclosing variable take the
 * credit. Stopping at the nearest *named* ancestor instead credits
 * `const client = useClientLocale()` to `client` rather than to the hook around
 * it — which fragments the graph so badly that asking for a function's callees
 * returns nothing.
 */
function attribute(node: Node): {
  owner: Node | undefined
  attribution: CallerAttribution
} {
  let nearestNamed: Node | undefined
  let current: Node | undefined = node
  while (current) {
    if (NAMED_DECLARATION.has(current.kind) && nameOf(current) !== undefined) {
      if (isCallable(current)) return { owner: current, attribution: 'symbol' }
      nearestNamed ??= current
    }
    current = current.parent
  }
  // No enclosing declaration at all: a module-level call or one in an anonymous
  // callback. The file is the honest caller, not a dropped edge.
  return nearestNamed === undefined
    ? { owner: undefined, attribution: 'file' }
    : { owner: nearestNamed, attribution: 'variable' }
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
 * The join key between a resolved checker symbol and the symbol table.
 *
 * Lower-cased on both sides because `NodeHandle.path` is case-normalised on
 * macOS while `Program.getSourceFileNames()` is not. Left unnormalised, this
 * presents as a total edge disagreement that is purely a casing artefact.
 */
const declarationKey = (path: string, start: number): string =>
  `${path.toLowerCase()}:${start}`

/** 1-based line of a position, for rendering `file:line`. */
const lineOf = (sourceFile: SourceFile, position: number): number =>
  sourceFile.getLineAndCharacterOfPosition(position).line + 1

/**
 * Analyse the given projects and return every fact they yield.
 *
 * Opens one API instance for all projects: the spike measured TypeScript 6
 * exhausting an 8 GB heap on cal.com's 31 projects, where TypeScript 7
 * completes the same work at 2.4 GB.
 *
 * @param root - Absolute path of the repository root.
 * @param configPaths - Repository-relative tsconfig paths to open.
 */
export function analyse(
  root: string,
  configPaths: readonly FilePath[],
): AdapterResult {
  const api = new API({ cwd: root })
  try {
    const snapshot = api.updateSnapshot({
      openProjects: configPaths.map((path) => `${root}/${path}`),
    })
    const projects = snapshot.getProjects()
    // An unrecognised `DocumentIdentifier` shape yields zero projects and no
    // error, so an empty list must be a hard failure rather than an empty index.
    if (projects.length === 0) {
      throw new Error(
        `no projects opened from ${configPaths.length} tsconfig path(s)`,
      )
    }

    const ownership = assignFiles(root, projects)
    const { nodes, byDeclaration } = sweepSymbols(ownership)
    const { callEdges, unresolvedCalls } = sweepCallEdges(
      ownership,
      byDeclaration,
    )

    return {
      filesByProject: ownership.filesByProject,
      symbols: nodes,
      callEdges,
      unresolvedCalls,
      emptyProjects: projects
        .filter((project) => project.rootFiles.length === 0)
        .map((project) => toRepoPath(root, project.configFileName))
        .sort(),
    }
  } finally {
    api.close()
  }
}

/** One repository file, and the project both sweeps will analyse it in. */
interface OwnedFile {
  /** The program's own path, which is what the checker hands back. */
  readonly programPath: string
  readonly path: FilePath
  readonly sf: SourceFile
  readonly project: Project
}

/** Every repository file, each assigned to exactly one project. */
interface Ownership {
  readonly files: readonly OwnedFile[]
  readonly filesByProject: ReadonlyMap<FilePath, readonly FilePath[]>
}

/**
 * Assign each repository file to one canonical project.
 *
 * A file may belong to several projects, and ADR 0002 stores that as
 * `analysedIn` with a `canonical` flag. Both sweeps must agree on which project
 * that is, or a file shared between two projects contributes its symbols once
 * and its call edges twice. First project wins, and projects are already sorted
 * by config path, so the choice is deterministic.
 *
 * TODO(#9): store the non-canonical memberships as `analysedIn` edges too.
 */
function assignFiles(root: string, projects: readonly Project[]): Ownership {
  const files: OwnedFile[] = []
  const filesByProject = new Map<FilePath, readonly FilePath[]>()
  const claimed = new Set<string>()

  for (const project of projects) {
    const owned: FilePath[] = []
    for (const programPath of project.program.getSourceFileNames()) {
      if (!isRepoFile(programPath) || claimed.has(programPath)) continue
      const sf = project.program.getSourceFile(programPath)
      if (!sf) continue
      claimed.add(programPath)
      const path = toRepoPath(root, programPath)
      files.push({ programPath, path, sf, project })
      owned.push(path)
    }
    owned.sort()
    filesByProject.set(toRepoPath(root, project.configFileName), owned)
  }
  return { files, filesByProject }
}

/** The symbol table, plus the join index the edge sweep resolves against. */
interface SymbolSweep {
  readonly nodes: readonly SymbolNode[]
  /**
   * Program path and declaration offset to `SymbolId`. Alive for one run and
   * never persisted: ADR 0002 rejected `(path, offset)` as identity, not as a
   * build-time join.
   */
  readonly byDeclaration: ReadonlyMap<string, SymbolId>
}

function sweepSymbols(ownership: Ownership): SymbolSweep {
  const nodes: SymbolNode[] = []
  const byDeclaration = new Map<string, SymbolId>()

  for (const { programPath, path, sf } of ownership.files) {
    const walk = (node: Node): void => {
      const kind = NAMED_DECLARATION.get(node.kind)
      const name = nameOf(node)
      if (kind !== undefined && name !== undefined) {
        const start = node.getStart(sf)
        const qualified = qualifiedName(node)
        const id = `${path}#${qualified}`
        nodes.push({
          id,
          name,
          qualified,
          kind,
          file: path,
          start,
          line: lineOf(sf, start),
          durable: isDurable(node),
          callable: isCallable(node),
        })
        byDeclaration.set(declarationKey(programPath, start), id)
      }
      node.forEachChild(walk)
    }
    sf.forEachChild(walk)
  }
  return { nodes, byDeclaration }
}

/** One call site, collected client-side before any checker round trip. */
interface CallSite {
  readonly callee: Node
  readonly site: Node
  readonly path: FilePath
  readonly sf: SourceFile
  readonly jsx: boolean
}

function sweepCallEdges(
  ownership: Ownership,
  byDeclaration: ReadonlyMap<string, SymbolId>,
): { callEdges: CallEdge[]; unresolvedCalls: UnresolvedCall[] } {
  const callEdges: CallEdge[] = []
  const unresolvedCalls: UnresolvedCall[] = []

  // Grouped by project because `getSymbolAtLocation` batches within one checker.
  const byProject = new Map<Project, CallSite[]>()
  for (const { path, sf, project } of ownership.files) {
    const sites = byProject.get(project) ?? []
    const walk = (node: Node): void => {
      const callee = calleeOf(node)
      if (callee) {
        sites.push({
          callee,
          site: node,
          path,
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

  for (const [project, sites] of byProject) {
    for (let i = 0; i < sites.length; i += BATCH_SIZE) {
      const chunk = sites.slice(i, i + BATCH_SIZE)
      let resolved: (CheckerSymbol | undefined)[]
      try {
        resolved = project.checker.getSymbolAtLocation(
          chunk.map((site) => site.callee),
        )
      } catch {
        // A failed batch is recorded site by site rather than dropped: a call
        // site that yields no edge is a fact with a cause, per ADR 0002.
        for (const site of chunk)
          unresolvedCalls.push(record(site, 'unresolvable'))
        continue
      }
      for (const [offset, site] of chunk.entries()) {
        const outcome = resolveSite(
          project,
          site,
          resolved[offset],
          byDeclaration,
        )
        if ('cause' in outcome)
          unresolvedCalls.push(record(site, outcome.cause))
        else callEdges.push(outcome.edge)
      }
    }
  }
  return { callEdges, unresolvedCalls }
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
  byDeclaration: ReadonlyMap<string, SymbolId>,
): { edge: CallEdge } | { cause: UnresolvedCallCause } {
  if (!symbol) return { cause: 'unresolvable' }

  let target = lookup(project, symbol, byDeclaration)
  if (target === undefined) {
    try {
      const aliased = project.checker.getAliasedSymbol(symbol)
      if (aliased) target = lookup(project, aliased, byDeclaration)
    } catch {
      // Not an alias, so the target is simply outside the repository.
    }
  }
  if (target === undefined) return { cause: 'external' }

  const { owner, attribution } = attribute(site.site)
  const from =
    owner === undefined ? site.path : `${site.path}#${qualifiedName(owner)}`

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

/** Match a checker symbol back to the symbol table through its declarations. */
function lookup(
  project: Project,
  symbol: CheckerSymbol,
  byDeclaration: ReadonlyMap<string, SymbolId>,
): SymbolId | undefined {
  for (const declaration of symbol.declarations) {
    const node = declaration.resolve(project)
    if (!node) continue
    const sf = project.program.getSourceFile(declaration.path)
    if (!sf) continue
    const hit = byDeclaration.get(
      declarationKey(declaration.path, node.getStart(sf)),
    )
    if (hit !== undefined) return hit
  }
  return undefined
}
