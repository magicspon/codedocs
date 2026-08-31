/**
 * The honesty footer, asserted directly on hand-built envelopes.
 *
 * The end-to-end tests in `main.test.ts` can only produce the states the fixture
 * happens to be in, so blind spots, ambiguity, syntactic fidelity and a dirty
 * snapshot are exercised here — they are exactly the notes ADR 0006 forbids the
 * renderer to omit, so they need a test that can put the envelope in that state.
 */

import { describe, expect, it } from 'vitest'
import type { Envelope, SymbolNode } from '@codedocs/core'

import { renderError, renderSymbols, styleFor } from '../src/render.ts'

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
        },
        {
          project: 'apps/web/tsconfig.json',
          fidelity: 'syntactic',
          analysedAt: '2026-01-01T00:00:00Z',
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
