/**
 * The MCP binding: one tool per operation, over the same envelope.
 *
 * ADR 0006 fixed the rule before the server existed — **one tool per operation,
 * same name, same arguments, returning the machine envelope verbatim, and no
 * tool that is not an operation** — because without it Phase 4 grows convenience
 * tools and settled constraint 3 quietly becomes false.
 *
 * Two things make that checkable rather than aspirational. The tool list is
 * derived from the same manifest the CLI parser reads, so an operation cannot
 * reach one binding and miss the other. And a call is answered by handing an
 * argv to `run`, the same function `codedocs` itself calls, so the bytes are the
 * bytes `--json` produces by construction rather than by inspection.
 *
 * `mcp` is **not an operation**. It owes no envelope, it appears in no tool list,
 * and nothing here composes or summarises an answer.
 */

import type { Readable, Writable } from 'node:stream'

import { OPERATIONS, toolName, type OperationSpec } from '@codedocs/core'

import { run } from './main.ts'

/**
 * The revision of MCP this server implements.
 *
 * A client asking for a different one is answered with this rather than refused:
 * the spec makes version selection the server's reply, and the client decides
 * whether it can live with the answer.
 */
const PROTOCOL_VERSION = '2025-06-18'

const SERVER_INFO = { name: 'codedocs', version: '0.0.0' } as const

/** JSON-RPC 2.0, the subset an MCP stdio server needs. */
interface Request {
  readonly jsonrpc: '2.0'
  /** Absent for a notification, which is never answered. */
  readonly id?: string | number | null
  readonly method: string
  readonly params?: Record<string, unknown>
}

interface Failure {
  readonly code: number
  readonly message: string
}

/** A JSON Schema fragment for one tool argument. */
interface ArgumentSchema {
  readonly type: 'string' | 'integer' | 'boolean' | 'array'
  readonly minimum?: number
  /** Present for `array` alone, which codedocs only ever uses for strings. */
  readonly items?: { readonly type: 'string' }
  readonly description: string
}

/**
 * The global flags every operation accepts, as tool arguments.
 *
 * Named exactly as the flags are spelled, because "same arguments" is the rule
 * and a translated name is one more thing that can disagree. `--json` is absent
 * because it is not optional here, and `--color` because a server's stdout is a
 * protocol stream.
 */
const GLOBAL_ARGUMENTS: Readonly<Record<string, ArgumentSchema>> = {
  limit: {
    type: 'integer',
    minimum: 0,
    description:
      'Cap the number of results. Omitted means unbounded — you own your ' +
      'context budget, and `budget.truncated` says whether a cap was hit.',
  },
  cwd: {
    type: 'string',
    description:
      'Run against another directory. Defaults to the working directory the ' +
      'server was started in.',
  },
  'no-update': {
    type: 'boolean',
    description:
      'Answer from the stored snapshot instead of bringing the index up to ' +
      'date first. The drifted files are then named in `blindSpots`.',
  },
  label: {
    type: 'array',
    items: { type: 'string' },
    description:
      'Keep only results whose file carries this label, as `axis=value`: ' +
      '`role=source|test|config` or `authorship=authored|generated`. The ' +
      'default is `authorship=authored` with no filter on role. Repeatable, ' +
      'one per axis; `request.scope` echoes what was applied and how many ' +
      'results it excluded.',
  },
  'exclude-label': {
    type: 'array',
    items: { type: 'string' },
    description:
      'Drop results whose file carries this label, in the same `axis=value` ' +
      'form. An exclusion is a count in `request.scope`, never a blind spot: ' +
      'codedocs knows exactly what it withheld.',
  },
}

/** The `depth` argument, added only for the operations the manifest says take it. */
const DEPTH_ARGUMENT: ArgumentSchema = {
  type: 'integer',
  minimum: 0,
  description:
    'Cap the steps per path. Omitted walks until every path ends, which is ' +
    'measured rather than assumed to be safe.',
}

/**
 * What one operation looks like to an agent that has only the tool list to go on.
 *
 * The result unit and the sort key are part of ADR 0006's contract, not
 * implementation detail, so they are stated here: a caller that knows the order
 * is total can page through an answer instead of re-asking for it.
 *
 * `selection` closes the gap that leaves. Everything else here says what the
 * operation answers and in what shape; an agent choosing between twelve tools
 * also needs to know when this one is the wrong question, so the manifest's
 * advice is appended last, where a reader who stopped early has still read the
 * contract.
 */
