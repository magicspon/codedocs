/**
 * Argument parsing.
 *
 * ADR 0006 closes the global flag set, and no operation may redefine a global
 * flag's meaning. Per-operation flags are additive only.
 */

import { parseArgs } from 'node:util'

import { OPERATIONS, operationSpec, type OperationName } from '@codedocs/core'

/** A parsed command line, or the reason it could not be parsed. */
export type ParsedArgs =
  | { readonly ok: true; readonly command: Command }
  | { readonly ok: false; readonly message: string }

/** One resolved invocation. */
export interface Command {
  readonly operation: OperationName
  /** The subject or pattern, absent for `analyse`. */
  readonly subject: string | null
  readonly json: boolean
  readonly noUpdate: boolean
  /** `null` means unbounded; the renderer, not the operation, owns the default. */
  readonly limit: number | null
  /** `null` means "ask the operation": depth is a semantic bound, so it owns the default. */
  readonly depth: number | null
  readonly cwd: string
  readonly color: boolean
}

/** The default the human renderer applies when no `--limit` is given. */
const HUMAN_DEFAULT_LIMIT = 20

const OPTIONS = {
  json: { type: 'boolean' },
  'no-update': { type: 'boolean' },
  limit: { type: 'string' },
  depth: { type: 'string' },
  cwd: { type: 'string' },
  color: { type: 'boolean' },
  'no-color': { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
} as const

/** One parsing step's value, or the reason parsing stopped. */
type Step<T> = { readonly value: T } | { readonly message: string }

const failed = <T>(step: Step<T>): step is { readonly message: string } =>
  'message' in step

/**
 * Parse `argv` into one command.
 *
 * `--json` is explicit and never inferred from a TTY. Sniffing a pipe makes the
 * same command produce different output depending on where it runs, which an
 * agent capturing output through a pty discovers the hard way.
 */
export function parse(argv: readonly string[]): ParsedArgs {
  const options = parseOptions(argv)
  if (failed(options)) return { ok: false, message: options.message }

  const { values, positionals } = options.value
  if (values.help === true || positionals.length === 0) {
    return { ok: false, message: usage() }
  }

  const invocation = resolveInvocation(positionals)
  if (failed(invocation)) return { ok: false, message: invocation.message }

  const json = values.json === true
  const limit = resolveLimit(values.limit, json)
  if (failed(limit)) return { ok: false, message: limit.message }

  const depth = resolveDepth(values.depth, invocation.value.operation)
  if (failed(depth)) return { ok: false, message: depth.message }

  return {
    ok: true,
    command: {
      ...invocation.value,
      json,
      noUpdate: values['no-update'] === true,
      limit: limit.value,
      depth: depth.value,
      cwd: values.cwd ?? process.cwd(),
      color: resolveColor(values.color, values['no-color']),
    },
  }
}

/** `parseArgs` throws on an unknown flag; a bad command line is not exceptional here. */
function parseOptions(argv: readonly string[]) {
  try {
    return {
      value: parseArgs({
        args: [...argv],
        options: OPTIONS,
        allowPositionals: true,
        strict: true,
      }),
    }
  } catch (error) {
    return { message: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * The operation and its subject, with every arity rule that applies to them.
 *
 * Every rule reads the manifest rather than naming an operation: `analyse` is not
 * special-cased here, it is simply the entry whose `subject` is `null`.
 */
function resolveInvocation(
  positionals: readonly string[],
): Step<Pick<Command, 'operation' | 'subject'>> {
  const [name, subject, ...rest] = positionals
  const spec = name === undefined ? undefined : operationSpec(name)
  if (spec === undefined) {
    return { message: `unknown operation \`${name ?? ''}\`\n\n${usage()}` }
  }
  const noun = spec.subject === null ? 'argument' : spec.subject.name
  if (rest.length > 0) {
    return {
      message: `\`${spec.name}\` takes at most one ${noun}, got ${positionals.length - 1}`,
    }
  }
  if (spec.subject !== null && subject === undefined) {
    return {
      message: `\`${spec.name}\` needs a ${noun}, e.g. \`codedocs ${spec.name} AuthService.login\``,
    }
  }
  return { value: { operation: spec.name, subject: subject ?? null } }
}

/** The renderer owns the default, so an absent `--limit` means "ask the renderer". */
function resolveLimit(
  raw: string | undefined,
  json: boolean,
): Step<number | null> {
  if (raw === undefined) return { value: json ? null : HUMAN_DEFAULT_LIMIT }
  const limit = Number(raw)
  if (!Number.isInteger(limit) || limit < 0) {
    return { message: `--limit must be a non-negative integer, got \`${raw}\`` }
  }
  return { value: limit }
}

/**
 * `--depth` is per-operation, and a flag silently ignored is worse than a flag
 * refused: a caller who asked `callers --depth 2` would read a one-hop answer as
 * a bounded walk.
 */
function resolveDepth(
  raw: string | undefined,
  operation: OperationName,
): Step<number | null> {
  if (raw === undefined) return { value: null }
  if (operationSpec(operation)?.depth !== true) {
    const takes = OPERATIONS.filter((entry) => entry.depth).map(
      (entry) => `\`${entry.name}\``,
    )
    return {
      message: `--depth applies to ${takes.join(', ')}, not \`${operation}\``,
    }
  }
  const depth = Number(raw)
  if (!Number.isInteger(depth) || depth < 0) {
    return { message: `--depth must be a non-negative integer, got \`${raw}\`` }
  }
  return { value: depth }
}

/** Colour is a renderer concern, and the machine renderer never uses it. */
function resolveColor(
  color: boolean | undefined,
  noColor: boolean | undefined,
): boolean {
  if (noColor === true) return false
  if (color === true) return true
  if (process.env['NO_COLOR'] !== undefined && process.env['NO_COLOR'] !== '')
    return false
  return process.stdout.isTTY === true
}

/** The help text, which is also what an unparseable command line prints. */
function usage(): string {
  // Derived, so an operation cannot land without appearing in `--help`.
  const invocation = (name: string, subject: string | null): string =>
    `codedocs ${name}${subject === null ? '' : ` <${subject}>`}`
  const width = Math.max(
    ...OPERATIONS.map(
      (entry) => invocation(entry.name, entry.subject?.name ?? null).length,
    ),
  )
  return [
    'codedocs — a local codebase index for TypeScript',
    '',
    'Usage:',
    ...OPERATIONS.map((entry) => {
      const left = invocation(entry.name, entry.subject?.name ?? null)
      return `  ${left.padEnd(width + 2)}${entry.summary}`
    }),
    '',
    '  codedocs mcp                serve the operations above over MCP (stdio)',
    '',
    'A subject is anything codedocs prints as an identifier:',
    '  src/auth/service.ts#AuthService.login   exact',
    '  AuthService.login                       may resolve to several',
    '',
    'Flags:',
    '  --json           machine output; unbounded unless --limit is given',
    '  --no-update      answer from the stored snapshot and name the drift',
    `  --limit <n>      cap results (human default ${HUMAN_DEFAULT_LIMIT}, --json default none)`,
    `  --depth <n>      ${OPERATIONS.filter((entry) => entry.depth)
      .map((entry) => `\`${entry.name}\``)
      .join(', ')} only: cap the steps per path (default none)`,
    '  --cwd <path>     run against another directory',
    '  --color / --no-color',
    '',
    'Exit codes: 0 answered, 1 negative finding, 2 could not answer.',
  ].join('\n')
}
