/**
 * The renderers `render.test.ts` does not reach.
 *
 * `main.test.ts` drives these through a fixture repository, which can only put
 * an envelope in the states that fixture happens to produce: a baseline that
 * was substituted, a document with a fault in it, a capped list, a report
 * written to stdout. ADR 0006 forbids the renderer to drop any of those, so each
 * one needs an envelope built by hand to assert against.
 */

import { describe, expect, it } from 'vitest'
import { DEFAULT_SCOPE } from '@codedocs/core'
import type {
  BaselineUsed,
  CallEdge,
  Candidate,
  Change,
  ClaimReport,
  DocsEnvelope,
  DoctorEnvelope,
  DocumentFault,
  DocumentReport,
  Envelope,
  EvidenceEnvelope,
  EvidenceKind,
  FileReport,
  ImpactEnvelope,
  ImpactedSymbol,
  Label,
  Precondition,
  ReferenceEdge,
  ReportEnvelope,
  SectionReport,
  SymbolNode,
} from '@codedocs/core'

import {
  renderAnalyse,
  renderDoctor,
  renderDocs,
  renderEdges,
  renderEvidence,
  renderFile,
  renderImpact,
  renderReferences,
  renderReport,
  renderSymbols,
  styleFor,
  type AnalyseEnvelope,
} from '../src/render.ts'

const plain = styleFor(false)

/** The envelope fields every answer carries, so each test only says what it changes. */
const shell = {
  schemaVersion: 1,
  request: {
    subject: 'charge',
    resolved: ['src/payments.ts#charge'],
    limit: null,
    depth: null,
    scope: DEFAULT_SCOPE,
  },
  snapshot: {
    commit: 'abc1234',
    dirty: false,
    analysedAt: '2026-01-01T00:00:00Z',
  },
  conditions: [],
  blindSpots: [],
  budget: { returned: 1, available: 1, truncated: false },
} as const

const node: SymbolNode = {
  id: 'src/payments.ts#charge',
  name: 'charge',
  qualified: 'charge',
  kind: 'function',
  file: 'src/payments.ts',
  start: 0,
  line: 1,
  durable: true,
  callable: true,
  collisions: 0,
}

describe('the scope note', () => {
  const scoped = (scope: Envelope<unknown>['request']['scope']): string =>
    renderSymbols(
      {
        ...shell,
        operation: 'callers',
        result: [node],
        request: { ...shell.request, scope },
      },
      plain,
    )

  it('stays silent for a default scope that withheld nothing', () => {
    expect(scoped(DEFAULT_SCOPE)).not.toContain('scope')
  })

  it('says what the default scope withheld, once it bit', () => {
    const out = scoped({ ...DEFAULT_SCOPE, excluded: 4 })
    expect(out).toContain('scope authorship=authored — 4 excluded by it')
  })

  it('names a filter the caller asked for even when it excluded nothing', () => {
    const out = scoped({
      include: [{ axis: 'authorship', value: 'authored' }],
      exclude: [{ axis: 'role', value: 'test' }],
      excluded: 0,
    })
    expect(out).toContain('not role=test')
    expect(out).toContain('nothing excluded')
  })
})

