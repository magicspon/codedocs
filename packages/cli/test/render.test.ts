/**
 * The honesty footer, asserted directly on hand-built envelopes.
 *
 * The end-to-end tests in `main.test.ts` can only produce the states the fixture
 * happens to be in, so blind spots, ambiguity, syntactic fidelity and a dirty
 * snapshot are exercised here — they are exactly the notes ADR 0006 forbids the
 * renderer to omit, so they need a test that can put the envelope in that state.
 */

import { describe, expect, it } from 'vitest'
import type {
  CallSite,
  Envelope,
  RepairReport,
  SymbolNode,
  TracePath,
} from '@codedocs/core'

import {
  renderAnalyse,
  renderError,
  renderSymbols,
  renderTrace,
  styleFor,
  type AnalyseEnvelope,
} from '../src/render.ts'

const plain = styleFor(false)

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

/** A clean envelope, so each test only says what it changes. */
const envelopeOf = (
  overrides: Partial<Envelope<readonly SymbolNode[]>> = {},
): Envelope<readonly SymbolNode[]> => ({
  operation: 'callers',
  schemaVersion: 1,
  request: {
    subject: 'charge',
    resolved: ['src/payments.ts#charge'],
    limit: null,
    depth: null,
  },
  snapshot: {
    commit: 'abc1234',
    dirty: false,
    analysedAt: '2026-01-01T00:00:00Z',
  },
  conditions: [],
  blindSpots: [],
  budget: { returned: 1, available: 1, truncated: false },
  result: [node],
  ...overrides,
})

const render = (
  overrides: Partial<Envelope<readonly SymbolNode[]>> = {},
): string => renderSymbols(envelopeOf(overrides), plain)

describe('a clean answer', () => {
  it('carries no footer, because no news is the honest render of a clean state', () => {
    expect(render()).toBe(
      '  src/payments.ts#charge  function  src/payments.ts:1',
    )
  })

  it('marks a symbol no edit can be relied on to preserve', () => {
    expect(render({ result: [{ ...node, durable: false }] })).toContain('local')
  })
})

