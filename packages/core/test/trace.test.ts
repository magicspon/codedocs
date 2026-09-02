/**
 * `trace` — the walk, its bounds, and what it says when it stops.
 *
 * Every assertion here is about the shape of the answer rather than about the
 * call graph: the graph is `callers`' and `callees`' business, already covered.
 * What is new is that a *path* is the result unit, that a cycle is reported
 * rather than cut, and that a bound the caller did not name is still in the
 * answer.
 */

import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { UNSCOPED } from '../src/labels/index.ts'
import { openSession, type Session } from '../src/session/index.ts'
import { trace, type TracePath } from '../src/operations/trace.ts'
import { shorthandOf } from '../src/symbol-id.ts'

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'basic',
)
let root: string
let session: Session

// One index for the whole file: nothing here writes to the tree, so a build per
// test would pay for an analysis four times over to assert on the same rows.
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'codedocs-trace-'))
  cpSync(fixture, root, { recursive: true })
  writeFileSync(
    join(root, 'package.json'),
    '{"name":"fixture","private":true}\n',
  )
  session = openSession({ cwd: root, noUpdate: false })
})

afterAll(() => {
  session.close()
  rmSync(root, { recursive: true, force: true })
})

/** Trace one root, unbounded unless a test names a depth. */
const paths = (
  subject: string,
  depth: number | null = null,
): readonly TracePath[] =>
  trace(session.store, session.context, subject, null, depth, UNSCOPED)
    .result ?? []

/**
 * A path written the way the sort key reads it, which is how a test can name
 * one — in ADR 0005's shorthand, which is the form the human renderer prints.
 */
const sequenceOf = (path: TracePath): string =>
  [path.root, ...path.steps.map((step) => step.to)].map(shorthandOf).join(' → ')

describe('the walk', () => {
  it('returns a path per branch, not an edge per hop', () => {
    const traced = paths('checkout')
    expect(traced.map(sequenceOf)).toEqual([
      'src/checkout.ts#checkout → src/payments.ts#charge → src/payments.ts#StripeGateway',
      'src/checkout.ts#checkout → src/payments.ts#charge → src/payments.ts#StripeGateway.capture',
    ])
    expect(traced.every((path) => path.terminus === 'leaf')).toBe(true)
  })

  it('sorts lexically on the `SymbolId` sequence', () => {
    const sequences = paths('checkout').map(sequenceOf)
    expect(sequences).toEqual([...sequences].sort())
  })

  it('answers a root that calls nothing with one path of no steps', () => {
    const traced = paths('StripeGateway.capture')
    expect(traced).toHaveLength(1)
    expect(traced[0]?.steps).toEqual([])
    expect(traced[0]?.terminus).toBe('leaf')
  })

  it('has nothing to trace from a subject that resolves to nothing', () => {
    const envelope = trace(
      session.store,
      session.context,
      'NoSuchSymbol',
      null,
      null,
      UNSCOPED,
    )
    expect(envelope.request.resolved).toEqual([])
    expect(envelope.result).toEqual([])
  })

  it('groups two sites for one step rather than forking the path', () => {
    // `twice` calls `countdown` on two lines. That is one step in the graph and
    // two facts about it, so splitting it would double a path set per call site.
    const step = paths('twice')[0]?.steps[0]
    expect(shorthandOf(step?.to ?? '')).toBe('src/recursion.ts#countdown')
    expect(step?.sites.map((site) => site.line)).toEqual([17, 18])
  })
})

describe('cycles', () => {
  it('closes a direct loop and says so, keeping the step that closed it', () => {
    const traced = paths('countdown')
    expect(traced).toHaveLength(1)
    expect(sequenceOf(traced[0] as TracePath)).toBe(
      'src/recursion.ts#countdown → src/recursion.ts#countdown',
    )
    expect(traced[0]?.terminus).toBe('cycle')
  })

  it('closes a mutual loop two steps out', () => {
    const traced = paths('ping')
    expect(sequenceOf(traced[0] as TracePath)).toBe(
      'src/recursion.ts#ping → src/recursion.ts#pong → src/recursion.ts#ping',
    )
    expect(traced[0]?.terminus).toBe('cycle')
  })

  it('terminates without the depth bound having to catch it', () => {
    // A cycle the bound stopped would be reported as `depth`, which claims there
    // is more to see. Traced with room to spare, the terminus must still be the
    // loop.
    expect(paths('ping', 50)[0]?.terminus).toBe('cycle')
  })
})

describe('the depth bound', () => {
  it('stops at the bound and names the branch it cut', () => {
    const traced = paths('checkout', 1)
    expect(traced).toHaveLength(1)
    expect(traced[0]?.steps).toHaveLength(1)
    expect(traced[0]?.terminus).toBe('depth')
  })

  it('returns the root alone at zero, rather than nothing', () => {
    const traced = paths('checkout', 0)
    expect(traced[0]?.steps).toEqual([])
    expect(traced[0]?.terminus).toBe('depth')
  })

  it('reports a leaf as a leaf even where the bound had run out', () => {
    // `capture` calls nothing, so `depth` would claim a branch was cut.
    expect(paths('StripeGateway.capture', 0)[0]?.terminus).toBe('leaf')
  })

  it('echoes the bound the caller set, so a bounded answer cannot read as a whole one', () => {
    const bounded = trace(
      session.store,
      session.context,
      'checkout',
      null,
      2,
      UNSCOPED,
    )
    expect(bounded.request.depth).toBe(2)
  })

  it('applies no bound of its own, so `depth` never appears uninvited', () => {
    // A default depth would change which paths *exist*, not merely how many are
    // shown, which is the one thing ADR 0006 will not let an operation do
    // silently. Measured affordable: see `trace`.
    const envelope = trace(
      session.store,
      session.context,
      'checkout',
      null,
      null,
      UNSCOPED,
    )
    expect(envelope.request.depth).toBeNull()
    expect(envelope.result?.some((path) => path.terminus === 'depth')).toBe(
      false,
    )
  })
})
