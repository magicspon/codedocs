/**
 * Which package a file belongs to, which is the `<package>` field of every
 * `SymbolId` built from it.
 *
 * The nearest `package.json` at or above the file names it, and the version is
 * discarded rather than read: ADR 0002 normalises a workspace version away, so
 * the manifest is consulted for one string. A file no manifest above it names
 * gets SCIP's absent-value placeholder, which is the honest answer for a
 * repository with no manifest at its root.
 */

import { join } from 'node:path'

import type { FilePath, SymbolId } from './model.ts'
import { readJsonc, upward } from './preflight/fs.ts'
import {
  ABSENT_PACKAGE,
  NPM,
  symbolId,
  WORKSPACE_VERSION,
  type PackageRef,
} from './symbol-id.ts'

/** Builds `SymbolId`s for one working tree, memoised over its directories. */
export interface Naming {
  /** The package a repository-relative file belongs to. */
  packageOf(file: FilePath): PackageRef
  /** The id of the symbol declared in `file` at `descriptors`. */
  idOf(file: FilePath, descriptors: string): SymbolId
}

/**
 * Name symbols against the manifests in `root`.
 *
 * @param root - Absolute path of the repository root, which bounds the walk.
 *
 * Memoised per directory rather than per file: a package has hundreds of files
 * and one manifest, so a cold build of cal.com reads 34 of them however many
 * times it asks.
 */
export function namingFor(root: string): Naming {
  const byDirectory = new Map<string, PackageRef>()
  const byFile = new Map<FilePath, string>()

  const packageOf = (file: FilePath): PackageRef => {
    const at = file.lastIndexOf('/')
    const directory = at === -1 ? '' : file.slice(0, at)
    const held = byDirectory.get(directory)
    if (held !== undefined) return held
    const found = {
      manager: NPM,
      name: declaredName(root, join(root, directory)) ?? ABSENT_PACKAGE,
      version: WORKSPACE_VERSION,
    }
    byDirectory.set(directory, found)
    return found
  }

  /**
   * Everything an id holds before its descriptors, cached per file.
   *
   * Every read that returns an id builds one per row — a `callers` answer over a
   * 1,038-edge hub asks 2,076 times — and none of it varies with the symbol.
   */
  const prefixOf = (file: FilePath): string => {
    const held = byFile.get(file)
    if (held !== undefined) return held
    const found = symbolId(packageOf(file), file, '')
    byFile.set(file, found)
    return found
  }

  return {
    packageOf,
    idOf: (file, descriptors) => `${prefixOf(file)}${descriptors}`,
  }
}

/** The `name` of the nearest manifest at or above `from`, if it declares one. */
function declaredName(root: string, from: string): string | undefined {
  return upward(root, from, (directory) => {
    const manifest = readJsonc(join(directory, 'package.json'))
    if (manifest === undefined) return undefined
    const name = manifest['name']
    // A manifest with no `name` still stops the walk: it is a package boundary
    // whether or not it is a published one, and borrowing the name of the
    // package above it would put a file in a package that does not hold it.
    return typeof name === 'string' && name !== '' ? name : ABSENT_PACKAGE
  })
}