describe('an impact answer', () => {
  const impacted = (
    result: readonly ImpactedSymbol[],
    changes: readonly Change[] = [],
    baseline: Partial<BaselineUsed> = {},
  ): string =>
    renderImpact(
      {
        ...shell,
        operation: 'impact',
        budget: {
          returned: result.length,
          available: result.length,
          truncated: false,
        },
        result,
        changes,
        baseline: {
          commit: 'abc1234',
          committedAt: null,
          requested: null,
          distance: null,
          absent: null,
          ...baseline,
        },
      } as ImpactEnvelope,
      plain,
    )

  const reached = (
    id: string,
    depth: number,
    through: ImpactedSymbol['through'],
  ): ImpactedSymbol => ({ id, file: 'src/a.ts', depth, through, from: null })

  it('heads each distance once, and names the edge each symbol was reached by', () => {
    const out = impacted([
      reached('src/a.ts#seed', 0, 'changed'),
      reached('src/b.ts#one', 1, 'calls'),
      reached('src/c.ts#two', 1, 'extends'),
      reached('src/d.ts#far', 2, 'calls'),
    ])
    expect(out.split('\n').filter((line) => line === '  changed')).toHaveLength(
      1,
    )
    expect(out).toContain('1 step out')
    expect(out).toContain('2 steps out')
    expect(out).toContain('extends')
    // A seed was not reached "through" anything, so no edge kind rides on it.
    expect(out).toContain('  src/a.ts#seed\n')
  })

  it('names the changed files up to the cap, then counts the rest', () => {
    const changes: Change[] = Array.from({ length: 13 }, (_, at) => ({
      file: `src/${at}.ts`,
      kind: 'changed',
      excluded: null,
    }))
    const out = impacted([], changes)
    expect(out).toContain('13 files changed')
    expect(out).toContain('src/9.ts (changed)')
    expect(out).not.toContain('src/10.ts (changed)')
    expect(out).toContain('…and 3 more')
  })

  it('names every changed file where there are fewer than the cap', () => {
    const out = impacted(
      [],
      [
        { file: 'src/a.ts', kind: 'added', excluded: null },
        { file: 'src/b.ts', kind: 'removed', excluded: null },
      ],
    )
    expect(out).toContain('2 files changed')
    expect(out).toContain('src/a.ts (added)')
    expect(out).toContain('src/b.ts (removed)')
    expect(out).not.toContain('more')
  })

  it('counts only the changes the scope kept', () => {
    const out = impacted(
      [],
      [{ file: 'src/a.ts', kind: 'added', excluded: 'authorship=generated' }],
    )
    expect(out).toContain('nothing changed against the baseline')
  })

  it('names the baseline it compared against', () => {
    expect(impacted([])).toContain('compared against abc1234')
  })

  it('stays silent about a comparison that never had a baseline', () => {
    const out = impacted([], [], { commit: null, absent: 'no baseline held' })
    expect(out).not.toContain('compared against')
  })

  it('says plainly when the baseline asked for was not the one used', () => {
    const behind = impacted([], [], { requested: 'def5678', distance: -2 })
    expect(behind).toContain(
      'no baseline for def5678 — compared against abc1234',
    )
    expect(behind).toContain('2 commits behind it')

    const ahead = impacted([], [], { requested: 'def5678', distance: 1 })
    expect(ahead).toContain('1 commit ahead of it')

    const unknown = impacted([], [], { requested: 'def5678', distance: null })
    expect(unknown).toContain('compared against abc1234')
    expect(unknown).not.toContain('commit ahead')
  })
})

describe('a call-edge answer', () => {
  const edge: CallEdge = {
    from: 'src/checkout.ts#checkout',
    to: 'src/payments.ts#charge',
    attribution: 'symbol',
    file: 'src/checkout.ts',
    line: 12,
    provenance: 'deterministic',
    derivation: 'checker-signature',
  }

  const edges = (operation: string, result: readonly CallEdge[]): string =>
    renderEdges(
      {
        ...shell,
        operation,
        budget: {
          returned: result.length,
          available: result.length,
          truncated: false,
        },
        result,
      } as Envelope<readonly CallEdge[]>,
      plain,
    )

  it('prints the end the caller did not name', () => {
    expect(edges('callers', [edge])).toContain('src/checkout.ts#checkout')
    expect(edges('callees', [edge])).toContain('src/payments.ts#charge')
  })

  it('flags a site credited to a file rather than to a symbol', () => {
    const out = edges('callers', [{ ...edge, attribution: 'file' }])
    expect(out).toContain('(file)')
  })

  it('flags a site the adapter inferred', () => {
    const out = edges('callers', [
      { ...edge, provenance: 'inferred', derivation: 'jsx-element-rule' },
    ])
    expect(out).toContain('[inferred: jsx-element-rule]')
  })

  it('says plainly when nothing calls it', () => {
    expect(edges('callers', [])).toContain('no call edges')
  })

  it('says a subject matched nothing, which is a different fact', () => {
    const out = renderEdges(
      {
        ...shell,
        operation: 'callers',
        request: { ...shell.request, subject: 'nope', resolved: [] },
        budget: { returned: 0, available: 0, truncated: false },
        result: [],
      } as Envelope<readonly CallEdge[]>,
      plain,
    )
    expect(out).toContain('`nope` matched no symbol')
  })

  it('says `file` for an operation whose subject is a path', () => {
    const out = renderFile(
      {
        ...shell,
        operation: 'file',
        request: { ...shell.request, subject: 'nope.ts', resolved: [] },
        budget: { returned: 0, available: 0, truncated: false },
        result: [],
      } as Envelope<readonly FileReport[]>,
      plain,
    )
    expect(out).toContain('`nope.ts` matched no file')
  })
})

