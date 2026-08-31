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
 * reversible. `openAnalysis` is that contract taken literally: one open backend
 * that the incremental wave drives across several extractions, each naming its
 * own file set.
 */

import { createHash } from 'node:crypto'

import {
  API,
  type Checker,
  type Project,
  SymbolFlags,
  type Symbol as CheckerSymbol,
  type Type,
} from 'typescript/unstable/sync'
import {
  type Node,
  type SourceFile,
  type StringLiteral,
  SyntaxKind,
} from 'typescript/unstable/ast'

import { toRepoPath } from '../discovery.ts'
import type {
  CallEdge,
  CallerAttribution,
  FilePath,
  ImportEdge,
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

/** Declarations that carry a module specifier, and so contribute an import edge. */
const IMPORTING_DECLARATION: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.ImportDeclaration,
  SyntaxKind.ExportDeclaration,
])

/**
 * Symbol flags whose shape lives in the *declared* type rather than the value
 * type. ADR 0002's measured trap: an interface reports `any` from
 * `getTypeOfSymbol`, so a hash built only from that misses a member being added
 * to an exported interface — a silently stale index rather than a slow one.
 */
const TYPE_ISH =
  SymbolFlags.Interface |
  SymbolFlags.TypeAlias |
  SymbolFlags.Class |
  SymbolFlags.Enum

/** Everything one extraction produced, ready for the store. */
export interface AdapterResult {
  /**
   * Repository-relative paths of every file the open projects contain, per
   * project — whether or not this extraction looked at them.
   *
   * The cold build's view of the tree. A wave opens a subset of the projects, so
   * it must write membership from `canonicalOf` instead or it would drop the
   * files of every project it did not open.
   */
  readonly filesByProject: ReadonlyMap<FilePath, readonly FilePath[]>
  /** The files this extraction actually produced facts for. */
  readonly extracted: readonly FilePath[]
  /** The one project each extracted file's facts were produced in. */
  readonly canonicalOf: ReadonlyMap<FilePath, FilePath>
  readonly symbols: readonly SymbolNode[]
  readonly callEdges: readonly CallEdge[]
  readonly unresolvedCalls: readonly UnresolvedCall[]
  readonly importEdges: readonly ImportEdge[]
  /**
   * Per extracted file, the hash of its resolved export surface.
   *
   * `''` means "assume it moved": the file is not a module, or its shape could
   * not be computed. The wave treats that as a change, so the failure mode is
   * one extra file re-extracted rather than a stale answer.
   */
  readonly exportShapes: ReadonlyMap<FilePath, string>
  /** Projects whose tsconfig globbed no files, so nothing could be analysed in them. */
  readonly emptyProjects: readonly FilePath[]
}

/**
 * Resolve a declaration site the current extraction did not sweep.
 *
 * The wave extracts a handful of files, so a call from one of them into an
 * unchanged file has no in-memory symbol to join against. The session supplies
 * the index as the fallback: the unchanged file's rows are current by
 * definition, which is what makes a bounded extraction produce whole edges.
 */
export type DeclarationResolver = (
  path: FilePath,
  start: number,
) => SymbolId | undefined

/** One extraction: which files, analysed where, joined against what. */
export interface ExtractRequest {
  readonly files: readonly FilePath[]
  /**
   * The project to analyse a file in, when the index already recorded one.
   *
   * Without it a wave that opened one project would credit a shared file to a
   * different project than the cold build did, and the same file would report a
   * different fidelity depending on which question reached it first.
   */
  readonly canonicalOf?: ReadonlyMap<FilePath, FilePath>
  readonly resolve?: DeclarationResolver
}

