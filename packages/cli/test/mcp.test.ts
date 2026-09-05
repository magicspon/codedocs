/**
 * The MCP binding, held to ADR 0006's rule rather than to a happy path.
 *
 * One tool per operation, same name, same arguments, the machine envelope
 * verbatim, and no tool that is not an operation. Each half of that is a case
 * here, because each half is a thing Phase 4 could quietly stop being true.
 */

import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PassThrough } from 'node:stream'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { OPERATIONS, toolName } from '@codedocs/core'

import { run } from '../src/main.ts'
import { handle, serve, tools } from '../src/mcp.ts'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = join(here, '..', '..', 'core', 'test', 'fixtures', 'basic')
let root: string

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'codedocs-mcp-'))
  cpSync(fixture, root, { recursive: true })
  cpSync(join(here, 'package.fixture.json'), join(root, 'package.json'))
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

/** One request in, one decoded reply out. `null` where nothing is owed. */
function ask(request: unknown): Record<string, unknown> | null {
  const answer = handle(JSON.stringify(request))
  return answer === null
    ? null
    : (JSON.parse(answer) as Record<string, unknown>)
}

const call = (
  name: string,
  args: Record<string, unknown>,
): Record<string, unknown> | null =>
  ask({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name, arguments: { ...args, cwd: root } },
  })

const resultOf = (
  reply: Record<string, unknown> | null,
): Record<string, unknown> =>
  (reply?.['result'] ?? {}) as Record<string, unknown>

const errorOf = (
  reply: Record<string, unknown> | null,
): Record<string, unknown> =>
  (reply?.['error'] ?? {}) as Record<string, unknown>

const textOf = (reply: Record<string, unknown> | null): string =>
  (resultOf(reply)['content'] as { text: string }[] | undefined)?.[0]?.text ??
  ''

describe('the tool list', () => {
  it('is exactly the operation set, one to one', () => {
    // Derived from the manifest the CLI parser reads, so this holds for an
    // operation nobody has written yet. A convenience tool would fail here, and
    // so would an operation that reached only the CLI.
    expect((tools() as { name: string }[]).map((tool) => tool.name)).toEqual(
      OPERATIONS.map(toolName),
    )
  })

  it('names each subject the way the operation names it', () => {
    const schemas = new Map(
      (tools() as { name: string; inputSchema: { required: string[] } }[]).map(
        (tool) => [tool.name, tool.inputSchema.required],
      ),
    )
    expect(schemas.get('symbol')).toEqual(['pattern'])
    expect(schemas.get('trace')).toEqual(['root'])
    expect(schemas.get('callers')).toEqual(['subject'])
    // `analyse` takes none, and says so rather than taking an ignored one.
    expect(schemas.get('analyse')).toEqual([])
  })

  it('gives ADR 0014’s six batched operations an array-typed subject, and every other operation a string one', () => {
    const types = new Map(
      (
        tools() as {
          name: string
          inputSchema: { properties: Record<string, { type: string }> }
        }[]
      ).map((tool) => [tool.name, tool.inputSchema.properties]),
    )
    expect(types.get('callers')?.['subject']?.type).toBe('array')
    expect(types.get('symbol')?.['pattern']?.type).toBe('array')
    expect(types.get('file')?.['path']?.type).toBe('array')
    expect(types.get('evidence')?.['subject']?.type).toBe('array')
    // `trace` and `docs_draft` take exactly one subject, never a batch.
    expect(types.get('trace')?.['root']?.type).toBe('string')
    expect(types.get('docs_draft')?.['subject']?.type).toBe('string')
  })

  it('takes a variadic subject as a list, not as a string to be split again', () => {
    const tool = (
      tools() as {
        name: string
        inputSchema: {
          required: string[]
          properties: Record<string, { type: string }>
        }
      }[]
    ).find((entry) => entry.name === 'report-bug')
    expect(tool?.inputSchema.required).toEqual(['command'])
    expect(tool?.inputSchema.properties['command']?.type).toBe('array')
    // Its per-operation flags reach this binding from the same manifest, so it
    // has nothing of its own to forget.
    expect(tool?.inputSchema.properties['with-repository']?.type).toBe(
      'boolean',
    )
    expect(tool?.inputSchema.properties['out']?.type).toBe('string')
  })

  it('offers `depth` only where the operation has one', () => {
    const properties = argumentsByTool()
    expect(properties.get('trace')).toContain('depth')
    expect(properties.get('callers')).not.toContain('depth')
  })

  it('carries every operation’s selection advice into its description', () => {
    // The manifest requires `selection`, so the only way it can be missing from
    // an agent's view is this binding dropping it.
    const descriptions = new Map(
      (tools() as { name: string; description: string }[]).map((tool) => [
        tool.name,
        tool.description,
      ]),
    )
    for (const spec of OPERATIONS) {
      expect(descriptions.get(toolName(spec))).toContain(spec.selection)
    }
  })

  it('offers `claims` only on the operation that produces them', () => {
    // ADR 0006 keeps claim expressions to `evidence` for now, and a per-operation
    // flag is refused elsewhere rather than accepted and dropped.
    const properties = argumentsByTool()
    expect(properties.get('evidence')).toContain('claims')
    expect(properties.get('callers')).not.toContain('claims')
  })
})

