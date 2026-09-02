/**
 * The CLI binding, exercised end to end.
 *
 * `run` returns rather than prints, so these are the same assertions an MCP
 * binding will need: the envelope carries the honesty fields whatever the
 * operation, and the exit code says "answered" or "could not answer" without a
 * caller having to parse the text.
 */

import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

// cspell:ignore exlucde — a deliberate typo; refusing it is the point

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

  it('carries the schema version the error shape belongs to', () => {
    const envelope = JSON.parse(invoke('symbol', '*', '--json').stdout) as {
      schemaVersion: number
    }
    expect(envelope.schemaVersion).toBe(4)
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

describe('references', () => {
  it('answers with the envelope, and names both ends of each edge', () => {
    const envelope = JSON.parse(
      invoke('references', 'Gateway', '--json').stdout,
    ) as {
      operation: string
      result: { from: string; to: string; kind: string }[]
    }
    expect(envelope.operation).toBe('references')
    expect(envelope.result[0]).toMatchObject({
      from: 'src/payments.ts#StripeGateway',
      to: 'src/payments.ts#Gateway',
      kind: 'implements',
    })
  })

  it('reports a relationship the call operations cannot', () => {
    // `Gateway` is implemented and never called: the two halves of the
    // relationship set, kept apart.
    expect(invoke('callers', 'Gateway').stdout).toContain('no call edges')
    expect(invoke('references', 'Gateway').stdout).toContain('implements')
  })

  it('is byte-identical when the same question is asked twice', () => {
    expect(invoke('references', 'Gateway', '--json').stdout).toBe(
      invoke('references', 'Gateway', '--json').stdout,
    )
  })
})

describe('file', () => {
  it('reports one file’s projects, symbols, imports and importers', () => {
    const envelope = JSON.parse(
      invoke('file', 'src/checkout.ts', '--json').stdout,
    ) as {
      result: {
        path: string
        projects: string[]
        canonicalProject: string
        symbols: unknown[]
        imports: unknown[]
        importers: string[]
      }[]
    }
    const report = envelope.result[0]
    expect(report?.path).toBe('src/checkout.ts')
    expect(report?.projects).toEqual(['tsconfig.json'])
    expect(report?.canonicalProject).toBe('tsconfig.json')
    expect(report?.symbols.length).toBeGreaterThan(0)
    expect(report?.imports.length).toBeGreaterThan(0)
  })

  it('accepts the tail of a path, as it prints one', () => {
    expect(invoke('file', 'checkout.ts').stdout).toContain('src/checkout.ts')
  })

  it('says plainly when the index holds no such file', () => {
    const result = invoke('file', 'src/nowhere.ts')
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('`src/nowhere.ts` matched no file')
  })
})

describe('the scope channel', () => {
  it('echoes the scope it applied on every answer', () => {
    const envelope = JSON.parse(invoke('symbol', '*', '--json').stdout) as {
      request: {
        scope: {
          include: { axis: string; value: string }[]
          exclude: unknown[]
          excluded: number
        }
      }
    }
    expect(envelope.request.scope.include).toEqual([
      { axis: 'authorship', value: 'authored' },
    ])
    expect(envelope.request.scope.exclude).toEqual([])
  })

  it('filters by label, and reports the count rather than a blind spot', () => {
    const envelope = JSON.parse(
      invoke('symbol', '*', '--exclude-label', 'role=test', '--json').stdout,
    ) as {
      request: { scope: { excluded: number } }
      blindSpots: unknown[]
    }
    expect(envelope.request.scope.excluded).toBeGreaterThanOrEqual(0)
    expect(envelope.blindSpots).toEqual([])
  })

  it('refuses a filter it does not know rather than matching nothing', () => {
    const result = invoke('symbol', '*', '--label', 'role=nope')
    expect(result.code).toBe(2)
    expect(result.stderr).toContain('--label takes `axis=value`')
  })

  it('takes one flag per axis, because the axes are orthogonal', () => {
    const envelope = JSON.parse(
      invoke(
        'symbol',
        '*',
        '--label',
        'role=source',
        '--label',
        'authorship=authored',
        '--json',
      ).stdout,
    ) as { request: { scope: { include: { axis: string }[] } } }
    expect(envelope.request.scope.include.map((one) => one.axis)).toEqual([
      'role',
      'authorship',
    ])
  })
})

describe('doctor', () => {
  it('exits 1 for a cause a command would clear', () => {
    // The fixture has no `node_modules`, which is signal 1 and remediable.
    const result = invoke('doctor')

    expect(result.code).toBe(1)
    expect(result.stdout).toContain('tsconfig.json')
    expect(result.stdout).toContain('unprepared')
  })

  it('reports what the label layer decided', () => {
    const envelope = JSON.parse(invoke('doctor', '--json').stdout) as {
      classification: {
        counts: { role: string; authorship: string; files: number }[]
      }
    }
    expect(envelope.classification.counts.length).toBeGreaterThan(0)
    expect(invoke('doctor').stdout).toContain('classification')
  })

  it('carries the header and the whole set in the envelope', () => {
    const envelope = JSON.parse(invoke('doctor', '--json').stdout) as {
      operation: string
      header: { toolVersion: string; projects: number }
      remediable: number
      measured: unknown
      result: { project: string; cause: string }[]
    }

    expect(envelope.operation).toBe('doctor')
    expect(envelope.header.projects).toBe(1)
    expect(envelope.remediable).toBe(1)
    // Absent unless it was asked for: a diagnostic is never a hidden cost.
    expect(envelope.measured).toBeNull()
    expect(envelope.result[0]?.cause).toBe('unprepared')
  })

  it('names where the working tree disagrees with the index, when asked', () => {
    expect(invoke('doctor', '--measure').stdout).toContain('working tree')
  })

  it('refuses `--measure` on an operation that does not take it', () => {
    const result = invoke('symbol', '*', '--measure')

    expect(result.code).toBe(2)
    expect(result.stderr).toContain('--measure applies to `doctor`')
  })

  it('is byte-identical when the same question is asked twice', () => {
    expect(invoke('doctor', '--json').stdout).toBe(
      invoke('doctor', '--json').stdout,
    )
  })
})

describe('doctor over a repository with nothing to clear', () => {
  let prepared: string

  beforeAll(() => {
    prepared = mkdtempSync(join(tmpdir(), 'codedocs-doctor-'))
    cpSync(fixture, prepared, { recursive: true })
    cpSync(join(here, 'package.fixture.json'), join(prepared, 'package.json'))
    // Installed, so signal 1 is met; the only finding left is an import that
    // names nothing, which no command would fix.
    mkdirSync(join(prepared, 'node_modules', 'left-pad'), { recursive: true })
    writeFileSync(
      join(prepared, 'node_modules', 'left-pad', 'index.d.ts'),
      'export {}\n',
    )
    writeFileSync(
      join(prepared, 'src', 'app.ts'),
      "import './nowhere'\nexport const app = (): number => 1\n",
    )
  })

  afterAll(() => {
    rmSync(prepared, { recursive: true, force: true })
  })

  it('exits 0, because a red build that cannot be cleared is noise', () => {
    const result = run(['doctor', '--cwd', prepared, '--no-color'])

    expect(result.code).toBe(0)
    // Reported all the same: exit 0 is not silence.
    expect(result.stdout).toContain('broken')
  })
})

describe('codedocs.jsonc', () => {
  const config = () => join(root, 'codedocs.jsonc')

  afterEach(() => {
    rmSync(config(), { force: true })
  })

  it('is absent by default, and nothing is said about it', () => {
    const result = invoke('symbol', '*', '--json')

    expect(result.code).toBe(0)
    expect(result.stderr).toBe('')
  })

  it('cannot answer when the file exists and is wrong', () => {
    writeFileSync(config(), '{"baselines": "three"}\n')
    const result = invoke('symbol', '*')

    expect(result.code).toBe(2)
    expect(result.stderr).toContain(
      'config-invalid: codedocs.jsonc: `baselines` must be a non-negative integer',
    )
  })

  it('carries the refusal in the envelope, so `--json` still parses', () => {
    writeFileSync(config(), '{"exlucde": []}\n')
    const result = invoke('symbol', '*', '--json')

    expect(result.code).toBe(2)
    const envelope = JSON.parse(result.stdout) as {
      error: {
        code: string
        params: { key: string; expectation: string }
        message?: string
      }
      result?: unknown
    }
    expect(envelope.error.code).toBe('config-invalid')
    // ADR 0011: the key is a typed parameter, not a word inside a sentence.
    expect(envelope.error.params.key).toBe('exlucde')
    expect(envelope.error.message).toBeUndefined()
    // ADR 0006: `error` is carried instead of `result`, never beside it.
    expect(envelope.result).toBeUndefined()
  })

  it('prints the same sentence it always did, from the code and parameters', () => {
    writeFileSync(config(), '{"exlucde": []}\n')

    expect(invoke('symbol', '*').stderr).toContain(
      'config-invalid: codedocs.jsonc: `exlucde` is not a key codedocs knows',
    )
  })

  it('does not fall back to the defaults on a file it refused', () => {
    writeFileSync(config(), '{"baselines": -1}\n')

    expect(invoke('symbol', '*').stdout).toBe('')
  })
})