describe('a reference answer', () => {
  const reference: ReferenceEdge = {
    from: 'src/checkout.ts#Checkout',
    to: 'src/payments.ts#Charge',
    kind: 'extends',
    attribution: 'symbol',
    file: 'src/checkout.ts',
    line: 4,
    provenance: 'deterministic',
    derivation: 'heritage-clause',
  }

  const references = (result: readonly ReferenceEdge[]): string =>
    renderReferences(
      {
        ...shell,
        operation: 'references',
        budget: {
          returned: result.length,
          available: result.length,
          truncated: false,
        },
        result,
      } as Envelope<readonly ReferenceEdge[]>,
      plain,
    )

  it('names both ends and the kind, because the direction varies per row', () => {
    expect(references([reference])).toContain(
      'src/checkout.ts#Checkout extends src/payments.ts#Charge  src/checkout.ts:4',
    )
  })

  it('never drops the provenance of an edge nothing checked', () => {
    const out = references([
      {
        ...reference,
        provenance: 'syntactic',
        derivation: 'shared-method-name',
      },
    ])
    expect(out).toContain('[syntactic: shared-method-name]')
  })

  it('says plainly when nothing references it', () => {
    expect(references([])).toContain('no references')
  })
})

/** One file report, complete enough that each test only overrides one list. */
const report = (overrides: Partial<FileReport> = {}): FileReport => ({
  path: 'src/payments.ts',
  projects: ['tsconfig.json'],
  canonicalProject: 'tsconfig.json',
  fidelity: 'typed',
  cause: null,
  symbols: [node],
  imports: [{ from: 'src/payments.ts', specifier: './db.ts', to: 'src/db.ts' }],
  importers: ['src/checkout.ts'],
  ...overrides,
})

describe('a file answer', () => {
  const files = (result: readonly FileReport[]): string =>
    renderFile(
      {
        ...shell,
        operation: 'file',
        budget: {
          returned: result.length,
          available: result.length,
          truncated: false,
        },
        result,
      } as Envelope<readonly FileReport[]>,
      plain,
    )

  it('heads each of the four lists, and counts them', () => {
    const out = files([report()])
    expect(out).toContain('declares (1)')
    expect(out).toContain('imports (1)')
    expect(out).toContain('imported by (1)')
    expect(out).toContain('./db.ts → src/db.ts')
  })

  it('heads an empty list rather than saying nothing about it', () => {
    expect(files([report({ importers: [] })])).toContain('imported by (0)')
  })

  it('names a specifier that resolved to nothing', () => {
    const out = files([
      report({
        imports: [{ from: 'src/payments.ts', specifier: 'stripe', to: null }],
      }),
    ])
    expect(out).toContain('stripe → unresolved')
  })

  it('caps a long list and says what it capped', () => {
    const importers = Array.from({ length: 14 }, (_, at) => `src/${at}.ts`)
    const out = files([report({ importers })])
    expect(out).toContain('imported by (14)')
    expect(out).toContain('…and 4 more')
  })

  it('marks which of several projects produced the file’s facts', () => {
    const out = files([
      report({ projects: ['tsconfig.json', 'apps/web/tsconfig.json'] }),
    ])
    expect(out).toContain('in tsconfig.json *, apps/web/tsconfig.json')
  })

  it('says nothing about projects where none globbed the file', () => {
    expect(
      files([report({ projects: [], canonicalProject: null })]),
    ).not.toContain(' in ')
  })

  it('names the cause of a syntactic fidelity, and reports one that has none', () => {
    expect(
      files([report({ fidelity: 'syntactic', cause: 'unprepared' })]),
    ).toContain('syntactic (unprepared)')
    expect(files([report({ fidelity: 'syntactic', cause: null })])).toContain(
      'syntactic',
    )
  })

  it('says a file was never analysed, rather than reporting a fidelity it has not got', () => {
    expect(
      files([report({ fidelity: null, cause: null, canonicalProject: null })]),
    ).toContain('not analysed')
  })

  it('says plainly when a path matched no file the index holds', () => {
    expect(files([])).toContain('no files')
  })
})