/** Every tool's argument names, for the assertions that check one is absent. */
const argumentsByTool = (): Map<string, string[]> =>
  new Map(
    (
      tools() as {
        name: string
        inputSchema: { properties: Record<string, unknown> }
      }[]
    ).map((tool) => [tool.name, Object.keys(tool.inputSchema.properties)]),
  )

describe('the handshake', () => {
  it('answers with a version and the one capability codedocs has', () => {
    const result = resultOf(
      ask({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    )
    expect(result['protocolVersion']).toBe('2025-06-18')
    // Tools and nothing else: a declared capability is a promise.
    expect(result['capabilities']).toEqual({ tools: {} })
  })

  it('says nothing back to a notification', () => {
    expect(
      ask({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    ).toBeNull()
  })

  it('refuses a method it does not implement, rather than answering emptily', () => {
    expect(
      errorOf(ask({ jsonrpc: '2.0', id: 1, method: 'resources/list' }))['code'],
    ).toBe(-32601)
  })

  it('reports a line that is not a request', () => {
    expect(
      (JSON.parse(handle('{oh dear') ?? '{}') as { error: { code: number } })
        .error.code,
    ).toBe(-32700)
    expect(
      (JSON.parse(handle('[1,2,3]') ?? '{}') as { error: { code: number } })
        .error.code,
    ).toBe(-32600)
  })
})

describe('a tool call', () => {
  it('returns the bytes `--json` produces, and nothing around them', () => {
    const viaMcp = textOf(call('callers', { subject: ['charge'] }))
    const viaCli = run([
      'callers',
      'charge',
      '--json',
      '--no-color',
      '--cwd',
      root,
    ])
    expect(viaMcp).toBe(viaCli.stdout)
    // Verbatim means verbatim: the envelope is the whole payload, not a field of
    // something this binding invented. `callers` is one of ADR 0014's six
    // batched operations, so `blindSpots` lives on the one entry, not the top.
    const envelope = JSON.parse(viaMcp) as { result: unknown[] }
    expect(envelope.result[0]).toHaveProperty('blindSpots')
  })

  it('passes the caller`s bounds through unchanged', () => {
    const envelope = JSON.parse(
      textOf(call('trace', { root: 'checkout', depth: 1 })),
    ) as { request: { depth: number }; operation: string }
    expect(envelope.operation).toBe('trace')
    expect(envelope.request.depth).toBe(1)
  })

  it('reads a subject that begins with a hyphen as a subject', () => {
    // Sent after `--`, so it cannot be mistaken for an unknown flag — which is
    // the difference between an empty answer and a refusal.
    const envelope = JSON.parse(
      textOf(call('symbol', { pattern: ['-nope'] })),
    ) as {
      request: { subjects: string[] }
      result: { subject: string; result: unknown[] }[]
    }
    expect(envelope.request.subjects).toEqual(['-nope'])
    expect(envelope.result[0]?.result).toEqual([])
  })

  it('reproduces a failure and hands back the report, writing no file', () => {
    // `out: '-'` is the shape an agent uses: the report comes back in the
    // answer rather than as a file it would then have to read.
    const envelope = JSON.parse(
      textOf(call('report-bug', { command: ['symbol', 'nope'], out: '-' })),
    ) as {
      operation: string
      result: { repositoryFacts: string; reproduction: { operation: string } }
    }
    expect(envelope.operation).toBe('report-bug')
    expect(envelope.result.repositoryFacts).toBe('excluded')
    expect(envelope.result.reproduction.operation).toBe('symbol')
  })

  it('refuses a variadic subject that is not a list of strings', () => {
    expect(
      errorOf(call('report-bug', { command: 'symbol *' }))['message'],
    ).toContain('must be an array of strings')
  })

  it('refuses a tool that is not an operation', () => {
    // `review` is not pending: ADR 0012 deleted it, so it can never become one.
    const failure = errorOf(call('review', {}))
    expect(failure['code']).toBe(-32602)
    expect(failure['message']).toContain('unknown tool')
  })

  it('refuses an argument the operation does not have', () => {
    // `--depth` on `callers` is refused at the CLI for the same reason: a bound
    // silently ignored reads as a bound that was applied.
    const failure = errorOf(call('callers', { subject: ['charge'], depth: 2 }))
    expect(failure['code']).toBe(-32602)
    expect(failure['message']).toContain('no argument `depth`')
  })

  it('refuses an argument of the wrong type', () => {
    expect(
      errorOf(call('symbol', { pattern: ['*'], limit: 'lots' }))['code'],
    ).toBe(-32602)
    expect(
      errorOf(call('symbol', { pattern: ['*'], 'no-update': 'yes' }))['code'],
    ).toBe(-32602)
  })

  it('refuses a subject-less call to an operation that needs one', () => {
    expect(errorOf(call('callers', {}))['code']).toBe(-32602)
    // An empty list is the same absence a variadic subject refuses.
    expect(errorOf(call('callers', { subject: [] }))['code']).toBe(-32602)
    expect(errorOf(call('report-bug', { command: [] }))['code']).toBe(-32602)
  })

  it('takes a call with no arguments at all for an operation that needs none', () => {
    // Omitting `arguments` also omits `cwd`, so the call runs against the
    // working directory. Standing in the fixture keeps that a four-file build
    // rather than a cold index of whatever repository the suite was started in.
    const standing = process.cwd()
    process.chdir(root)
    try {
      // `analyse` has no subject, so an omitted `arguments` is a complete call.
      const reply = ask({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'analyse' },
      })
      expect(resultOf(reply)['isError']).toBe(false)
    } finally {
      process.chdir(standing)
    }
  })

  it('refuses `arguments` that is not an object', () => {
    const failure = errorOf(
      ask({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'analyse', arguments: 'charge' },
      }),
    )
    expect(failure['message']).toContain('`arguments` must be an object')
  })

  it('refuses a tool call naming no tool at all', () => {
    const failure = errorOf(
      ask({ jsonrpc: '2.0', id: 1, method: 'tools/call' }),
    )
    expect(failure['message']).toContain('unknown tool ``')
  })

  it('refuses a bound below the one its schema declares', () => {
    const failure = errorOf(call('symbol', { pattern: ['*'], limit: -1 }))
    expect(failure['message']).toContain('must be at least')
  })

  it('spells a boolean as the flag alone, and a false one as nothing', () => {
    // `--no-update false` is not a thing the parser accepts; the absence of the
    // flag is how "off" is spelled.
    const off = JSON.parse(
      textOf(call('symbol', { pattern: ['charge'], 'no-update': false })),
    ) as { request: { limit: number | null } }
    expect(off.request.limit).toBeNull()

    const on = textOf(
      call('symbol', { pattern: ['charge'], 'no-update': true }),
    )
    expect(on).toContain('"operation"')
  })

  it('spells a repeatable flag once per value, so two filters stay two', () => {
    const envelope = JSON.parse(
      textOf(
        call('symbol', {
          pattern: ['*'],
          label: ['role=source', 'authorship=authored'],
        }),
      ),
    ) as { request: { scope: { include: readonly unknown[] } } }
    expect(envelope.request.scope.include).toHaveLength(2)
  })

  it('refuses a subject that is not an array of strings', () => {
    expect(errorOf(call('callers', { subject: 12 }))['code']).toBe(-32602)
  })

  it('marks an answer that could not be given', () => {
    // Exit 2 is the one case with no envelope to carry the reason, so it comes
    // back as a tool error rather than as an answer.
    const result = resultOf(
      ask({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'symbol',
          arguments: { pattern: ['*'], cwd: '/definitely/not/a/tree' },
        },
      }),
    )
    expect(result['isError']).toBe(true)
  })
})

describe('the stdio transport', () => {
  it('answers one message per line, and only the ones that owe a reply', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const written: string[] = []
    output.on('data', (chunk: Buffer) => written.push(chunk.toString()))

    const serving = serve(input, output)
    input.write('{"jsonrpc":"2.0","id":1,"method":"ping"}\n')
    input.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n')
    // Split across two chunks, because a stream is not a message boundary.
    const split = '{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n'
    input.write(split.slice(0, 20))
    input.write(split.slice(20))
    // No trailing newline on the last one, which is still a message.
    input.end('{"jsonrpc":"2.0","id":3,"method":"ping"}')
    await serving

    const replies = written
      .join('')
      .trimEnd()
      .split('\n')
      .map((line) => JSON.parse(line) as { id: number })
    expect(replies.map((reply) => reply.id)).toEqual([1, 2, 3])
  })
})
