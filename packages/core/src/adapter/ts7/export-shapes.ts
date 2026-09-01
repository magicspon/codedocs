/**
 * The export-shape sweep: per file, a hash of its resolved export surface —
 * the wave's whole gate for deciding whether a change propagates to importers.
 */

import { createHash } from 'node:crypto'

import {
  type Checker,
  type Project,
  SymbolFlags,
  type Symbol as CheckerSymbol,
  type Type,
} from 'typescript/unstable/sync'
import type { Node, SourceFile } from 'typescript/unstable/ast'

import type { FilePath } from '../../model.ts'
import type { OwnedFile } from './types.ts'

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

/** Per file, the hash of its resolved export surface. The wave's whole gate. */
export function sweepExportShapes(
  files: readonly OwnedFile[],
): ReadonlyMap<FilePath, string> {
  const shapes = new Map<FilePath, string>()
  for (const { path, sf, project } of files) {
    shapes.set(path, exportShapeOf(project, sf))
  }
  return shapes
}