function describe(spec: OperationSpec): string {
  const call = `\`codedocs ${spec.name}${invocationSuffix(spec)} --json\``
  const opening = [
    `${spec.summary}.`,
    `Returns the codedocs answer envelope as JSON — the same bytes ${call}`,
  ].join(' ')
  const honesty =
    'Every answer also carries `snapshot`, `conditions`, `blindSpots` and ' +
    '`budget`: read `blindSpots` before treating an answer as complete.'
  return [shaped(spec, opening, honesty), spec.selection].join(' ')
}

/**
 * The half of a description that depends on how `result` is shaped.
 *
 * Read off the manifest's `shape` rather than guessed at from `unit`, because
 * the three shapes make different promises: only a list can be paged, and only
 * `kinds` bounds each of its lists separately.
 */
function shaped(spec: OperationSpec, opening: string, honesty: string): string {
  if (spec.shape === 'report') {
    return [
      opening,
      'prints — whose `result` is the report. It is written to a file as well,',
      'unless `out` is `-`. The default shape names nothing in your code.',
    ].join(' ')
  }
  if (spec.shape === 'document') {
    return [
      opening,
      'prints. `result.markdown` is the draft and `result.sections` names what',
      `each ${spec.unit} offers to assert, sorted by ${spec.sortedBy}. \`limit\``,
      `counts ${spec.unit}s and nothing inside one. Every claim it writes is a`,
      'candidate under a `codedocs?:` marker that `docs_check` does not read, so',
      'nothing here is checked until a person deletes the `?`. It writes no file',
      `unless \`out\` names one. ${honesty}`,
    ].join(' ')
  }
  if (spec.shape === 'kinds') {
    return [
      opening,
      `prints. \`result\` holds one entry per kind of fact, sorted ${spec.sortedBy}.`,
      '`limit` applies **per kind**, each reporting its own `budget`, so asking',
      'about a symbol with many callers still returns its file, its labels and',
      `its references. ${honesty}`,
    ].join(' ')
  }
  return [
    opening,
    `prints. \`result\` is a list of ${spec.unit}s, sorted by ${spec.sortedBy}.`,
    honesty,
  ].join(' ')
}

/** How the CLI spells one operation's subject, for a description that quotes it. */
function invocationSuffix(spec: OperationSpec): string {
  if (spec.subject === null) return ''
  const subject = ` <${spec.subject.name}>`
  return spec.subject.variadic ? ` --${subject}` : subject
}

/**
 * Every argument one operation takes.
 *
 * The schema `tools/list` publishes and the schema a call is held to are this
 * one object, so a client cannot be told one thing and refused by another.
 */
function schemaFor(spec: OperationSpec): Record<string, ArgumentSchema> {
  const properties: Record<string, ArgumentSchema> = {}
  if (spec.subject !== null) {
    properties[spec.subject.name] = spec.subject.variadic
      ? {
          type: 'array',
          items: { type: 'string' },
          description: spec.subject.description,
        }
      : { type: 'string', description: spec.subject.description }
  }
  if (spec.depth) properties['depth'] = DEPTH_ARGUMENT
  // Per-operation flags, described by the manifest so this binding has nothing
  // of its own to forget.
  for (const flag of spec.flags) {
    properties[flag.name] = {
      type: flag.value === null ? 'boolean' : 'string',
      description: flag.description,
    }
  }
  return Object.assign(properties, GLOBAL_ARGUMENTS)
}

/**
 * The tool list, derived so it cannot fall behind the operation set.
 *
 * The name is the operation's, with the one transliteration ADR 0006's rule
 * needs: a tool name may not carry a space, so `docs check` is published as
 * `docs_check`. Derived from the manifest rather than declared here, so an
 * operation cannot arrive under one name in this binding and another in the CLI.
 */
export function tools(): unknown[] {
  return OPERATIONS.map((spec) => ({
    name: toolName(spec),
    description: describe(spec),
    inputSchema: {
      type: 'object',
      properties: schemaFor(spec),
      required: spec.subject === null ? [] : [spec.subject.name],
      additionalProperties: false,
    },
  }))
}

/** One argument read at the type its own schema declares, or refused by name. */
type Read =
  | {
      readonly value: string | number | boolean | readonly string[] | undefined
    }
  | Failure