describe('the footer', () => {
  it('says how many results it withheld', () => {
    const out = render({
      budget: { returned: 1, available: 9, truncated: true },
    })
    expect(out).toContain('showing 1 of 9')
  })

  it('names the candidates when a subject is ambiguous', () => {
    const out = render({
      request: {
        subject: 'charge',
        resolved: ['src/payments.ts#charge', 'src/billing.ts#charge'],
        limit: null,
        depth: null,
      },
    })
    expect(out).toContain('`charge` is ambiguous — 2 symbols')
    expect(out).toContain('src/billing.ts#charge')
  })

  it('stays quiet about ambiguity for `symbol`, whose answer is the whole match set', () => {
    const out = renderSymbols(
      envelopeOf({
        operation: 'symbol',
        request: {
          subject: '*',
          resolved: ['src/payments.ts#charge', 'src/billing.ts#charge'],
          limit: null,
          depth: null,
        },
      }),
      plain,
    )
    expect(out).not.toContain('ambiguous')
  })

  it('names a project analysed without types, and what that costs', () => {
    const out = render({
      conditions: [
        {
          project: 'tsconfig.json',
          fidelity: 'typed',
          analysedAt: '2026-01-01T00:00:00Z',
          cause: null,
          postinstall: false,
        },
        {
          project: 'apps/web/tsconfig.json',
          fidelity: 'syntactic',
          analysedAt: '2026-01-01T00:00:00Z',
          cause: 'unprepared',
          postinstall: false,
        },
      ],
    })
    expect(out).toContain('1 project(s) analysed without types')
    expect(out).toContain('apps/web/tsconfig.json')
    expect(out).toContain('may be missing')
  })

  it('names every blind spot up to the cap, then counts the rest', () => {
    const out = render({
      blindSpots: Array.from({ length: 12 }, (_, i) => ({
        subject: `src/generated/${i}.ts`,
        reason: 'not globbed by any tsconfig',
      })),
    })
    expect(out).toContain('12 blind spot(s)')
    expect(out).toContain('src/generated/9.ts')
    expect(out).not.toContain('src/generated/10.ts')
    expect(out).toContain('…and 2 more')
  })

  it('says which snapshot answered when the tree has drifted', () => {
    const out = render({
      snapshot: {
        commit: 'abc1234',
        dirty: true,
        analysedAt: '2026-01-01T00:00:00Z',
      },
    })
    expect(out).toContain('answered from the snapshot at abc1234')
  })

  it('does not pretend to a commit outside a repository', () => {
    const out = render({
      snapshot: { commit: null, dirty: true, analysedAt: null },
    })
    expect(out).toContain('an unknown commit')
  })

  it('reports every note at once, in a fixed order', () => {
    const out = render({
      budget: { returned: 1, available: 2, truncated: true },
      conditions: [
        {
          project: 'tsconfig.json',
          fidelity: 'syntactic',
          analysedAt: '2026-01-01T00:00:00Z',
          cause: 'missing-generated',
          postinstall: false,
        },
      ],
      blindSpots: [{ subject: 'vendor.js', reason: 'not analysed' }],
      snapshot: { commit: 'abc1234', dirty: true, analysedAt: null },
    })
    const order = [
      'showing 1 of 2',
      'without types',
      'blind spot(s)',
      'snapshot at',
    ]
    const positions = order.map((needle) => out.indexOf(needle))
    expect(positions.every((at) => at >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it('says plainly when an answer has nothing in it', () => {
    expect(render({ result: [] })).toContain('no symbols')
  })
})

describe('a failure envelope', () => {
  it('renders the code and the message, not a stack', () => {
    const out = renderError(
      {
        ...envelopeOf(),
        result: undefined,
        error: { code: 'operation-failed', message: 'no such subject' },
      } as unknown as Envelope<never>,
      plain,
    )
    expect(out).toContain('operation-failed: no such subject')
  })

  it('falls back rather than printing `undefined` for an errorless failure', () => {
    const out = renderError(envelopeOf() as unknown as Envelope<never>, plain)
    expect(out).toContain('error: could not answer')
  })
})

describe('styleFor', () => {
  it('emits escapes only when colour is on', () => {
    expect(styleFor(true).warn('x')).not.toBe('x')
    expect(plain.warn('x')).toBe('x')
  })
})

describe('the repair note', () => {
  /** An `analyse` envelope carrying one project and whatever repair happened. */
  const analyseEnvelope = (repair: RepairReport | null): AnalyseEnvelope => ({
    operation: 'analyse',
    schemaVersion: 1,
    request: { subject: null, resolved: [], limit: null, depth: null },
    snapshot: {
      commit: 'abc1234',
      dirty: false,
      analysedAt: '2026-01-01T00:00:00Z',
    },
    conditions: [],
    blindSpots: [],
    budget: { returned: 1, available: 1, truncated: false },
    result: [
      {
        project: 'tsconfig.json',
        fidelity: 'typed',
        files: 4,
        analysedAt: '2026-01-01T00:00:00Z',
      },
    ],
    totals: { symbols: 10, callEdges: 5, unresolvedCalls: 1 },
    repair,
  })

  it('says how far a wave reached', () => {
    const text = renderAnalyse(
      analyseEnvelope({
        kind: 'wave',
        files: 3,
        waves: 2,
        environment: [],
        reason: '',
      }),
      plain,
    )
    expect(text).toContain('repaired 3 files in 2 waves')
  })

  it('names the reason a cold rebuild was chosen instead', () => {
    // The cost worth naming every time: a silent 16 s where 3 ms was expected is
    // exactly the hidden cost ADR 0004 refuses.
    const text = renderAnalyse(
      analyseEnvelope({
        kind: 'cold',
        files: 4827,
        waves: 0,
        environment: [],
        reason: 'the index was built against TypeScript 7.0.1, not 7.0.2',
      }),
      plain,
    )
    expect(text).toContain('rebuilt cold (4827 files)')
    expect(text).toContain('not 7.0.2')
  })

  it('stays silent when the index needed nothing', () => {
    const text = renderAnalyse(analyseEnvelope(null), plain)
    expect(text).not.toContain('repaired')
    expect(text).not.toContain('rebuilt')
  })
})

describe('a traced path', () => {
  const site = (line: number, overrides: Partial<CallSite> = {}): CallSite => ({
    attribution: 'symbol',
    file: 'src/checkout.ts',
    line,
    provenance: 'deterministic',
    derivation: 'checker-signature',
    ...overrides,
  })

  const traced = (result: readonly TracePath[], depth = 5): string =>
    renderTrace(
      {
        operation: 'trace',
        schemaVersion: 1,
        request: { subject: 'checkout', resolved: ['a'], limit: null, depth },
        snapshot: { commit: 'abc1234', dirty: false, analysedAt: null },
        conditions: [],
        blindSpots: [],
        budget: {
          returned: result.length,
          available: result.length,
          truncated: false,
        },
        result,
      },
      plain,
    )

  it('prints every site of a step, collapsing the lines that share a file', () => {
    const out = traced([
      {
        root: 'a',
        steps: [{ to: 'b', sites: [site(3), site(9)] }],
        terminus: 'leaf',
      },
    ])
    expect(out).toContain('src/checkout.ts:3,9')
  })

  it('keeps two files apart within one step', () => {
    const out = traced([
      {
        root: 'a',
        steps: [
          { to: 'b', sites: [site(3), site(9, { file: 'src/other.ts' })] },
        ],
        terminus: 'leaf',
      },
    ])
    expect(out).toContain('src/checkout.ts:3  src/other.ts:9')
  })

  it('never merges sites whose honesty fields differ', () => {
    const out = traced([
      {
        root: 'a',
        steps: [
          {
            to: 'b',
            sites: [
              site(3),
              site(9, {
                provenance: 'inferred',
                derivation: 'jsx-element-rule',
              }),
            ],
          },
        ],
        terminus: 'leaf',
      },
    ])
    expect(out).toContain(
      'src/checkout.ts:3  src/checkout.ts:9 [inferred: jsx-element-rule]',
    )
  })

  it('indents one level per step, and the root none', () => {
    const out = traced([
      {
        root: 'a',
        steps: [
          { to: 'b', sites: [site(1)] },
          { to: 'c', sites: [site(2)] },
        ],
        terminus: 'leaf',
      },
    ])
    expect(out.split('\n').slice(0, 3)).toEqual([
      '  a',
      '    → b  src/checkout.ts:1',
      '      → c  src/checkout.ts:2',
    ])
  })

  it('prints a shared prefix once and keeps both tails', () => {
    const out = traced([
      {
        root: 'a',
        steps: [
          { to: 'b', sites: [site(1)] },
          { to: 'c', sites: [site(2)] },
        ],
        terminus: 'leaf',
      },
      {
        root: 'a',
        steps: [
          { to: 'b', sites: [site(1)] },
          { to: 'd', sites: [site(3)] },
        ],
        terminus: 'leaf',
      },
    ])
    expect(out.split('\n').filter((line) => line.includes('→ b'))).toHaveLength(
      1,
    )
    expect(out).toContain('→ c')
    expect(out).toContain('→ d')
  })

  it('says a root calls nothing, rather than leaving a bare id', () => {
    expect(traced([{ root: 'a', steps: [], terminus: 'leaf' }])).toContain(
      'calls nothing',
    )
  })

  it('marks the step that closed a loop', () => {
    const out = traced([
      {
        root: 'a',
        steps: [
          { to: 'b', sites: [site(1)] },
          { to: 'a', sites: [site(2)] },
        ],
        terminus: 'cycle',
      },
    ])
    expect(out).toContain('→ a  src/checkout.ts:2 ↺ cycle')
  })

  it('names the bound where it cut a branch, so the answer is not read as whole', () => {
    const out = traced(
      [
        {
          root: 'a',
          steps: [{ to: 'b', sites: [site(1)] }],
          terminus: 'depth',
        },
      ],
      1,
    )
    expect(out).toContain('⇣ more calls beyond depth 1')
  })

  it('flags a step the adapter inferred rather than observed', () => {
    const out = traced([
      {
        root: 'a',
        steps: [
          {
            to: 'b',
            sites: [
              site(6, {
                provenance: 'inferred',
                derivation: 'jsx-element-rule',
              }),
            ],
          },
        ],
        terminus: 'leaf',
      },
    ])
    expect(out).toContain('[inferred: jsx-element-rule]')
  })

  it('says plainly when a root produced no paths at all', () => {
    expect(traced([])).toContain('no paths')
  })
})