/** One open backend, driven across as many extractions as the wave needs. */
export interface AnalysisSession {
  /**
   * Ensure these tsconfigs are open. Opens are ref-counted and persist across
   * snapshots, so a wave that crosses into a new project only pays for that one.
   */
  openProjects(configPaths: readonly FilePath[]): void
  /**
   * Open these files so the server finds the tsconfig that contains them.
   *
   * For a file the index has never seen there is nothing to look its project up
   * in, and guessing the nearest ancestor tsconfig is a heuristic. The server
   * already does this search, and `getDefaultProjectForFile` reports the answer.
   */
  adoptFiles(files: readonly FilePath[]): void
  extract(request: ExtractRequest): AdapterResult
  close(): void
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
 * The cold path, and a thin wrapper over one extraction covering every file the
 * projects contain. It exists so the whole-index rebuild and the incremental
 * wave cannot drift apart: they run the same sweeps over different file sets.
 *
 * @param root - Absolute path of the repository root.
 * @param configPaths - Repository-relative tsconfig paths to open.
 */
export function analyse(
  root: string,
  configPaths: readonly FilePath[],
): AdapterResult {
  const session = openAnalysis(root)
  try {
    session.openProjects(configPaths)
    const everything = [...session.everyFile()]
    return session.extract({ files: everything })
  } finally {
    session.close()
  }
}

/** The view of the open projects that every extraction reads. */
interface View {
  readonly projects: readonly Project[]
  /** Repository-relative config path of each open project, in the same order. */
  readonly configPaths: readonly FilePath[]
  /** Lower-cased program path to the canonical repository path. */
  readonly repoPathOf: ReadonlyMap<string, FilePath>
  /** Repository path to the program's own spelling of it. */
  readonly programPathOf: ReadonlyMap<FilePath, string>
  /** Every open project that contains a file, in config-path order. */
  readonly ownersOf: ReadonlyMap<FilePath, readonly Project[]>
  readonly filesByProject: ReadonlyMap<FilePath, readonly FilePath[]>
  readonly emptyProjects: readonly FilePath[]
}

/** An open backend the caller drives, with an internal extension for the cold path. */
interface InternalSession extends AnalysisSession {
  /** Every repository file of every open project. The cold path's file set. */
  everyFile(): readonly FilePath[]
}

/**
 * Open a backend and keep it open.
 *
 * Opens one API instance for all projects: the spike measured TypeScript 6
 * exhausting an 8 GB heap on cal.com's 31 projects, where TypeScript 7
 * completes the same work at 2.4 GB.
 *
 * @param root - Absolute path of the repository root.
 */
export function openAnalysis(root: string): InternalSession {
  const api = new API({ cwd: root })
  const opened = new Set<string>()
  const adopted = new Set<string>()
  let view: View | undefined

  /**
   * Rebuild the view from a fresh snapshot.
   *
   * Only `getSourceFileNames` is called per project, never `getSourceFile`: the
   * names arrive in one response (29 ms for cal.com's 76,343) while fetching
   * every file costs 1.2 s. Paying that per file, on demand, is the whole reason
   * a bounded extraction is cheap.
   */
  const refresh = (): View => {
    const snapshot = api.updateSnapshot({
      openProjects: [...opened],
      openFiles: [...adopted],
    })
    const all = snapshot.getProjects()
    if (all.length === 0) {
      // An unrecognised `DocumentIdentifier` shape yields zero projects and no
      // error, so an empty list must be a hard failure rather than an empty index.
      throw new Error(`no projects opened from ${opened.size} tsconfig path(s)`)
    }

    const projects = [...all].sort((a, b) =>
      a.configFileName < b.configFileName
        ? -1
        : a.configFileName > b.configFileName
          ? 1
          : 0,
    )
    const configPaths = projects.map((project) =>
      toRepoPath(root, project.configFileName),
    )
    const repoPathOf = new Map<string, FilePath>()
    const programPathOf = new Map<FilePath, string>()
    const ownersOf = new Map<FilePath, Project[]>()
    const filesByProject = new Map<FilePath, readonly FilePath[]>()

    for (const [index, project] of projects.entries()) {
      const owned: FilePath[] = []
      for (const programPath of project.program.getSourceFileNames()) {
        if (!isRepoFile(programPath)) continue
        const path = toRepoPath(root, programPath)
        repoPathOf.set(programPath.toLowerCase(), path)
        programPathOf.set(path, programPath)
        const owners = ownersOf.get(path)
        if (owners === undefined) {
          // First project wins the canonical claim, and projects are sorted by
          // config path, so the choice is deterministic. A file shared between
          // two projects that contributed its symbols once and its call edges
          // twice would double every edge in it.
          ownersOf.set(path, [project])
          owned.push(path)
        } else {
          owners.push(project)
        }
      }
      owned.sort()
      filesByProject.set(configPaths[index]!, owned)
    }

    view = {
      projects,
      configPaths,
      repoPathOf,
      programPathOf,
      ownersOf,
      filesByProject,
      emptyProjects: projects
        .filter((project) => project.rootFiles.length === 0)
        .map((project) => toRepoPath(root, project.configFileName))
        .sort(),
    }
    return view
  }

  const current = (): View => view ?? refresh()

  /** Add to the open set, and re-snapshot only if it actually grew. */
  const add = (into: Set<string>, values: readonly string[]): void => {
    let grew = false
    for (const value of values) {
      if (into.has(value)) continue
      into.add(value)
      grew = true
    }
    if (grew) view = undefined
  }

  return {
    openProjects(configPaths) {
      add(
        opened,
        configPaths.map((path) => `${root}/${path}`),
      )
    },

    adoptFiles(files) {
      add(
        adopted,
        files.map((path) => `${root}/${path}`),
      )
    },

    everyFile() {
      return [...current().programPathOf.keys()].sort()
    },

    extract(request) {
      return extractFrom(root, current(), request)
    },

    close() {
      api.close()
    },
  }
}

/** One repository file, and the project both sweeps will analyse it in. */
interface OwnedFile {
  /** The program's own path, which is what the checker hands back. */
  readonly programPath: string
  readonly path: FilePath
  readonly sf: SourceFile
  readonly project: Project
  readonly configPath: FilePath
}

/**
 * Which project a file is analysed in.
 *
 * The index's recorded choice wins where that project is open, so a wave agrees
 * with the cold build; otherwise the first open project that contains the file
 * takes it, which is the same rule the cold build applies.
 */
function pickProject(
  view: View,
  path: FilePath,
  canonicalOf: ReadonlyMap<FilePath, FilePath> | undefined,
): Project | undefined {
  const owners = view.ownersOf.get(path)
  if (owners === undefined || owners.length === 0) return undefined
  const recorded = canonicalOf?.get(path)
  if (recorded === undefined) return owners[0]
  for (const [index, project] of view.projects.entries()) {
    if (view.configPaths[index] === recorded && owners.includes(project))
      return project
  }
  return owners[0]
}

/** Run every sweep over one file set, and return the facts they produced. */
function extractFrom(
  root: string,
  view: View,
  request: ExtractRequest,
): AdapterResult {
  const files: OwnedFile[] = []
  const canonicalOf = new Map<FilePath, FilePath>()

  for (const path of [...new Set(request.files)].sort()) {
    const programPath = view.programPathOf.get(path)
    if (programPath === undefined) continue // No open project globs it.
    const project = pickProject(view, path, request.canonicalOf)
    if (!project) continue
    const sf = project.program.getSourceFile(programPath)
    if (!sf) continue
    const configPath = toRepoPath(root, project.configFileName)
    files.push({ programPath, path, sf, project, configPath })
    canonicalOf.set(path, configPath)
  }

  const { nodes, byDeclaration } = sweepSymbols(files)
  const { callEdges, unresolvedCalls } = sweepCallEdges(
    files,
    view,
    byDeclaration,
    request.resolve,
  )

  return {
    filesByProject: view.filesByProject,
    extracted: files.map((file) => file.path),
    canonicalOf,
    symbols: nodes,
    callEdges,
    unresolvedCalls,
    importEdges: sweepImports(files, view),
    exportShapes: sweepExportShapes(files),
    emptyProjects: view.emptyProjects,
  }
}

/** The symbol table, plus the join index the edge sweep resolves against. */
interface SymbolSweep {
  readonly nodes: readonly SymbolNode[]
  /**
   * Program path and declaration offset to `SymbolId`. Alive for one extraction
   * and never persisted: ADR 0002 rejected `(path, offset)` as identity, not as
   * a build-time join.
   */
  readonly byDeclaration: ReadonlyMap<string, SymbolId>
}

function sweepSymbols(files: readonly OwnedFile[]): SymbolSweep {
  const nodes: SymbolNode[] = []
  const byDeclaration = new Map<string, SymbolId>()

  for (const { programPath, path, sf } of files) {
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
  for (const { path, sf, project } of files) {
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
  return byProject
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

  let target = lookup(project, symbol, view, byDeclaration, resolve)
  if (target === undefined) {
    try {
      const aliased = project.checker.getAliasedSymbol(symbol)
      if (aliased)
        target = lookup(project, aliased, view, byDeclaration, resolve)
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

/**
 * Match a checker symbol back to the symbol table through its declarations.
 *
 * The in-memory join covers the files this extraction swept; anything else falls
 * through to the index, which is what lets a wave of three files produce edges
 * into the thousands it did not look at.
 */
function lookup(
  project: Project,
  symbol: CheckerSymbol,
  view: View,
  byDeclaration: ReadonlyMap<string, SymbolId>,
  resolve: DeclarationResolver | undefined,
): SymbolId | undefined {
  for (const declaration of symbol.declarations) {
    const node = declaration.resolve(project)
    if (!node) continue
    const sf = project.program.getSourceFile(declaration.path)
    if (!sf) continue
    const start = node.getStart(sf)
    const hit = byDeclaration.get(declarationKey(declaration.path, start))
    if (hit !== undefined) return hit
    if (resolve === undefined) continue
    const path = view.repoPathOf.get(String(declaration.path).toLowerCase())
    if (path === undefined) continue
    const stored = resolve(path, start)
    if (stored !== undefined) return stored
  }
  return undefined
}

/**
 * Every static module specifier in the given files, resolved to a repository file.
 *
 * There is no module-resolution API to call (microsoft/TypeScript#64069), so the
 * specifier is resolved the only way available: ask the checker for the symbol at
 * the string literal and read the path of the source file it declares.
 *
 * TODO(#25): `import()` and `import x = require()` carry specifiers too, and a
 * dynamic import is how a route or a plugin is loaded, so the wave under-reaches
 * on exactly the files that matter most in a framework repository.
 */
function sweepImports(files: readonly OwnedFile[], view: View): ImportEdge[] {
  const edges: ImportEdge[] = []

  for (const { path, sf, project } of files) {
    const specifiers: StringLiteral[] = []
    const walk = (node: Node): void => {
      if (IMPORTING_DECLARATION.has(node.kind)) {
        // The direct string-literal child is the module specifier. An import
        // attributes clause holds string literals too, but nested, and
        // `forEachChild` is shallow.
        node.forEachChild((child) => {
          if (child.kind === SyntaxKind.StringLiteral)
            specifiers.push(child as StringLiteral)
        })
      }
      node.forEachChild(walk)
    }
    sf.forEachChild(walk)
    if (specifiers.length === 0) continue

    let resolved: (CheckerSymbol | undefined)[]
    try {
      resolved = project.checker.getSymbolAtLocation(specifiers)
    } catch {
      continue // A failed batch loses this file's import edges, never an answer.
    }

    for (const [index, specifier] of specifiers.entries()) {
      const text = specifier.text
      const to = moduleFileOf(resolved[index], view)
      if (to !== undefined) {
        edges.push({ from: path, specifier: text, to })
      } else if (text.startsWith('.')) {
        // A relative specifier that resolves to nothing is a broken import, and
        // the file that would fix it may appear later. Recorded so the wave can
        // re-extract this file when it does.
        edges.push({ from: path, specifier: text, to: null })
      }
    }
  }
  return edges
}

/** The repository file a resolved module symbol declares, if it is one of ours. */
function moduleFileOf(
  symbol: CheckerSymbol | undefined,
  view: View,
): FilePath | undefined {
  for (const declaration of symbol?.declarations ?? []) {
    const path = view.repoPathOf.get(String(declaration.path).toLowerCase())
    if (path !== undefined) return path
  }
  return undefined
}

/** Per file, the hash of its resolved export surface. The wave's whole gate. */
function sweepExportShapes(
  files: readonly OwnedFile[],
): ReadonlyMap<FilePath, string> {
  const shapes = new Map<FilePath, string>()
  for (const { path, sf, project } of files) {
    shapes.set(path, exportShapeOf(project, sf))
  }
  return shapes
}

/**
 * The hash of one file's export surface.
 *
 * Two measured traps, both from ADR 0002. `Symbol.getExports()` is the raw
 * symbol table and returned 1 symbol where `getExportsOfModule` returned 601 on
 * a barrel of 300 `export *` statements, so the checker is asked. And the parts
 * are built from `typeToString`, **never** from `Type.id`: type ids are assigned
 * lazily per snapshot, so an id-based hash always differs for any re-checked
 * file and the wave never terminates — measured at 10 waves and 1,436 of 3,000
 * files for a body-only edit.
 */
function exportShapeOf(project: Project, sf: SourceFile): string {
  const { checker } = project
  let parts: string[]
  try {
    const moduleSymbol = checker.getSymbolAtLocation(sf as unknown as Node)
    if (!moduleSymbol) return '' // Not a module: no export surface to move.
    const exported = checker.getExportsOfModule(moduleSymbol)
    if (exported.length === 0) return ''
    const types = checker.getTypeOfSymbol(exported)
    parts = exported.map((symbol, index) =>
      (symbol.flags & TYPE_ISH) === 0
        ? `${symbol.name}:${describe(checker, types[index])}`
        : declaredShape(checker, symbol),
    )
  } catch {
    // A file whose shape cannot be computed is reported as `''`, which the wave
    // reads as "assume it moved". One extra file re-extracted, never a stale
    // answer.
    return ''
  }
  return createHash('sha256').update(parts.sort().join('|')).digest('hex')
}

/**
 * A type-ish symbol expanded structurally.
 *
 * An interface reports `any` from `getTypeOfSymbol` and a named type prints as
 * its own name, so both hide a member being added. The declared type's
 * properties are what actually move.
 */
function declaredShape(checker: Checker, symbol: CheckerSymbol): string {
  const declared = checker.getDeclaredTypeOfSymbol(symbol)
  const properties = checker.getPropertiesOfType(declared)
  const types = checker.getTypeOfSymbol(properties)
  const members = properties
    .map(
      (property, index) =>
        `${stableName(property.name)}:${describe(checker, types[index])}`,
    )
    .sort()
  return `${symbol.name}<decl>{${members.join(';')}}`
}

/**
 * A member name with any lazily-assigned symbol id stripped out.
 *
 * A member keyed by a unique symbol is named internally as `__@brand@160`, where
 * `160` is a symbol id assigned per snapshot. Left in, that is ADR 0002's
 * `Type.id` trap arriving through the *name* rather than through the type: the
 * hash of cal.com's `packages/types/utils.d.ts` moved between two builds of an
 * identical tree, which propagates a wave for no reason at all. The name is what
 * identifies the member; the number never was.
 */
const stableName = (name: string): string => name.replace(/@\d+$/, '')

const describe = (checker: Checker, type: Type | undefined): string =>
  type === undefined ? '?' : checker.typeToString(type)
