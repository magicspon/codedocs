/**
 * `references` and `file`: the rest of the relationship set.
 *
 * The two facts worth pinning are the ones ADR 0002 chose this backend for and
 * the one ADR 0012 gates `impact` on. A type named in a signature and never
 * called is a reference and not a call — SCIP conflates the two, and if these
 * ever agree the distinction has been lost. And a file's own row set has to be
 * readable without guessing a symbol name first.
 */

import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { BatchedEnvelope } from '../src/envelope.ts'
import { callers } from '../src/operations/calls.ts'
import { file, type FileReport } from '../src/operations/file.ts'
import { references } from '../src/operations/references.ts'
import type { ReferenceEdge } from '../src/model.ts'
import { shorthandOf } from '../src/symbol-id.ts'
import { UNSCOPED } from '../src/labels/index.ts'
import { openSession } from '../src/session/index.ts'

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'references',
)
let root: string

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'codedocs-references-'))
  cpSync(fixture, root, { recursive: true })
  writeFileSync(
    join(root, 'package.json'),
    '{"name":"fixture","private":true}\n',
  )
  // Signal 1 met, so the fixture is analysed at the fidelity a real repository
  // would be: these operations read checker-resolved edges.
  mkdirSync(join(root, 'node_modules'), { recursive: true })
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

/** Run one operation over a real session, as the binding does, for one subject. */
function ask<T>(
  run: (
    ...args: Parameters<typeof references>
  ) => BatchedEnvelope<readonly T[]>,
  subject: string,
): BatchedEnvelope<readonly T[]> {
  const session = openSession({ cwd: root, noUpdate: false })
  try {
    return run(session.store, session.context, [subject], null, UNSCOPED)
  } finally {
    session.close()
  }
}

/** The one entry a single-subject `ask` produces, which every test here expects. */
function entryOf<T>(envelope: BatchedEnvelope<readonly T[]>) {
  const found = envelope.result?.[0]
  if (found === undefined) throw new Error('answered with no result')
  return found
}

const resultOf = <T>(envelope: BatchedEnvelope<readonly T[]>): readonly T[] =>
  entryOf(envelope).result

/**
 * Endpoints as ADR 0005's shorthand, which is the form both renderers print.
 *
 * These cases are about which declaration an edge reached; naming it by the
 * `SymbolId` would put the fixture's package and scheme in every assertion
 * without making one of them sharper.
 */
const named = (edge: ReferenceEdge): ReferenceEdge => ({
  ...edge,
  from: shorthandOf(edge.from),
  to: shorthandOf(edge.to),
})

const referencesTo = (subject: string): readonly ReferenceEdge[] =>
  resultOf(ask<ReferenceEdge>(references, subject)).map(named)

const fileReport = (subject: string): FileReport | undefined =>
  resultOf(ask<FileReport>(file, subject))[0]

describe('references', () => {
  it('reports a type named in a signature, which `callers` cannot', () => {
    const named = referencesTo('Money')
    expect(named).toHaveLength(2) // The parameter and the return type.
    for (const edge of named) {
      expect(edge.from).toBe('src/wallet.ts#price')
      expect(edge.to).toBe('src/types.ts#Money')
      expect(edge.kind).toBe('typeReferences')
    }

    // The half SCIP conflates: the same symbol has no call edge at all.
    const session = openSession({ cwd: root, noUpdate: false })
    try {
      const called = callers(
        session.store,
        session.context,
        ['Money'],
        null,
        UNSCOPED,
      )
      expect(resultOf(called)).toEqual([])
    } finally {
      session.close()
    }
  })

  it('separates a base class from an implemented interface', () => {
    expect(
      referencesTo('Ledger').filter((edge) => edge.kind === 'extends'),
    ).toMatchObject([
      { from: 'src/wallet.ts#Wallet', to: 'src/types.ts#Ledger' },
    ])
    expect(referencesTo('Spendable').map((edge) => edge.kind)).toEqual([
      'implements',
    ])
  })

  it('carries a site, a provenance and a derivation on every instance', () => {
    for (const edge of referencesTo('Ledger')) {
      expect(edge.file).toBe('src/wallet.ts')
      expect(edge.line).toBeGreaterThan(0)
      expect(edge.provenance).toBe('deterministic')
      // The derivation names the rule that decided the kind, not the kind.
      expect(edge.derivation).toBe(
        edge.kind === 'extends' ? 'heritage-clause' : 'checker-signature',
      )
    }
  })

  it('answers in both directions, because a reference has only one', () => {
    const written = referencesTo('Wallet')
    expect(written.map((edge) => edge.to)).toContain('src/types.ts#Ledger')
    expect(written.map((edge) => edge.to)).toContain('src/types.ts#Spendable')
  })

  it('never repeats a call as a reference', () => {
    // `this.record()` is a call, and the call sweep owns it: `record` must have
    // a caller and no reference at all.
    expect(referencesTo('Ledger.record')).toEqual([])
    const session = openSession({ cwd: root, noUpdate: false })
    try {
      const called = callers(
        session.store,
        session.context,
        ['record'],
        null,
        UNSCOPED,
      )
      expect(resultOf(called).length).toBe(1)
    } finally {
      session.close()
    }
  })

  it('does not report an import as a reference to what it names', () => {
    // The import statement is an `imports` edge, produced against the file. A
    // reference edge for it as well would make every re-export two facts.
    const lines = referencesTo('Money').map((edge) => edge.line)
    expect(lines).not.toContain(1)
  })

  it('is sorted by (source, target, kind, site), and byte-identical twice over', () => {
    const once = referencesTo('Ledger')
    const twice = referencesTo('Ledger')
    expect(JSON.stringify(once)).toBe(JSON.stringify(twice))
    const keys = once.map((edge) => `${edge.from} ${edge.to} ${edge.kind}`)
    expect([...keys].sort()).toEqual(keys)
  })

  it('reports one edge once when a subject resolves to both its ends', () => {
    // `Wallet` names two symbols, and one of them names the other. Read out of
    // the source and into the target, that is the same fact twice.
    const envelope = ask<ReferenceEdge>(references, 'Wallet')
    // `resolved` carries the `SymbolId` itself: ADR 0006 makes it what an agent
    // feeds back in, and only the id round-trips.
    expect(entryOf(envelope).resolved.map(shorthandOf)).toEqual([
      'src/alias.ts#Wallet',
      'src/wallet.ts#Wallet',
    ])
    const between = resultOf(envelope)
      .map(named)
      .filter(
        (edge) =>
          edge.from === 'src/alias.ts#Wallet' &&
          edge.to === 'src/wallet.ts#Wallet',
      )
    expect(between).toHaveLength(1)
  })

  it('says which symbols a subject resolved to', () => {
    expect(
      entryOf(ask<ReferenceEdge>(references, 'Money')).resolved.map(
        shorthandOf,
      ),
    ).toEqual(['src/types.ts#Money'])
  })
})