const refused = (read: Read): read is Failure => 'code' in read

/** The only argument type with a bound of its own, so the only one with a body. */
function readInteger(
  value: unknown,
  name: string,
  schema: ArgumentSchema,
): Read {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return { code: -32602, message: `\`${name}\` must be an integer` }
  }
  if (schema.minimum !== undefined && value < schema.minimum) {
    return {
      code: -32602,
      message: `\`${name}\` must be at least ${schema.minimum}`,
    }
  }
  return { value }
}

function readArgument(
  value: unknown,
  name: string,
  schema: ArgumentSchema,
): Read {
  if (value === undefined) return { value: undefined }
  if (schema.type === 'integer') return readInteger(value, name, schema)
  if (schema.type === 'array') {
    return Array.isArray(value) &&
      value.every((entry) => typeof entry === 'string')
      ? { value: value as readonly string[] }
      : { code: -32602, message: `\`${name}\` must be an array of strings` }
  }
  if (schema.type === 'boolean') {
    return typeof value === 'boolean'
      ? { value }
      : { code: -32602, message: `\`${name}\` must be a boolean` }
  }
  return typeof value === 'string'
    ? { value }
    : { code: -32602, message: `\`${name}\` must be a string` }
}

/**
 * How one non-subject argument is spelled as argv.
 *
 * A boolean is the flag alone, and a false one is nothing at all: `--no-update`
 * off is the absence of the flag, not `--no-update false`. A repeatable flag is
 * spelled once per value.
 */
function flagFor(
  name: string,
  schema: ArgumentSchema,
  value: string | number | boolean | readonly string[],
): string[] {
  if (schema.type === 'boolean') return value === true ? [`--${name}`] : []
  // A repeatable flag is one flag per entry: joining them would make one value
  // out of two filters, and the parser would refuse it.
  if (Array.isArray(value)) {
    return value.flatMap((entry) => [`--${name}`, String(entry)])
  }
  return [`--${name}`, String(value)]
}

/**
 * The subject's tail of the argv, or why the call has no subject to put there.
 *
 * An operation that takes no subject contributes nothing. One that does gets a
 * positional after `--`, so a subject beginning with a hyphen is read as a
 * subject rather than as an unknown flag.
 */
function positionalFor(
  spec: OperationSpec,
  subject: string | readonly string[] | undefined,
): { tail: string[] } | Failure {
  if (spec.subject === null) return { tail: [] }
  const empty =
    subject === undefined ||
    subject === '' ||
    (Array.isArray(subject) && subject.length === 0)
  if (empty) {
    return {
      code: -32602,
      message: `\`${spec.name}\` needs a \`${spec.subject.name}\``,
    }
  }
  // Both forms sit after `--`: for a variadic subject that is where the command
  // it re-runs begins, and for an ordinary one it is what stops a subject
  // beginning with a hyphen being read as an unknown flag.
  return {
    tail: ['--', ...(typeof subject === 'string' ? [subject] : subject)],
  }
}

/**
 * The argv one tool call becomes, or why it could not be one.
 *
 * Every argument is spelled as its flag, so the translation is `--${name}` and
 * there is nothing per operation to keep in step. The subject is the exception,
 * being a positional rather than a flag.
 */
function argvFor(
  spec: OperationSpec,
  args: Record<string, unknown>,
): { argv: string[] } | Failure {
  const schema = schemaFor(spec)
  // A server's stdout is a protocol stream, so colour is refused rather than
  // left to a TTY check that would be wrong here.
  // Spelled as the CLI spells it, which for the two `docs` operations is two
  // positionals: the argv is the command line a person would have typed.
  const argv = [...spec.name.split(' '), '--json', '--no-color']
  let subject: string | readonly string[] | undefined

  for (const name of Object.keys(args)) {
    const declared = schema[name]
    if (declared === undefined) {
      return {
        code: -32602,
        message: `\`${spec.name}\` has no argument \`${name}\`. It takes: ${Object.keys(schema).sort().join(', ')}.`,
      }
    }
    const read = readArgument(args[name], name, declared)
    if (refused(read)) return read
    if (read.value === undefined) continue
    if (name === spec.subject?.name) subject = read.value as string | string[]
    else argv.push(...flagFor(name, declared, read.value))
  }

  const positional = positionalFor(spec, subject)
  if (!('tail' in positional)) return positional
  return { argv: [...argv, ...positional.tail] }
}

