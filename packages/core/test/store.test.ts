/**
 * What the index's shape promises, as opposed to what it holds.
 *
 * Interning made two things load-bearing that were free while every column was
 * text: the position of each closed enum, and the round trip from a `SymbolId`
 * to a pair of rows and back. Both fail silently — a reordered enum relabels
 * stored rows, a broken split returns the wrong symbol — so both are pinned.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type {
  CallEdge,
  CallSite,
  ReferenceEdge,
  SymbolNode,
} from '../src/model.ts'
import { symbolId, WORKSPACE_VERSION } from '../src/symbol-id.ts'
import {
  ENUM_CODES,
  openStore,
  readCalleesOf,
  readCalleeSteps,
  readCallersOf,
  readSymbol,
  readSymbolIdAt,
  readSymbols,
  beginAnalysis,
  commitProject,
  type Store,
} from '../src/store/index.ts'

describe('the stored enum codes', () => {
  /**
   * The index holds a position, not a name. Appending a variant is safe and
   * reordering one is not, so this is a snapshot of the order rather than a set
   * comparison: a new variant fails here and is fixed by adding it to the end.
   */
  it('are the order the index was written with', () => {
    expect(ENUM_CODES).toEqual({
      kind: [
        'function',
        'class',
        'interface',
        'typeAlias',
        'enum',
        'variable',
        'method',
        'namespace',
      ],
      attribution: ['symbol', 'variable', 'file'],
      provenance: ['deterministic', 'syntactic', 'inferred'],
      derivation: [
        'checker-signature',
        'checker-base-types',
        'heritage-clause',
        'jsx-element-rule',
        'shared-method-name',
        'manifest',
        'resolver',
        'user-config',
        'git-untracked',
        'generated-header',
        'codegen-path',
        'path-convention',
        'tsconfig-exclude',
        'default',
        'content-hash',
        'path-prefix-rewrite',
        'git-rename',
        'shape-hash',
        'descriptor-suffix',
        'declared-name',
        'name-in-head',
        'call-site-overlap',
      ],
      cause: ['external', 'unresolvable', 'dynamic'],
      referenceKind: ['references', 'extends', 'implements', 'typeReferences'],
      labelAxis: ['role', 'authorship'],
      labelValue: ['source', 'test', 'config', 'authored', 'generated'],
      fidelity: ['typed', 'syntactic'],
      preconditionCause: [
        'unprepared',
        'missing-generated',
        'unmapped',
        'broken',
      ],
    })
  })
})

describe('interned ids', () => {
  let root: string
  let store: Store

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'codedocs-store-'))
    writeFileSync(join(root, 'package.json'), '{"name":"fixture"}\n')
    store = openStore(root)
    beginAnalysis(store, {
      seenFiles: WRITE.seenFiles,
      filesByProject: WRITE.filesByProject,
      header: WRITE.header,
    })
    commitProject(store, {
      project: WRITE.projects[0]!,
      files: WRITE.files,
      exportShapes: WRITE.exportShapes,
      symbols: WRITE.symbols,
      declarations: WRITE.declarations,
      callEdges: WRITE.callEdges,
      referenceEdges: WRITE.referenceEdges,
      unresolvedCalls: WRITE.unresolvedCalls,
      importEdges: WRITE.importEdges,
      unresolvedSpecifiers: WRITE.unresolvedSpecifiers,
    })
  })

  afterEach(() => {
    store.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('rebuild the SymbolId every symbol was written with', () => {
    expect(readSymbols(store).map((node) => node.id)).toEqual([
      'codedocs npm fixture . `src/a.ts`/alpha().',
      'codedocs npm fixture . `src/a.ts`/alpha().inner().',
      'codedocs npm fixture . `src/b.ts`/`describe("a#b`` c")`().gamma().',
      'codedocs npm fixture . `src/b.ts`/beta().',
    ])
  })

  it('round-trip a descriptor name the grammar has to escape', () => {
    // A descriptor segment picks up a string literal verbatim, so it may hold a
    // `#`, a space, a quote — and a backtick, which is the one character the
    // escape itself has to write twice.
    const id = ID('src/b.ts', '`describe("a#b`` c")`().gamma().')
    const found = readSymbol(store, id)
    expect(found?.qualified).toBe('describe("a#b` c").gamma')
    expect(found?.file).toBe('src/b.ts')
  })

  it('answer for an id the index has never seen', () => {
    const missing = ID('src/nowhere.ts', 'missing().')
    expect(readSymbol(store, missing)).toBeUndefined()
    expect(readCallersOf(store, missing)).toEqual([])
    expect(readCalleesOf(store, missing)).toEqual([])
    expect(readSymbolIdAt(store, 'src/nowhere.ts', 0)).toBeUndefined()
  })

  it('name a file-attributed source by its path alone', () => {
    // A module-level call is credited to the file, which is the node whose
    // descriptor path is empty — so its id is the path with no `#`.
    const edges = readCallersOf(store, ID('src/a.ts', 'alpha().'))
    // Sorted by the source id, and a `SymbolId` begins with the scheme, so a
    // symbol source now sorts ahead of the file that is only ever a path.
    expect(edges.map((edge) => [edge.from, edge.attribution])).toEqual([
      [ID('src/b.ts', 'beta().'), 'symbol'],
      ['src/b.ts', 'file'],
    ])
  })

  it('group a batched walk by the source id rather than the atom', () => {
    const beta = ID('src/b.ts', 'beta().')
    const steps = readCalleeSteps(store, [beta, 'src/b.ts'])
    expect([...steps.keys()].sort()).toEqual([beta, 'src/b.ts'].sort())
    expect(steps.get(beta)).toEqual([
      { to: ID('src/a.ts', 'alpha().'), sites: [SITE('src/b.ts', 9)] },
    ])
  })

  it('find a symbol by the offset it was declared at', () => {
    expect(readSymbolIdAt(store, 'src/a.ts', 42)).toBe(
      ID('src/a.ts', 'alpha().inner().'),
    )
  })

  it('find it by an offset its own row cannot carry', () => {
    // ADR 0002 collapses overloads and declaration merging into one symbol, so
    // the row holds one offset and the others are stored beside it. Without
    // them, a call landing on the second overload resolves in memory and nowhere
    // else — which is 20 of `microsoft/vscode`'s edges once a build stops
    // holding every project at once.
    expect(readSymbolIdAt(store, 'src/a.ts', 0)).toBe(
      ID('src/a.ts', 'alpha().'),
    )
    expect(readSymbolIdAt(store, 'src/a.ts', 21)).toBe(
      ID('src/a.ts', 'alpha().'),
    )
    expect(readSymbolIdAt(store, 'src/a.ts', 22)).toBeUndefined()
  })
})