describe('an evidence answer', () => {
  const kind = <TItem>(
    items: readonly TItem[],
    budget?: Partial<EvidenceKind<TItem>['budget']>,
  ): EvidenceKind<TItem> => ({
    items,
    budget: {
      returned: items.length,
      available: items.length,
      truncated: false,
      ...budget,
    },
  })

  const label: Label = {
    node: 'src/payments.ts',
    axis: 'role',
    value: 'source',
    provenance: 'inferred',
    derivation: 'path-convention',
  } as Label

  const evidence = (
    overrides: Partial<EvidenceEnvelope['result']> = {},
    request: Partial<EvidenceEnvelope['request']> = {},
  ): string =>
    renderEvidence(
      {
        ...shell,
        operation: 'evidence',
        request: { ...shell.request, ...request },
        result: {
          symbols: kind([node]),
          files: kind([report()]),
          callers: kind([]),
          callees: kind([]),
          references: kind([]),
          labels: kind([label]),
          ...overrides,
        },
        claims: null,
      } as EvidenceEnvelope,
      plain,
    )

  it('heads every kind, including the empty ones', () => {
    const out = evidence()
    expect(out).toContain('symbols (1)')
    expect(out).toContain('callers (0)')
    expect(out).toContain('callees (0)')
    expect(out).toContain('references (0)')
    expect(out).toContain('labels (1)')
  })

  it('reports each kind’s own truncation, because the budget is per kind', () => {
    const out = evidence({
      callers: kind([], { returned: 3, available: 176, truncated: true }),
    })
    expect(out).toContain('callers (showing 3 of 176)')
  })

  it('never drops a label’s derivation, which is what tells a guess from a rule', () => {
    expect(evidence()).toContain('[inferred: path-convention]')
  })

  it('indents a file report under its own heading', () => {
    expect(evidence()).toContain('    src/payments.ts')
    expect(evidence()).toContain('      declares (1)')
  })

  it('renders a call edge from each side under its own heading', () => {
    const edge: CallEdge = {
      from: 'src/checkout.ts#checkout',
      to: 'src/payments.ts#charge',
      attribution: 'symbol',
      file: 'src/checkout.ts',
      line: 12,
      provenance: 'deterministic',
      derivation: 'checker-signature',
    }
    const out = evidence({ callers: kind([edge]), callees: kind([edge]) })
    expect(out).toContain('src/checkout.ts#checkout  src/checkout.ts:12')
    expect(out).toContain('src/payments.ts#charge  src/checkout.ts:12')
  })

  it('renders a reference edge under its heading', () => {
    const out = evidence({
      references: kind([
        {
          from: 'src/checkout.ts#Checkout',
          to: 'src/payments.ts#Charge',
          kind: 'implements',
          attribution: 'symbol',
          file: 'src/checkout.ts',
          line: 4,
          provenance: 'deterministic',
          derivation: 'heritage-clause',
        } satisfies ReferenceEdge,
      ]),
    })
    expect(out).toContain('implements')
  })

  it('heads no kind at all for a subject that resolved to nothing', () => {
    const out = evidence({}, { subject: 'nope', resolved: [] })
    expect(out).not.toContain('callers (')
    expect(out).toContain('`nope` matched no symbol')
  })
})

