/**
 * The `SymbolId` scheme: ADR 0002's normalised SCIP symbol string, and the
 * shorthand ADR 0005 projects out of it.
 *
 * A `SymbolId` is a [SCIP](https://github.com/scip-code/scip) symbol string —
 * `<scheme> ' ' <manager> ' ' <package> ' ' <version> ' ' <descriptors>` — in
 * codedocs' own scheme, with ADR 0002's two normalisations:
 *
 * 1. **The version is a placeholder for a workspace package.** A routine
 *    `version` bump would otherwise invalidate every symbol in a package and
 *    every cross-package reference to it. A third-party symbol keeps its real
 *    version, where it carries information.
 * 2. **Locals are named by descriptor path rather than by ordinal.** SCIP's
 *    `local N` fixes uniqueness but not stability — the ordinal still shifts
 *    when a binding is inserted above it. What names a scope is
 *    `adapter/ts7/descriptors.ts`'s decision; this module only encodes it.
 *
 * **The file is one backtick-escaped namespace descriptor**, rather than one per
 * path segment. Splitting the path would make the file boundary a guess — a
 * `declare module "foo/bar"` is a namespace descriptor whose name needs escaping
 * too, so no rule over the leading run separates the path from what follows it.
 * One descriptor makes `parseSymbolId` total, which ADR 0006 needs of it, and
 * the containment ADR 0002 refuses to store a second time is encoded either way.
 *
 * A `File` keeps the repository-relative path as its identity, per ADR 0002's
 * node table, so only a `Symbol` is ever a SCIP string. `CallSource` is either.
 */

import type { CallSource, FilePath, SymbolId, SymbolKind } from './model.ts'

/** codedocs' own SCIP scheme. Also what tells a `SymbolId` from a shorthand. */
const SCHEME = 'codedocs'

/**
 * The `<version>` every workspace package's symbols carry.
 *
 * SCIP's own convention for a field that carries no information, and here it
 * carries none deliberately: ADR 0002 normalises it away so a `version` bump in
 * a manifest cannot invalidate an index.
 */
export const WORKSPACE_VERSION = '.'

/** The `<package>` of a file no manifest above it names. Same convention. */
export const ABSENT_PACKAGE = '.'

/** The one manager codedocs resolves through. */
export const NPM = 'npm'

/** SCIP's `<package>` field: the three parts that name where a symbol lives. */
export interface PackageRef {
  readonly manager: string
  readonly name: string
  readonly version: string
}

/**
 * The coarse class of a symbol, from its descriptor suffix.
 *
 * ADR 0002 keeps a symbol's kind at two grains: this one is **derived, never
 * stored**, and the fine `SymbolKind` is the stored `syntactic` attribute.
 */
export type DescriptorClass = 'namespace' | 'type' | 'term' | 'method'

/** One descriptor: the name the author wrote, and what kind of thing it names. */
interface Descriptor {
  readonly name: string
  readonly class: DescriptorClass
}

/** What a `SymbolId` says, once read back. */
export interface SymbolParts {
  readonly package: PackageRef
  /** The repository-relative path of the file the symbol is declared in. */
  readonly file: FilePath
  /** The descriptors below the file, which is what the store interns. */
  readonly descriptors: string
}

/**
 * The descriptor class a stored `SymbolKind` encodes.
 *
 * Driven by the declaration's kind alone, never by its initialiser: `const f =
 * () => {}` is a `term` like every other `const`, because reading the
 * initialiser would make `const f = memo(() => {})` a rename of `f` — an id
 * churning on a body-only edit is the defect ADR 0002 rejected offsets for.
 */
const CLASS_OF_KIND: Readonly<Record<SymbolKind, DescriptorClass>> = {
  function: 'method',
  method: 'method',
  class: 'type',
  interface: 'type',
  typeAlias: 'type',
  enum: 'type',
  variable: 'term',
  namespace: 'namespace',
}

/** The suffix each class writes. A method's disambiguator is always empty: overloads collapse. */
const SUFFIX: Readonly<Record<DescriptorClass, string>> = {
  namespace: '/',
  type: '#',
  term: '.',
  method: '().',
}

/** SCIP's simple identifier: everything else is backtick-escaped. */
const SIMPLE = /^[\w$+-]+$/

export const classOfKind = (kind: SymbolKind): DescriptorClass =>
  CLASS_OF_KIND[kind]

/** One descriptor, escaped as the grammar requires. */
export function descriptor(name: string, held: DescriptorClass): string {
  const escaped = SIMPLE.test(name) ? name : `\`${name.replaceAll('`', '``')}\``
  return `${escaped}${SUFFIX[held]}`
}

/** Whether a string is a `SymbolId` rather than a shorthand or a `FilePath`. */
export const isSymbolId = (value: string): boolean =>
  value.startsWith(`${SCHEME} `)

/**
 * Build the `SymbolId` for a symbol declared in `file` at `descriptors`.
 *
 * @param descriptors - The descriptor text below the file, already encoded.
 */
export function symbolId(
  held: PackageRef,
  file: FilePath,
  descriptors: string,
): SymbolId {
  const where = descriptor(file, 'namespace')
  return `${SCHEME} ${held.manager} ${held.name} ${held.version} ${where}${descriptors}`
}

/**
 * Read a `SymbolId` back, or `undefined` if it is not one.
 *
 * Total over its own output, which is what ADR 0006's third input form needs: a
 * full id pasted back from `--json` has to find the same symbol the id was built
 * from, and the store holds the file and the descriptors apart.
 */
