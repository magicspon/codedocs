/**
 * Building a symbol's descriptor path — the dotted name from the file root —
 * and the call-attribution walk that shares its declaration-kind tables.
 *
 * ADR 0002's "descriptor path rather than ordinal" taken literally: every
 * segment is taken from what the author wrote, so it survives a sibling being
 * inserted above it, where an ordinal does not.
 */

import {
  type Node,
  type SourceFile,
  type StringLiteral,
  SyntaxKind,
} from 'typescript/unstable/ast'

import type { CallerAttribution, SymbolKind } from '../../model.ts'
import { nameOf } from './shared.ts'

/**
 * Declaration kinds that become a `Symbol` node and contribute a segment to a
 * qualified name.
 */
export const NAMED_DECLARATION: ReadonlyMap<SyntaxKind, SymbolKind> = new Map([
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

/**
 * Anonymous callables. They declare no name, so they contribute a descriptor
 * segment only through the call they are an argument to.
 */
const ANONYMOUS_FUNCTION: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.ArrowFunction,
  SyntaxKind.FunctionExpression,
])

/**
 * Kinds that introduce a declaration space.
 *
 * Two declarations that claim one id from the *same* space are one symbol, and
 * ADR 0002 collapses them deliberately — overloads, and declaration merging such
 * as a local `type` beside a local `const`. From *different* spaces they are
 * unrelated bindings that happen to share a descriptor path, which is a
 * collision rather than a collapse.
 */
const DECLARATION_SPACE: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.Block,
  SyntaxKind.SourceFile,
  SyntaxKind.ModuleBlock,
  SyntaxKind.CaseClause,
  SyntaxKind.DefaultClause,
  SyntaxKind.CatchClause,
  SyntaxKind.ForStatement,
  SyntaxKind.ForInStatement,
  SyntaxKind.ForOfStatement,
  SyntaxKind.ClassDeclaration,
  SyntaxKind.ClassExpression,
  SyntaxKind.InterfaceDeclaration,
  SyntaxKind.TypeLiteral,
  SyntaxKind.EnumDeclaration,
  SyntaxKind.ObjectLiteralExpression,
])

/**
 * How much of one descriptor segment is kept.
 *
 * A test name is the segment that separates sibling `it(...)` blocks, and it can
 * be a sentence. Uncapped, cal.com's longest id reaches 827 characters; at 96 it
 * reaches 540, and the shortening costs 31 extra colliding declarations out of
 * 48,517. The bytes are the smaller half of that trade — ids are interned by
 * [#29](https://github.com/magicspon/codedocs/issues/29), so an id's length is
 * paid once per symbol rather than once per edge — and readability is the larger.
 */
const SEGMENT_CAP = 96

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

/**
 * Class members that open a scope the author named without declaring a name.
 *
 * A class has exactly one of each, so these are fixed segments rather than
 * ordinals — nothing about them shifts when a member is inserted above. Without
 * them a `const url` in a constructor claims the same id as the `url` property
 * beside it, which is the one way this defect reached a *durable* id.
 */
const UNNAMED_MEMBER: ReadonlyMap<SyntaxKind, string> = new Map([
  [SyntaxKind.Constructor, 'constructor'],
  [SyntaxKind.ClassStaticBlockDeclaration, 'static'],
] as const)

export const isCallable = (node: Node): boolean => {
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

/** One descriptor segment: whitespace collapsed, and bounded by `SEGMENT_CAP`. */
function segment(raw: string): string {
  const flat = raw.replaceAll(/\s+/g, ' ').trim()
  return flat.length > SEGMENT_CAP ? flat.slice(0, SEGMENT_CAP) : flat
}

/**
 * The segment an anonymous callable contributes: the call it is an argument to.
 *
 * `it("rejects an unknown field")` names the scope its callback opens the way
 * the author already named it, and — unlike an ordinal — it survives a sibling
 * block being inserted above it. Without it every `const schema` in a test file
 * claims one id: cal.com's worst was 69 declarations under
 * `getBookingResponsesSchema.test.ts#schema`.
 *
 * The first string-literal argument is what separates siblings, so a call
 * without one yields `map()` and separates nothing. That is a collision this
 * cannot resolve, and `sweepSymbols` reports it rather than hiding it.
 */
function callSegment(fn: Node, sf: SourceFile): string | undefined {
  const call = fn.parent
  if (call === undefined || call.kind !== SyntaxKind.CallExpression) return
  const { expression, arguments: args } = call as Node & {
    readonly expression?: Node
    readonly arguments?: readonly Node[]
  }
  // The callee is not an argument: `(() => {})()` names no scope.
  if (expression === undefined || expression === fn) return
  const callee = segment(expression.getText(sf))
  for (const arg of args ?? []) {
    if (
      arg.kind === SyntaxKind.StringLiteral ||
      arg.kind === SyntaxKind.NoSubstitutionTemplateLiteral
    ) {
      return `${callee}("${segment((arg as StringLiteral).text)}")`
    }
  }
  return `${callee}()`
}

/** The segment one node contributes to a descriptor path, if any. */
function segmentOf(node: Node, sf: SourceFile): string | undefined {
  const name = nameOf(node)
  if (name !== undefined && NAMED_DECLARATION.has(node.kind)) return name
  // An object-literal key is the author's own name for the scope beneath it,
  // and it is what tells six sibling arrow functions that each declare a
  // `field` apart.
  if (node.kind === SyntaxKind.PropertyAssignment) return name
  const member = UNNAMED_MEMBER.get(node.kind)
  if (member !== undefined) return member
  if (ANONYMOUS_FUNCTION.has(node.kind)) return callSegment(node, sf)
  return undefined
}

/**
 * The dotted descriptor path from the file root, e.g. `AuthService.login`.
 *
 * Every scope between the file and the declaration contributes a segment taken
 * from what the author wrote — a declared name, an object-literal key, or the
 * call an anonymous callback is an argument to. This is ADR 0002's "descriptor
 * path rather than ordinal" taken literally: a segment derived from content
 * survives a sibling being inserted above it, where an ordinal does not.
 */
export function descriptorPath(node: Node, sf: SourceFile): string {
  const parts: string[] = []
  let current: Node | undefined = node
  while (current) {
    // A declaration contributes its own name; only ancestors contribute the
    // scope segments, so the subject is never named twice.
    const part = current === node ? nameOf(current) : segmentOf(current, sf)
    if (part !== undefined) parts.unshift(part)
    current = current.parent
  }
  return parts.join('.')
}

/** The declaration space a node sits in — its identity, not its kind. */
export function declarationSpace(node: Node): Node | undefined {
  let current: Node | undefined = node.parent
  while (current) {
    if (DECLARATION_SPACE.has(current.kind)) return current
    current = current.parent
  }
  return undefined
}

/**
 * Whether an id may be relied on to mean the same thing after an edit.
 *
 * A symbol declared inside a function body is not durable: nothing above it in
 * the index may anchor to one. They are still indexed — 25 of the Next.js
 * fixture's 175 call edges are calls to local bindings, and dropping 14% of a
 * repository's call graph is not an edge case.
 */
export function isDurable(node: Node): boolean {
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
export function attribute(node: Node): {
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