describe('a docs answer', () => {
  const claim = (overrides: Partial<ClaimReport> = {}): ClaimReport => ({
    text: 'charge calls capture',
    line: 12,
    verdict: 'verified',
    reason: 'holds',
    provenance: 'deterministic',
    resolved: ['src/payments.ts#charge'],
    candidates: [],
    observed: null,
    ...overrides,
  })

  const section = (overrides: Partial<SectionReport> = {}): SectionReport => ({
    heading: 'Payments',
    line: 8,
    verdict: 'verified',
    claims: [claim()],
    links: [],
    ...overrides,
  })

  const document = (
    overrides: Partial<DocumentReport> = {},
  ): DocumentReport => ({
    path: 'docs/payments.md',
    verdict: 'verified',
    coverage: { covered: 1, sections: 2 },
    sections: [section()],
    faults: [],
    scope: ['src/payments.ts'],
    ...overrides,
  })

  const docs = (result: readonly DocumentReport[]): string =>
    renderDocs(
      {
        ...shell,
        operation: 'docs check',
        request: { ...shell.request, subject: null, resolved: [] },
        budget: {
          returned: result.length,
          available: result.length,
          truncated: false,
        },
        result,
        scan: { documents: result.length, scanned: 380, durationMs: 46 },
        changed: [],
        failing: 0,
        faulted: 0,
      } as DocsEnvelope,
      plain,
    )

  it('never prints a verdict without its coverage', () => {
    expect(docs([document()])).toContain(
      'docs/payments.md  verified, 1 of 2 sections covered',
    )
  })

  it('spells each verdict for a person, and passes an unknown one through', () => {
    expect(docs([document({ verdict: 'potentially-stale' })])).toContain(
      'potentially stale',
    )
    expect(docs([document({ verdict: 'unable-to-verify' })])).toContain(
      'unable to verify',
    )
    expect(
      docs([document({ verdict: 'invented' as DocumentReport['verdict'] })]),
    ).toContain('invented')
  })

  it('skips a section that asserts nothing, which is uncovered rather than a verdict', () => {
    const out = docs([
      document({
        sections: [section({ heading: 'Preamble', verdict: null, claims: [] })],
      }),
    ])
    expect(out).not.toContain('Preamble')
  })

  it('names a section with no heading rather than printing a blank', () => {
    const out = docs([document({ sections: [section({ heading: null })] })])
    expect(out).toContain('(preamble)')
  })

  it('reports what the index holds only where the claim is wrong', () => {
    const wrong = docs([
      document({
        sections: [
          section({
            claims: [
              claim({
                verdict: 'contradicted',
                reason: 'count-differs',
                observed: 3,
              }),
            ],
          }),
        ],
      }),
    ])
    expect(wrong).toContain('(index holds 3)')

    const right = docs([
      document({ sections: [section({ claims: [claim({ observed: 2 })] })] }),
    ])
    expect(right).not.toContain('index holds')
  })

  it('names a provenance that is not deterministic, and stays quiet for one that is', () => {
    expect(
      docs([
        document({
          sections: [section({ claims: [claim({ provenance: 'inferred' })] })],
        }),
      ]),
    ).toContain('[inferred]')
    expect(docs([document()])).not.toContain('[deterministic]')
    expect(
      docs([
        document({
          sections: [section({ claims: [claim({ provenance: null })] })],
        }),
      ]),
    ).not.toContain('[null]')
  })

  it('names where a vanished subject appears to have gone', () => {
    const candidate: Candidate = {
      id: 'src/billing.ts#charge',
      file: 'src/billing.ts',
      derivations: ['git-rename'],
      commit: 'fedcba98765',
      similarity: 94,
    }
    const out = docs([
      document({
        sections: [
          section({
            claims: [
              claim({
                verdict: 'unable-to-verify',
                reason: 'unresolved',
                candidates: [candidate],
              }),
            ],
          }),
        ],
      }),
    ])
    expect(out).toContain('candidate: src/billing.ts#charge in fedcba9')
    expect(out).toContain('(git similarity 94%)')
  })

  it('names a candidate that carries neither a commit nor a similarity', () => {
    const out = docs([
      document({
        sections: [
          section({
            claims: [
              claim({
                candidates: [
                  {
                    id: 'src/billing.ts#charge',
                    file: 'src/billing.ts',
                    derivations: ['name-in-head'],
                    commit: null,
                    similarity: null,
                  },
                ],
              }),
            ],
          }),
        ],
      }),
    ])
    expect(out).toContain('candidate: src/billing.ts#charge [name-in-head]')
    expect(out).not.toContain('similarity')
  })

  it('names a broken link, and stays quiet about one that resolves', () => {
    const links = [
      { target: './gone.md', path: 'docs/gone.md', line: 3, broken: true },
      { target: './here.md', path: 'docs/here.md', line: 4, broken: false },
    ]
    const out = docs([document({ sections: [section({ links })] })])
    expect(out).toContain('./gone.md → no such file  :3')
    expect(out).not.toContain('./here.md')
  })

  it('says what each fault code means, rather than putting a sentence on the wire', () => {
    const faulted = (fault: DocumentFault['fault']): string =>
      docs([document({ faults: [{ line: 5, text: 'bad claim', fault }] })])

    expect(faulted({ code: 'unparseable' })).toContain('not a claim expression')
    expect(faulted({ code: 'unknown-predicate', predicate: 'nope' })).toContain(
      '`nope` is not one of the claim predicates',
    )
    expect(faulted({ code: 'no-backend', predicate: 'exports' })).toContain(
      'has no backend',
    )
    expect(
      faulted({ code: 'arity', predicate: 'calls', expected: 2, got: 1 }),
    ).toContain('takes 2 arguments, got 1')
    expect(
      faulted({ code: 'count-invalid', detail: 'not a number' }),
    ).toContain('not a number')
    expect(
      faulted({
        code: 'ambiguous-subject',
        subject: 'charge',
        resolved: ['src/a.ts#charge', 'src/b.ts#charge'],
      }),
    ).toContain('names 2 symbols')
    expect(faulted({ code: 'local-subject', subject: 'helper' })).toContain(
      'is a local symbol',
    )
    expect(
      faulted({ code: 'label-invalid', axis: 'role', value: 'nope' }),
    ).toContain('`role=nope` is not a label codedocs knows')
  })

  it('reports what the scan cost, so the measurement stays visible', () => {
    expect(docs([])).toContain(
      'scanned 380 Markdown files in 46 ms, finding 0 documents',
    )
  })

  it('says plainly when there are no documents at all', () => {
    expect(docs([])).toContain('no documents')
  })
})