export function parseSymbolId(id: string): SymbolParts | undefined {
  if (!isSymbolId(id)) return undefined
  const fields = splitFields(id, 5)
  if (fields === undefined) return undefined
  const [, manager, name, version, rest] = fields as [
    string,
    string,
    string,
    string,
    string,
  ]
  const at = readDescriptor(rest, 0)
  // The first descriptor is the file, always, and it is a namespace.
  if (at === undefined || at.descriptor.class !== 'namespace') return undefined
  return {
    package: { manager, name, version },
    file: at.descriptor.name,
    descriptors: rest.slice(at.end),
  }
}

/** Every descriptor below the file, or `undefined` if the text is not descriptors. */
function parseDescriptors(text: string): Descriptor[] | undefined {
  const found: Descriptor[] = []
  let at = 0
  while (at < text.length) {
    const read = readDescriptor(text, at)
    if (read === undefined) return undefined
    found.push(read.descriptor)
    at = read.end
  }
  return found
}

/**
 * The file a `CallSource` names.
 *
 * A `Symbol` carries its file in its id and a `File` is its own path, so this
 * answers for both — which is what the label lookups every operation scopes
 * through need, since a label is filed against the file.
 */
export function fileOf(id: CallSource): FilePath {
  return parseSymbolId(id)?.file ?? id
}

/**
 * ADR 0005's shorthand: `src/auth/service.ts#AuthService.login`.
 *
 * A **projection of the id, not a second anchor** — the descriptor path with its
 * suffixes taken off. It is what both renderers print and what a document
 * anchors to, because nobody will type a SCIP string into a paragraph.
 */
export function shorthandOf(id: CallSource): string {
  const parts = parseSymbolId(id)
  if (parts === undefined) return id
  const dotted = dottedOf(parts.descriptors)
  return dotted === '' ? parts.file : `${parts.file}#${dotted}`
}

/** The dotted descriptor path a descriptor string projects to. */
export function dottedOf(descriptors: string): string {
  return (parseDescriptors(descriptors) ?? []).map((one) => one.name).join('.')
}

/**
 * The coarse class of the symbol a `SymbolId` names, or `undefined` for a file.
 *
 * Derived on demand and stored nowhere, per ADR 0002. The last descriptor is the
 * symbol; the ones before it are the scopes it sits in.
 */
export function coarseClassOf(id: CallSource): DescriptorClass | undefined {
  const parts = parseSymbolId(id)
  if (parts === undefined) return undefined
  return parseDescriptors(parts.descriptors)?.at(-1)?.class
}

/**
 * Split a shorthand into its path and its dotted descriptor path.
 *
 * On the first `#`: a descriptor path may contain one inside a string literal, a
 * repository path may not. A subject with no `#` is a bare name, which is
 * `resolveSubject`'s second form and has no path at all.
 */
export function splitShorthand(subject: string): [FilePath, string] {
  const at = subject.indexOf('#')
  return at === -1
    ? [subject, '']
    : [subject.slice(0, at), subject.slice(at + 1)]
}

/**
 * The first `count` space-separated fields, the last of which is the remainder.
 *
 * SCIP escapes a space inside a field by doubling it. None of codedocs' first
 * four fields can hold one — an npm package name and a semver range both forbid
 * it — so this only has to *read* the escape, never write it.
 */
function splitFields(text: string, count: number): string[] | undefined {
  const fields: string[] = []
  let held = ''
  let at = 0
  while (at < text.length) {
    if (fields.length === count - 1) break
    const character = text[at]!
    if (character !== ' ') {
      held += character
      at += 1
      continue
    }
    if (text[at + 1] === ' ') {
      held += ' '
      at += 2
      continue
    }
    fields.push(held)
    held = ''
    at += 1
  }
  if (fields.length !== count - 1) return undefined
  fields.push(text.slice(at))
  return fields
}

/** One descriptor read from `text` at `at`, and where it ended. */
function readDescriptor(
  text: string,
  at: number,
): { descriptor: Descriptor; end: number } | undefined {
  const read =
    text[at] === '`' ? readEscapedName(text, at) : readSimpleName(text, at)
  if (read === undefined) return undefined
  const { name, end } = read
  if (text.startsWith('().', end)) {
    return { descriptor: { name, class: 'method' }, end: end + 3 }
  }
  const suffix = text[end]
  const held =
    suffix === '/'
      ? 'namespace'
      : suffix === '#'
        ? 'type'
        : suffix === '.'
          ? 'term'
          : undefined
  if (held === undefined) return undefined
  return { descriptor: { name, class: held }, end: end + 1 }
}

function readSimpleName(
  text: string,
  at: number,
): { name: string; end: number } | undefined {
  let end = at
  while (end < text.length && SIMPLE.test(text[end]!)) end += 1
  return end === at ? undefined : { name: text.slice(at, end), end }
}

/** A backtick-escaped name, in which a literal backtick is written twice. */
function readEscapedName(
  text: string,
  at: number,
): { name: string; end: number } | undefined {
  let name = ''
  let end = at + 1
  while (end < text.length) {
    if (text[end] !== '`') {
      name += text[end]
      end += 1
      continue
    }
    if (text[end + 1] === '`') {
      name += '`'
      end += 2
      continue
    }
    return { name, end: end + 1 }
  }
  return undefined // Unterminated: not a descriptor.
}
