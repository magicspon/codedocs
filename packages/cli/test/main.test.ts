/**
 * The CLI binding, exercised end to end.
 *
 * `run` returns rather than prints, so these are the same assertions an MCP
 * binding will need: the envelope carries the honesty fields whatever the
 * operation, and the exit code says "answered" or "could not answer" without a
 * caller having to parse the text.
 */

import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { run } from '../src/main.ts'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = join(here, '..', '..', 'core', 'test', 'fixtures', 'basic')
let root: string

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'codedocs-cli-'))
  cpSync(fixture, root, { recursive: true })
  cpSync(join(here, 'package.fixture.json'), join(root, 'package.json'))
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

const invoke = (...args: string[]): ReturnType<typeof run> =>
  run([...args, '--cwd', root, '--no-color'])

describe('argument handling', () => {
  it('prints usage and cannot answer when given nothing', () => {
    const result = run([])
    expect(result.code).toBe(2)
    expect(result.stderr).toContain('Usage:')
  })

  it('rejects an unknown operation rather than guessing', () => {
    expect(run(['explain', 'X']).code).toBe(2)
  })

  it('rejects a subject-less callers', () => {
    expect(run(['callers']).stderr).toContain('needs a subject')
  })

  it('rejects a limit that is not a non-negative integer', () => {
    expect(invoke('symbol', '*', '--limit', 'lots').code).toBe(2)
  })

  it('refuses `--depth` on an operation that has no depth', () => {
    // Ignoring it would let `callers --depth 2` read as a bounded walk.
    const result = invoke('callers', 'charge', '--depth', '2')
    expect(result.code).toBe(2)
    expect(result.stderr).toContain('--depth applies to `trace`')
  })
})

describe('the machine renderer', () => {
  it('answers with the envelope every operation owes', () => {
    const result = invoke('callers', 'charge', '--json')
    expect(result.code).toBe(0)

    const envelope = JSON.parse(result.stdout) as Record<string, unknown>
    for (const field of [
      'operation',
      'schemaVersion',
      'request',
      'snapshot',
      'conditions',
      'blindSpots',
      'budget',
      'result',
    ]) {
      expect(envelope).toHaveProperty(field)
    }
  })

  it('echoes the resolved subject, so an answer can be fed back in', () => {
    const envelope = JSON.parse(
      invoke('callers', 'charge', '--json').stdout,
    ) as {
      request: { resolved: string[] }
    }
    expect(envelope.request.resolved).toEqual(['src/payments.ts#charge'])

    // The resolved id round-trips: passing it back gives the same answer.
    const again = JSON.parse(
      invoke('callers', envelope.request.resolved[0] ?? '', '--json').stdout,
    ) as { request: { resolved: string[] } }
    expect(again.request.resolved).toEqual(envelope.request.resolved)
  })

  it('is unbounded by default, so an agent is never handed a silent cap', () => {
    const envelope = JSON.parse(invoke('symbol', '*', '--json').stdout) as {
      budget: { truncated: boolean; returned: number; available: number }
    }
    expect(envelope.budget.truncated).toBe(false)
    expect(envelope.budget.returned).toBe(envelope.budget.available)
  })

  it('is byte-identical when the same question is asked twice', () => {
    expect(invoke('symbol', '*', '--json').stdout).toBe(
      invoke('symbol', '*', '--json').stdout,
    )
  })
})

describe('trace', () => {
  it('answers with paths, unbounded until the caller says otherwise', () => {
    const envelope = JSON.parse(
      invoke('trace', 'checkout', '--json').stdout,
    ) as {
      request: { depth: number | null }
      result: { root: string; steps: unknown[]; terminus: string }[]
    }
    expect(envelope.request.depth).toBeNull()
    expect(envelope.result[0]?.root).toBe('src/checkout.ts#checkout')
    expect(envelope.result[0]?.steps.length).toBeGreaterThan(0)
  })

  it('echoes the bound the caller set', () => {
    const envelope = JSON.parse(
      invoke('trace', 'checkout', '--depth', '1', '--json').stdout,
    ) as { request: { depth: number | null } }
    expect(envelope.request.depth).toBe(1)
  })

  it('collapses the prefix two paths share, rather than repeating it', () => {
    const lines = invoke('trace', 'checkout').stdout.split('\n')
    // Both paths run through `charge`; it is printed once.
    expect(lines.filter((line) => line.includes('#charge'))).toHaveLength(1)
  })

  it('says where a walk closed a loop', () => {
    expect(invoke('trace', 'ping').stdout).toContain('cycle')
  })

  it('is byte-identical across two walks of the same index', () => {
    // The walk itself is in graph order; only the sort makes the answer stable.
    expect(invoke('trace', 'checkout', '--json').stdout).toBe(
      invoke('trace', 'checkout', '--json').stdout,
    )
  })

  it('says there is more beyond the bound the caller set', () => {
    expect(invoke('trace', 'checkout', '--depth', '1').stdout).toContain(
      'beyond depth 1',
    )
  })
})

describe('the human renderer', () => {
  it('caps by default and says how many it withheld', () => {
    const result = invoke('symbol', '*', '--limit', '2')
    expect(result.stdout).toContain('showing 2 of')
  })

  it('distinguishes an empty answer from a subject that matched nothing', () => {
    expect(invoke('callers', 'NoSuchSymbol').stdout).toContain(
      '`NoSuchSymbol` matched no symbol',
    )
    // `twice` resolves and simply has no callers.
    expect(invoke('callers', 'twice').stdout).toContain('no call edges')
  })

  it('marks an edge the adapter inferred rather than observed', () => {
    // The JSX call is produced by the adapter's own rule, so it must never read
    // as a checked one.
    expect(invoke('callers', 'Badge').stdout).toContain('jsx-element-rule')
  })

  it('marks a call credited to the variable it initialises', () => {
    expect(invoke('callers', 'checkout').stdout).toContain('(variable)')
  })
})