const SITE = (file: string, line: number): CallSite => ({
  attribution: 'symbol',
  file,
  line,
  provenance: 'deterministic',
  derivation: 'checker-signature',
})

/**
 * A `SymbolId` in the fixture's own package, which is what `package.json` at the
 * temp root names.
 */
const ID = (file: string, descriptors: string): string =>
  symbolId(
    { manager: 'npm', name: 'fixture', version: WORKSPACE_VERSION },
    file,
    descriptors,
  )

const node = (
  file: string,
  descriptors: string,
  qualified: string,
  start: number,
): SymbolNode => ({
  id: ID(file, descriptors),
  name: qualified.split('.').at(-1) ?? qualified,
  qualified,
  kind: 'function',
  file,
  start,
  line: 1,
  durable: true,
  callable: true,
  collisions: 0,
})

const edge = (
  from: string,
  to: string,
  attribution: CallEdge['attribution'],
  line: number,
): CallEdge => ({
  from,
  to,
  attribution,
  file: 'src/b.ts',
  line,
  provenance: 'deterministic',
  derivation: 'checker-signature',
})

const reference = (
  from: string,
  to: string,
  kind: ReferenceEdge['kind'],
  line: number,
): ReferenceEdge => ({
  from,
  to,
  kind,
  attribution: 'symbol',
  file: 'src/b.ts',
  line,
  provenance: 'deterministic',
  derivation: kind === 'references' ? 'checker-signature' : 'heritage-clause',
})

/** One hand-built analysis, small enough that every row above is nameable. */
const WRITE = {
  projects: [
    {
      configPath: 'tsconfig.json',
      fidelity: 'typed' as const,
      rootFileCount: 2,
      analysedAt: '2026-01-01T00:00:00.000Z',
      fingerprint: 'fingerprint',
      cause: null,
      postinstall: false,
    },
  ],
  unresolvedSpecifiers: [
    {
      file: 'src/a.ts',
      specifier: '@calcom/prisma/enums',
      line: 1,
      cause: 'missing-generated' as const,
    },
  ],
  files: [
    { path: 'src/a.ts', contentHash: 'a', size: 1, mtimeMs: 0 },
    { path: 'src/b.ts', contentHash: 'b', size: 1, mtimeMs: 0 },
  ],
  exportShapes: new Map([
    ['src/a.ts', 'sa'],
    ['src/b.ts', 'sb'],
  ]),
  seenFiles: ['src/a.ts', 'src/b.ts'],
  filesByProject: new Map([['tsconfig.json', ['src/a.ts', 'src/b.ts']]]),
  symbols: [
    node('src/a.ts', 'alpha().', 'alpha', 0),
    node('src/a.ts', 'alpha().inner().', 'alpha.inner', 42),
    node('src/b.ts', 'beta().', 'beta', 0),
    // A descriptor name with a `#` and a backtick in it, which is what the
    // escape exists for: a `describe` title is taken from the source verbatim.
    node(
      'src/b.ts',
      '`describe("a#b`` c")`().gamma().',
      'describe("a#b` c").gamma',
      7,
    ),
  ],
  /** `alpha` is declared twice — an overload — and the row keeps the first offset. */
  declarations: [
    { file: 'src/a.ts', start: 21, id: ID('src/a.ts', 'alpha().') },
  ],
  callEdges: [
    edge(ID('src/b.ts', 'beta().'), ID('src/a.ts', 'alpha().'), 'symbol', 9),
    edge('src/b.ts', ID('src/a.ts', 'alpha().'), 'file', 3),
  ],
  /** The same pair named without being called, which is a separate fact. */
  referenceEdges: [
    reference(
      ID('src/b.ts', 'beta().'),
      ID('src/a.ts', 'alpha().'),
      'typeReferences',
      11,
    ),
  ],
  unresolvedCalls: [
    { file: 'src/b.ts', line: 4, cause: 'external' as const, name: 'fetch' },
  ],
  importEdges: [
    { from: 'src/b.ts', specifier: './a.ts', to: 'src/a.ts' },
    { from: 'src/b.ts', specifier: './gone.ts', to: null },
  ],
  header: {
    commit: null,
    analysedAt: '2026-01-01T00:00:00.000Z',
    toolVersion: '0.0.0',
    typescriptVersion: '7.0.0',
    classifyHash: '',
  },
}
