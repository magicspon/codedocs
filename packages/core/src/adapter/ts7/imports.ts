/**
 * The import sweep: every static module specifier, resolved to a repository
 * file in one checker batch per file.
 *
 * There is no module-resolution API to call (microsoft/TypeScript#64069), so a
 * specifier is resolved the only way available: ask the checker for the symbol
 * at the string literal and read the path of the source file it declares.
 */

import type { Symbol as CheckerSymbol } from 'typescript/unstable/sync'
import {
  type CallExpression,
  type ExternalModuleReference,
  type ImportEqualsDeclaration,
  type ImportTypeNode,
  type LiteralTypeNode,
  type Node,
  type StringLiteral,
  SyntaxKind,
} from 'typescript/unstable/ast'

import type { FilePath, ImportEdge, SpecifierSite } from '../../model.ts'
import { lineOf } from './shared.ts'
import type { OwnedFile, View } from './types.ts'

/**
 * The specifier of `import('./route.ts')`, or `undefined`.
 *
 * The keyword in the callee position is what separates it from every other
 * one-argument call, so a `require`-shaped helper of the repository's own cannot
 * be mistaken for one.
 */
function dynamicSpecifier(node: CallExpression): StringLiteral | undefined {
  if (node.expression.kind !== SyntaxKind.ImportKeyword) return undefined
  const first = node.arguments[0]
  return first?.kind === SyntaxKind.StringLiteral
    ? (first as StringLiteral)
    : undefined
}

/**
 * The specifier of `import x = require('./y')`, or `undefined`.
 *
 * The literal sits a level below what `forEachChild` reaches, inside the
 * external module reference.
 */
function requiredSpecifier(
  node: ImportEqualsDeclaration,
): StringLiteral | undefined {
  const reference = node.moduleReference
  if (reference.kind !== SyntaxKind.ExternalModuleReference) return undefined
  const expression = (reference as ExternalModuleReference).expression
  return expression.kind === SyntaxKind.StringLiteral
    ? (expression as StringLiteral)
    : undefined
}

/**
 * The specifier of `import('./y').Thing` in a type position, or `undefined`.
 *
 * It reaches the same module and moves with the same export shape, so leaving it
 * out would make a type-only dependency invisible to the wave.
 */
function typePositionSpecifier(
  node: ImportTypeNode,
): StringLiteral | undefined {
  const argument = node.argument
  if (argument.kind !== SyntaxKind.LiteralType) return undefined
  const literal = (argument as LiteralTypeNode).literal
  return literal.kind === SyntaxKind.StringLiteral
    ? (literal as StringLiteral)
    : undefined
}

/**
 * The module specifiers one node carries, appended to `into`.
 *
 * Five syntactic forms reach a module and only two of them are a declaration
 * with the literal as a direct child. `import()` is the one that matters most:
 * it is how a route, a plugin or a lazily loaded component is reached, so a
 * sweep that saw only static imports under-reached on exactly the files a
 * framework repository is made of.
 *
 * A specifier that is not a literal — `import(path)`, a template — names no file
 * anyone can know statically, and is left to the call sweep, which already
 * records the site with cause `dynamic`.
 */
function collectSpecifiers(node: Node, into: StringLiteral[]): void {
  const push = (found: StringLiteral | undefined): void => {
    if (found !== undefined) into.push(found)
  }
  switch (node.kind) {
    case SyntaxKind.ImportDeclaration:
    case SyntaxKind.ExportDeclaration:
      // The direct string-literal child is the module specifier. An import
      // attributes clause holds string literals too, but nested, and
      // `forEachChild` is shallow.
      return node.forEachChild((child) => {
        if (child.kind === SyntaxKind.StringLiteral)
          into.push(child as StringLiteral)
      })
    case SyntaxKind.CallExpression:
      return push(dynamicSpecifier(node as CallExpression))
    case SyntaxKind.ImportEqualsDeclaration:
      return push(requiredSpecifier(node as ImportEqualsDeclaration))
    case SyntaxKind.ImportType:
      return push(typePositionSpecifier(node as ImportTypeNode))
    default:
      return
  }
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

/** One file's specifiers, resolved in a single batch and sorted into the two lists. */
function sweepFileImports(
  { path, sf, project }: OwnedFile,
  view: View,
  edges: ImportEdge[],
  unresolved: SpecifierSite[],
): void {
  const specifiers: StringLiteral[] = []
  const walk = (node: Node): void => {
    collectSpecifiers(node, specifiers)
    node.forEachChild(walk)
  }
  sf.forEachChild(walk)
  if (specifiers.length === 0) return

  let resolved: (CheckerSymbol | undefined)[]
  try {
    resolved = project.checker.getSymbolAtLocation(specifiers)
  } catch {
    return // A failed batch loses this file's import edges, never an answer.
  }

  for (const [index, specifier] of specifiers.entries()) {
    const text = specifier.text
    const symbol = resolved[index]
    const to = moduleFileOf(symbol, view)
    if (to !== undefined) {
      edges.push({ from: path, specifier: text, to })
      continue
    }
    // A relative specifier that resolves to nothing is an import the wave has to
    // watch: the file that would complete it may appear later.
    if (text.startsWith('.')) {
      edges.push({ from: path, specifier: text, to: null })
    }
    // A symbol with declarations outside the repository is a package that
    // resolved perfectly well; only a specifier the checker found nothing at all
    // for is signal 4.
    if (symbol === undefined) {
      unresolved.push({
        file: path,
        specifier: text,
        line: lineOf(sf, specifier.getStart(sf)),
      })
    }
  }
}

/**
 * Every static module specifier in the given files, resolved to a repository file.
 *
 * Every form goes into one batch per file, because the batch is the whole
 * reason this is affordable.
 */
export function sweepImports(
  files: readonly OwnedFile[],
  view: View,
): { edges: ImportEdge[]; unresolved: SpecifierSite[] } {
  const edges: ImportEdge[] = []
  const unresolved: SpecifierSite[] = []
  for (const file of files) {
    sweepFileImports(file, view, edges, unresolved)
  }
  return { edges, unresolved }
}