describe('a bug report', () => {
  const reportEnvelope = (
    overrides: Partial<ReportEnvelope['result']> = {},
  ): ReportEnvelope =>
    ({
      ...shell,
      operation: 'report-bug',
      request: { ...shell.request, subject: null, resolved: [] },
      result: {
        repositoryFacts: 'excluded',
        contains: 'codedocs and machine facts only',
        carries: {
          blindSpotReasons: 2,
          paths: 0,
          symbolNames: 0,
          moduleSpecifiers: 1,
        },
        reproduction: {
          operation: 'callers',
          flags: ['--json'],
          exitCode: 1,
          durationMs: 42,
          error: null,
          budget: null,
          dirty: false,
          analysedAt: null,
          blindSpots: [],
        },
        ...overrides,
      },
    }) as unknown as ReportEnvelope

  it('names the file it wrote and what the file carries', () => {
    const out = renderReport(reportEnvelope(), 'codedocs-report.json', plain)
    expect(out).toContain('wrote codedocs-report.json')
    expect(out).toContain(
      '2 blind-spot reasons, 0 paths, 0 symbol names, 1 module specifier',
    )
    expect(out).toContain('reproduced `callers`: exit 1 in 42 ms')
  })

  it('offers the flag that adds the rest, in the default shape only', () => {
    expect(renderReport(reportEnvelope(), null, plain)).toContain(
      '--with-repository adds the facts that name your code',
    )
    expect(
      renderReport(
        reportEnvelope({ repositoryFacts: 'included' }),
        null,
        plain,
      ),
    ).not.toContain('--with-repository adds')
  })

  it('says where it went when nothing named a file', () => {
    expect(renderReport(reportEnvelope(), null, plain)).toContain(
      'wrote the report to stdout',
    )
  })

  it('names a command line that parsed to no operation, and the failure behind it', () => {
    const out = renderReport(
      reportEnvelope({
        reproduction: {
          operation: null,
          flags: [],
          exitCode: 2,
          durationMs: 3,
          error: { code: 'operation-unknown' },
          budget: null,
          dirty: false,
          analysedAt: null,
          blindSpots: [],
        },
      } as Partial<ReportEnvelope['result']>),
      null,
      plain,
    )
    expect(out).toContain('reproduced `nothing codedocs knows`')
    expect(out).toContain('— operation-unknown')
  })
})

