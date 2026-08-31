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

describe('the human renderer', () => {
  it('caps by default and says how many it withheld', () => {
    const result = invoke('symbol', '*', '--limit', '2')
    expect(result.stdout).toContain('showing 2 of')
  })

  it('says so plainly when there is nothing to show', () => {
    expect(invoke('callers', 'NoSuchSymbol').stdout).toContain('no call edges')
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
