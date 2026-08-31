/**
 * Argument parsing.
 *
 * ADR 0006 closes the global flag set, and no operation may redefine a global
 * flag's meaning. Per-operation flags are additive only.
 */

import { parseArgs } from 'node:util'

import type { OperationName } from '@codedocs/core'

/** The operations the skeleton binds, in the order `--help` lists them. */
const OPERATIONS: readonly OperationName[] = [
  'analyse',
  'symbol',
  'callers',
  'callees',
]

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
  readonly cwd: string
  readonly color: boolean
}

/** The default the human renderer applies when no `--limit` is given. */
const HUMAN_DEFAULT_LIMIT = 20

const OPTIONS = {
  json: { type: 'boolean' },
  'no-update': { type: 'boolean' },
  limit: { type: 'string' },
  cwd: { type: 'string' },
  color: { type: 'boolean' },
  'no-color': { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
} as const

/**
 * Parse `argv` into one command.
 *
 * `--json` is explicit and never inferred from a TTY. Sniffing a pipe makes the
 * same command produce different output depending on where it runs, which an
 * agent capturing output through a pty discovers the hard way.
 */
export function parse(argv: readonly string[]): ParsedArgs {
  let parsed
  try {
    parsed = parseArgs({
      args: [...argv],
      options: OPTIONS,
      allowPositionals: true,
      strict: true,
    })
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    }
  }

  const { values, positionals } = parsed
  if (values.help === true || positionals.length === 0) {
    return { ok: false, message: usage() }
  }

  const [name, subject, ...rest] = positionals
  if (name === undefined || !isOperation(name)) {
    return {
      ok: false,
      message: `unknown operation \`${name ?? ''}\`\n\n${usage()}`,
    }
  }
  if (rest.length > 0) {
    return {
      ok: false,
      message: `\`${name}\` takes at most one subject, got ${positionals.length - 1}`,
    }
  }
  if (name !== 'analyse' && subject === undefined) {
    return {
      ok: false,
      message: `\`${name}\` needs a subject, e.g. \`codedocs ${name} AuthService.login\``,
    }
  }

  const json = values.json === true
  let limit: number | null = json ? null : HUMAN_DEFAULT_LIMIT
  if (values.limit !== undefined) {
    const parsedLimit = Number(values.limit)
    if (!Number.isInteger(parsedLimit) || parsedLimit < 0) {
      return {
        ok: false,
        message: `--limit must be a non-negative integer, got \`${values.limit}\``,
      }
    }
    limit = parsedLimit
  }

  return {
    ok: true,
    command: {
      operation: name,
      subject: subject ?? null,
      json,
      noUpdate: values['no-update'] === true,
      limit,
      cwd: values.cwd ?? process.cwd(),
      color: resolveColor(values.color, values['no-color']),
    },
  }
}

const isOperation = (name: string): name is OperationName =>
  (OPERATIONS as readonly string[]).includes(name)

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
  return [
    'codedocs — a local codebase index for TypeScript',
    '',
    'Usage:',
    '  codedocs analyse                 build or refresh the index, one row per project',
    '  codedocs symbol <pattern>        every symbol whose name matches a glob',
    '  codedocs callers <subject>       every call edge into a subject',
    '  codedocs callees <subject>       every call edge out of a subject',
    '',
    'A subject is anything codedocs prints as an identifier:',
    '  src/auth/service.ts#AuthService.login   exact',
    '  AuthService.login                       may resolve to several',
    '',
    'Flags:',
    '  --json           machine output; unbounded unless --limit is given',
    '  --no-update      answer from the stored snapshot and name the drift',
    `  --limit <n>      cap results (human default ${HUMAN_DEFAULT_LIMIT}, --json default none)`,
    '  --cwd <path>     run against another directory',
    '  --color / --no-color',
    '',
    'Exit codes: 0 answered, 1 negative finding, 2 could not answer.',
  ].join('\n')
}