/** What one method produced: a result to send, or a failure to send instead. */
type Answer =
  | { readonly ok: true; readonly result: unknown }
  | { readonly ok: false; readonly failure: Failure }

const answered = (result: unknown): Answer => ({ ok: true, result })
const failed = (failure: Failure): Answer => ({ ok: false, failure })

/** Answer one `tools/call`. */
function callTool(params: Record<string, unknown>): Answer {
  const name = params['name']
  const spec = OPERATIONS.find((entry) => toolName(entry) === name)
  if (spec === undefined) {
    return failed({
      code: -32602,
      message: `unknown tool \`${typeof name === 'string' ? name : ''}\`. codedocs exposes one tool per operation: ${OPERATIONS.map((entry) => entry.name).join(', ')}.`,
    })
  }
  const args = params['arguments']
  if (args !== undefined && (typeof args !== 'object' || args === null)) {
    return failed({ code: -32602, message: '`arguments` must be an object' })
  }

  const built = argvFor(spec, (args ?? {}) as Record<string, unknown>)
  if (!('argv' in built)) return failed(built)

  const { stdout, stderr, code } = run(built.argv)
  // Exit 2 is the one case with no envelope to return — the index could not be
  // opened at all — so the message goes back as an error rather than as an
  // answer. Exit 1 is a negative finding, which is an answer.
  return answered({
    content: [{ type: 'text', text: stdout === '' ? stderr : stdout }],
    isError: code === 2,
  })
}

/** What one method produced, before it is wrapped in a JSON-RPC envelope. */
function dispatch(request: Request): Answer {
  switch (request.method) {
    case 'initialize':
      return answered({
        protocolVersion: PROTOCOL_VERSION,
        // Tools and nothing else: codedocs has no prompts, no resources, and
        // nothing to sample. A capability we do not implement is a promise.
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      })
    case 'ping':
      return answered({})
    case 'tools/list':
      return answered({ tools: tools() })
    case 'tools/call':
      return callTool(request.params ?? {})
    default:
      return failed({
        code: -32601,
        message: `unknown method \`${request.method}\``,
      })
  }
}

/** One JSON-RPC response. */
interface Reply {
  readonly jsonrpc: '2.0'
  readonly id: string | number | null
  readonly result?: unknown
  readonly error?: Failure
}

/** Answer one request, or return `null` for a notification, which owes no reply. */
function respond(request: Request): Reply | null {
  // A notification is answered by silence, whether or not the method is one this
  // server implements.
  if (request.id === undefined || request.id === null) return null
  const answer = dispatch(request)
  return answer.ok
    ? { jsonrpc: '2.0', id: request.id, result: answer.result }
    : { jsonrpc: '2.0', id: request.id, error: answer.failure }
}

/** Whether a decoded message is a request this server can even look at. */
const isRequest = (value: unknown): value is Request =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { method?: unknown }).method === 'string'

/**
 * Answer one line of the stdio transport, or return `null` to write nothing.
 *
 * Exported so the whole binding is testable without a process, for the same
 * reason `run` returns rather than prints.
 */
export function handle(line: string): string | null {
  let message: unknown
  try {
    message = JSON.parse(line)
  } catch {
    return JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'parse error' },
    })
  }
  if (!isRequest(message)) {
    return JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32600, message: 'invalid request' },
    })
  }
  const answer = respond(message)
  return answer === null ? null : JSON.stringify(answer)
}

/**
 * Serve MCP over a newline-delimited JSON stream until the input ends.
 *
 * The transport is deliberately the whole of it: one message per line, no
 * framing header, and `JSON.stringify` never emits a raw newline, so a reply is
 * always exactly one line.
 */
export async function serve(input: Readable, output: Writable): Promise<void> {
  input.setEncoding('utf8')
  let buffered = ''
  for await (const chunk of input) {
    buffered += chunk as string
    let at = buffered.indexOf('\n')
    while (at !== -1) {
      const line = buffered.slice(0, at).trim()
      buffered = buffered.slice(at + 1)
      if (line !== '') {
        const answer = handle(line)
        if (answer !== null) output.write(`${answer}\n`)
      }
      at = buffered.indexOf('\n')
    }
  }
  // A final line with no trailing newline is still a message.
  const last = buffered.trim()
  if (last !== '') {
    const answer = handle(last)
    if (answer !== null) output.write(`${answer}\n`)
  }
}