describe('the doctor notes', () => {
  const doctorEnvelope = (
    overrides: Partial<DoctorEnvelope> = {},
  ): DoctorEnvelope =>
    ({
      ...shell,
      operation: 'doctor',
      schemaVersion: 3,
      request: { ...shell.request, subject: null, resolved: [] },
      budget: { returned: 0, available: 0, truncated: false },
      result: [],
      header: {
        toolVersion: '0.0.0',
        typescriptVersion: '7.0.0',
        projects: 1,
        files: 4,
      },
      remediable: 0,
      measured: null,
      classification: { counts: [], inferred: [], disagreements: [] },
      baselines: { held: [], cap: 3, distance: null },
      ...overrides,
    }) as DoctorEnvelope

  const doctor = (overrides: Partial<DoctorEnvelope> = {}): string =>
    renderDoctor(doctorEnvelope(overrides), plain)

  it('says nothing about classification where the layer decided nothing', () => {
    expect(doctor()).not.toContain('classification')
  })

  it('counts each role and authorship pair with the signals behind it', () => {
    const out = doctor({
      classification: {
        counts: [
          {
            role: 'source',
            authorship: 'authored',
            files: 12,
            derivations: ['path-convention'],
          },
        ],
        inferred: [],
        disagreements: [],
      },
    })
    expect(out).toContain('source, authored: 12 files (path-convention)')
    expect(out).not.toContain('by convention rather than evidence')
    expect(out).not.toContain('two')
  })

  it('says how many files were classified by convention rather than evidence', () => {
    const out = doctor({
      classification: {
        counts: [
          {
            role: 'test',
            authorship: 'authored',
            files: 1,
            derivations: ['path-convention'],
          },
        ],
        inferred: ['src/a.ts'],
        disagreements: [],
      },
    })
    expect(out).toContain(
      '1 file classified by convention rather than evidence',
    )
  })

  it('names every disagreement where there are fewer than the cap', () => {
    const out = doctor({
      classification: {
        counts: [
          {
            role: 'source',
            authorship: 'authored',
            files: 2,
            derivations: ['manifest'],
          },
        ],
        inferred: [],
        disagreements: [
          {
            file: 'src/a.ts',
            axis: 'role',
            values: [
              { value: 'source', derivation: 'path-convention' },
              { value: 'test', derivation: 'manifest' },
            ],
          },
        ],
      },
    })
    expect(out).toContain('1 file where two signals disagree')
    expect(out).not.toContain('more')
  })

  it('names the files where two signals disagree, up to the cap', () => {
    const out = doctor({
      classification: {
        counts: [
          {
            role: 'source',
            authorship: 'authored',
            files: 9,
            derivations: ['manifest'],
          },
        ],
        inferred: [],
        disagreements: Array.from({ length: 7 }, (_, at) => ({
          file: `src/${at}.ts`,
          axis: 'authorship' as const,
          values: [
            { value: 'authored', derivation: 'path-convention' },
            { value: 'generated', derivation: 'generated-header' },
          ],
        })),
      },
    })
    expect(out).toContain('7 files where two signals disagree')
    expect(out).toContain(
      'src/4.ts authorship: authored (path-convention) vs generated (generated-header)',
    )
    expect(out).not.toContain('src/5.ts')
    expect(out).toContain('…and 2 more')
  })

  it('says baselines are off rather than reporting none held', () => {
    const out = doctor({ baselines: { held: [], cap: 0, distance: null } })
    expect(out).toContain('baselines are disabled (`baselines: 0`)')
  })

  it('says how a baseline comes to exist, where none does', () => {
    expect(doctor()).toContain(
      'no baselines held — one is captured by `analyse`',
    )
  })

  it('counts the baselines held, how many are usable, and how far HEAD has moved', () => {
    const held = [
      { commit: 'aaa1111', committedAt: null, ancestor: true, bytes: 10 },
      { commit: 'bbb2222', committedAt: null, ancestor: false, bytes: 10 },
    ]
    const out = doctor({ baselines: { held, cap: 3, distance: 4 } })
    expect(out).toContain('2 baselines of 3 held (1 usable)')
    expect(out).toContain('HEAD is 4 commits ahead of the newest')
  })

  it('stays quiet about usability where every baseline is usable', () => {
    const held = [
      { commit: 'aaa1111', committedAt: null, ancestor: true, bytes: 10 },
    ]
    const out = doctor({ baselines: { held, cap: 3, distance: null } })
    expect(out).toContain('1 baseline of 3 held')
    expect(out).not.toContain('usable')
    expect(out).not.toContain('ahead of the newest')
  })

  it('sharpens `unprepared` where the install generates types too', () => {
    const found: Precondition = {
      project: 'tsconfig.json',
      cause: 'unprepared',
      fidelity: 'syntactic',
      signal: false,
      postinstall: true,
      remediable: true,
      remediations: [],
      specifiers: [],
    }
    const out = doctor({ result: [found], remediable: 1 })
    expect(out).toContain('its postinstall generates types')
  })

  it('names the project by what it is where no project claims the file', () => {
    const found: Precondition = {
      project: null as unknown as Precondition['project'],
      cause: 'unmapped',
      fidelity: null,
      signal: false,
      postinstall: false,
      remediable: false,
      remediations: [],
      specifiers: [],
    }
    const out = doctor({ result: [found] })
    expect(out).toContain('files no project claims')
    // `unmapped` gets no remediation at all, not even the line offering one.
    expect(out).not.toContain('declare one in codedocs.jsonc')
  })

  it('names a specifier written across several files by the count, not by one of them', () => {
    const found: Precondition = {
      project: 'tsconfig.json',
      cause: 'missing-generated',
      fidelity: 'syntactic',
      signal: false,
      postinstall: false,
      remediable: true,
      remediations: [],
      specifiers: [
        {
          specifier: '@app/db',
          sites: 4,
          files: ['src/a.ts', 'src/b.ts'],
          remediation: null,
        },
      ],
    }
    expect(doctor({ result: [found] })).toContain(
      '@app/db — 4 sites in 2 files',
    )
  })
})

