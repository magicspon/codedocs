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

import type { CallEdge, CallSite, SymbolNode } from '../src/model.ts'
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
} from '../src/store.ts'

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
      ],
      cause: ['external', 'unresolvable', 'dynamic'],
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
      unresolvedCalls: WRITE.unresolvedCalls,
      importEdges: WRITE.importEdges,
    })
  })

  afterEach(() => {
    store.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('rebuild the SymbolId every symbol was written with', () => {
    expect(readSymbols(store).map((node) => node.id)).toEqual([
      'src/a.ts#alpha',
      'src/a.ts#alpha.inner',
      'src/b.ts#beta',
      'src/b.ts#describe("a#b").gamma',
    ])
  })

  it('round-trip a descriptor path that contains a hash of its own', () => {
    // A descriptor path picks up a string literal verbatim, so the split has to
    // be on the first `#` — a repository path has none, a `describe` title may.
    const found = readSymbol(store, 'src/b.ts#describe("a#b").gamma')
    expect(found?.qualified).toBe('describe("a#b").gamma')
    expect(found?.file).toBe('src/b.ts')
  })

  it('answer for an id the index has never seen', () => {
    expect(readSymbol(store, 'src/nowhere.ts#missing')).toBeUndefined()
    expect(readCallersOf(store, 'src/nowhere.ts#missing')).toEqual([])
    expect(readCalleesOf(store, 'src/nowhere.ts#missing')).toEqual([])
    expect(readSymbolIdAt(store, 'src/nowhere.ts', 0)).toBeUndefined()
  })

  it('name a file-attributed source by its path alone', () => {
    // A module-level call is credited to the file, which is the node whose
    // descriptor path is empty — so its id is the path with no `#`.
    const edges = readCallersOf(store, 'src/a.ts#alpha')
    expect(edges.map((edge) => [edge.from, edge.attribution])).toEqual([
      ['src/b.ts', 'file'],
      ['src/b.ts#beta', 'symbol'],
    ])
  })

  it('group a batched walk by the source id rather than the atom', () => {
    const steps = readCalleeSteps(store, ['src/b.ts#beta', 'src/b.ts'])
    expect([...steps.keys()].sort()).toEqual(['src/b.ts', 'src/b.ts#beta'])
    expect(steps.get('src/b.ts#beta')).toEqual([
      { to: 'src/a.ts#alpha', sites: [SITE('src/b.ts', 9)] },
    ])
  })

  it('find a symbol by the offset it was declared at', () => {
    expect(readSymbolIdAt(store, 'src/a.ts', 42)).toBe('src/a.ts#alpha.inner')
  })

  it('find it by an offset its own row cannot carry', () => {
    // ADR 0002 collapses overloads and declaration merging into one symbol, so
    // the row holds one offset and the others are stored beside it. Without
    // them, a call landing on the second overload resolves in memory and nowhere
    // else — which is 20 of `microsoft/vscode`'s edges once a build stops
    // holding every project at once.
    expect(readSymbolIdAt(store, 'src/a.ts', 0)).toBe('src/a.ts#alpha')
    expect(readSymbolIdAt(store, 'src/a.ts', 21)).toBe('src/a.ts#alpha')
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

const node = (
  id: string,
  file: string,
  qualified: string,
  start: number,
): SymbolNode => ({
  id,
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
    node('src/a.ts#alpha', 'src/a.ts', 'alpha', 0),
    node('src/a.ts#alpha.inner', 'src/a.ts', 'alpha.inner', 42),
    node('src/b.ts#beta', 'src/b.ts', 'beta', 0),
    node(
      'src/b.ts#describe("a#b").gamma',
      'src/b.ts',
      'describe("a#b").gamma',
      7,
    ),
  ],
  /** `alpha` is declared twice — an overload — and the row keeps the first offset. */
  declarations: [{ file: 'src/a.ts', start: 21, id: 'src/a.ts#alpha' }],
  callEdges: [
    edge('src/b.ts#beta', 'src/a.ts#alpha', 'symbol', 9),
    edge('src/b.ts', 'src/a.ts#alpha', 'file', 3),
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
  },
}
