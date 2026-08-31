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

import { OPERATIONS } from '@codedocs/core'

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
      OPERATIONS.map((operation) => operation.name),
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

  it('offers `depth` only where the operation has one', () => {
    const properties = new Map(
      (
        tools() as {
          name: string
          inputSchema: { properties: Record<string, unknown> }
        }[]
      ).map((tool) => [tool.name, Object.keys(tool.inputSchema.properties)]),
    )
    expect(properties.get('trace')).toContain('depth')
    expect(properties.get('callers')).not.toContain('depth')
  })
})

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
    const viaMcp = textOf(call('callers', { subject: 'charge' }))
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
    // something this binding invented.
    expect(JSON.parse(viaMcp)).toHaveProperty('blindSpots')
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
      textOf(call('symbol', { pattern: '-nope' })),
    ) as {
      request: { subject: string }
      result: unknown[]
    }
    expect(envelope.request.subject).toBe('-nope')
    expect(envelope.result).toEqual([])
  })

  it('refuses a tool that is not an operation', () => {
    const failure = errorOf(call('impact', {}))
    expect(failure['code']).toBe(-32602)
    expect(failure['message']).toContain('unknown tool')
  })

  it('refuses an argument the operation does not have', () => {
    // `--depth` on `callers` is refused at the CLI for the same reason: a bound
    // silently ignored reads as a bound that was applied.
    const failure = errorOf(call('callers', { subject: 'charge', depth: 2 }))
    expect(failure['code']).toBe(-32602)
    expect(failure['message']).toContain('no argument `depth`')
  })

  it('refuses an argument of the wrong type', () => {
    expect(
      errorOf(call('symbol', { pattern: '*', limit: 'lots' }))['code'],
    ).toBe(-32602)
    expect(
      errorOf(call('symbol', { pattern: '*', 'no-update': 'yes' }))['code'],
    ).toBe(-32602)
  })

  it('refuses a subject-less call to an operation that needs one', () => {
    expect(errorOf(call('callers', {}))['code']).toBe(-32602)
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
          arguments: { pattern: '*', cwd: '/definitely/not/a/tree' },
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