describe('the analyse notes', () => {
  const analyse = (overrides: Partial<AnalyseEnvelope> = {}): string =>
    renderAnalyse(
      {
        ...shell,
        operation: 'analyse',
        request: { ...shell.request, subject: null, resolved: [] },
        result: [
          {
            project: 'tsconfig.json',
            fidelity: 'syntactic',
            files: 4,
            analysedAt: '2026-01-01T00:00:00Z',
          },
        ],
        totals: { symbols: 10, callEdges: 5, unresolvedCalls: 1 },
        repair: null,
        labels: null,
        capture: null,
        ...overrides,
      } as AnalyseEnvelope,
      plain,
    )

  it('marks a project analysed without types on its own row', () => {
    expect(analyse()).toContain('tsconfig.json  4 files  syntactic')
  })

  it('names the projects re-analysed because their environment changed', () => {
    const out = analyse({
      repair: {
        kind: 'wave',
        files: 1,
        waves: 1,
        environment: ['apps/web/tsconfig.json'],
        reason: '',
      },
    })
    expect(out).toContain('repaired 1 file in 1 wave')
    expect(out).toContain('re-analysed 1 project whose environment changed')
    expect(out).toContain('apps/web/tsconfig.json')
  })

  it('reports what the label pass cost, and says when git could not answer', () => {
    expect(
      analyse({
        labels: { labels: [], files: 40, durationMs: 9, tracked: true },
      }),
    ).toContain('labelled 40 files in 9 ms')
    expect(
      analyse({
        labels: { labels: [], files: 40, durationMs: 9, tracked: false },
      }),
    ).toContain('git absent')
  })

  it('says a baseline was captured with nothing evicted for it', () => {
    const out = analyse({
      capture: {
        commit: 'abc1234def',
        declined: null,
        evicted: [],
        bytes: 1024,
      },
    })
    expect(out).toContain('captured a baseline for abc1234 (1 KB)')
    expect(out).not.toContain('evicting')
  })

  it('says a baseline was captured, and what it evicted to fit', () => {
    const out = analyse({
      capture: {
        commit: 'abc1234def',
        declined: null,
        evicted: ['old1111'],
        bytes: 20480,
      },
    })
    expect(out).toContain('captured a baseline for abc1234 (20 KB)')
    expect(out).toContain('evicting 1 baseline')
  })

  it('says why no baseline was captured, because the copy is a side effect', () => {
    expect(
      analyse({
        capture: {
          commit: null,
          declined: 'the tree is not clean',
          evicted: [],
          bytes: 0,
        },
      }),
    ).toContain('no baseline captured — the tree is not clean')
    expect(
      analyse({
        capture: { commit: null, declined: null, evicted: [], bytes: 0 },
      }),
    ).toContain('no baseline captured — declined')
  })

  it('says plainly when there are no projects at all', () => {
    expect(analyse({ result: [] })).toContain('no projects')
  })
})

describe('what a renderer does with an envelope carrying no result', () => {
  /**
   * ADR 0006 sends a failure to `renderError`, so nothing routes an envelope
   * with neither an error nor a result here. The fallbacks exist so that a bug upstream
   * degrades to "no answer" rather than a stack trace on a user's terminal, and
   * this is what pins that.
   */
  const empty = { ...shell, result: undefined }

  it('answers rather than throwing, for every operation', () => {
    expect(
      renderSymbols({ ...empty, operation: 'symbol' } as never, plain),
    ).toContain('no symbols')
    expect(
      renderEdges({ ...empty, operation: 'callers' } as never, plain),
    ).toContain('no call edges')
    expect(
      renderReferences({ ...empty, operation: 'references' } as never, plain),
    ).toContain('no references')
    expect(
      renderFile({ ...empty, operation: 'file' } as never, plain),
    ).toContain('no files')
    expect(
      renderEvidence(
        { ...empty, operation: 'evidence', claims: null } as never,
        plain,
      ),
    ).toContain('no facts')
    expect(
      renderImpact(
        {
          ...empty,
          operation: 'impact',
          changes: [],
          baseline: {
            commit: null,
            committedAt: null,
            requested: null,
            distance: null,
            absent: 'none held',
          },
        } as never,
        plain,
      ),
    ).toContain('no impacted symbols')
    expect(
      renderDocs(
        {
          ...empty,
          operation: 'docs check',
          scan: { documents: 0, scanned: 0, durationMs: 0 },
          changed: [],
          failing: 0,
          faulted: 0,
        } as never,
        plain,
      ),
    ).toContain('no documents')
    expect(
      renderDoctor(
        {
          ...empty,
          operation: 'doctor',
          header: {
            toolVersion: '0.0.0',
            typescriptVersion: '7.0.0',
            projects: 0,
            files: 0,
          },
          remediable: 0,
          measured: null,
          classification: { counts: [], inferred: [], disagreements: [] },
          baselines: { held: [], cap: 3, distance: null },
        } as never,
        plain,
      ),
    ).toContain('no unmet preconditions')
    expect(
      renderAnalyse(
        {
          ...empty,
          operation: 'analyse',
          totals: { symbols: 0, callEdges: 0, unresolvedCalls: 0 },
          repair: null,
          labels: null,
          capture: null,
        } as never,
        plain,
      ),
    ).toContain('no projects')
  })
})