describe('file', () => {
  it('reports the projects that globbed it, and which one owns its facts', () => {
    const report = fileReport('src/wallet.ts')
    expect(report?.projects).toEqual(['tsconfig.json'])
    expect(report?.canonicalProject).toBe('tsconfig.json')
    expect(report?.fidelity).toBe('typed')
    expect(report?.cause).toBeNull()
  })

  it('reports what it declares, what it imports and what imports it', () => {
    const wallet = fileReport('src/wallet.ts')
    expect(wallet?.symbols.map((node) => node.qualified)).toEqual([
      'Wallet',
      'Wallet.spend',
      'ledgers',
      'price',
    ])
    expect(wallet?.imports).toEqual([
      { from: 'src/wallet.ts', specifier: './types.ts', to: 'src/types.ts' },
    ])
    expect(wallet?.importers).toEqual(['src/alias.ts'])

    expect(fileReport('src/types.ts')?.importers).toEqual(['src/wallet.ts'])
  })

  it('takes the tail of a path, as it prints one', () => {
    expect(fileReport('wallet.ts')?.path).toBe('src/wallet.ts')
    expect(fileReport('./src/wallet.ts')?.path).toBe('src/wallet.ts')
  })

  it('answers with nothing for a path the index does not hold', () => {
    const envelope = ask<FileReport>(file, 'src/nowhere.ts')
    expect(resultOf(envelope)).toEqual([])
    expect(entryOf(envelope).resolved).toEqual([])
  })
})

describe('ADR 0014: several subjects in one call', () => {
  it('answers `callers` for several subjects, one entry each, never pooled', () => {
    const session = openSession({ cwd: root, noUpdate: false })
    try {
      const envelope = callers(
        session.store,
        session.context,
        ['Money', 'record'],
        null,
        UNSCOPED,
      )
      expect(envelope.result?.map((found) => found.subject)).toEqual([
        'Money',
        'record',
      ])
      // `Money` is never called; `record` is called once — exactly what asking
      // about either alone would answer, whichever order the batch names them.
      expect(envelope.result?.[0]?.result).toEqual([])
      expect(envelope.result?.[1]?.result).toHaveLength(1)
    } finally {
      session.close()
    }
  })

  it('answers `file` for several paths, one entry each', () => {
    const session = openSession({ cwd: root, noUpdate: false })
    try {
      const envelope = file(
        session.store,
        session.context,
        ['src/wallet.ts', 'src/types.ts'],
        null,
        UNSCOPED,
      )
      expect(envelope.result?.map((found) => found.subject)).toEqual([
        'src/wallet.ts',
        'src/types.ts',
      ])
      expect(envelope.result?.[0]?.result[0]?.path).toBe('src/wallet.ts')
      expect(envelope.result?.[1]?.result[0]?.path).toBe('src/types.ts')
    } finally {
      session.close()
    }
  })
})
