/**
 * Argument parsing.
 *
 * ADR 0006 closes the global flag set, and no operation may redefine a global
 * flag's meaning. Per-operation flags are additive only: the manifest declares
 * which operation takes which, and every other operation refuses it rather than
 * ignoring it.
 */

import { parseArgs } from 'node:util'

import {
  OPERATION_FLAGS,
  OPERATIONS,
  operationSpec,
  parseFilter,
  scopeOf,
  type EnvelopeError,
  type OperationName,
  type LabelFilter,
  type OperationFlag,
  type OperationSpec,
  type Scope,
  type Verdict,
} from '@codedocs/core'

/**
 * A parsed command line, or the reason it could not be parsed.
 *
 * ADR 0011: the reason is a code and typed parameters, never a sentence. A bad
 * command line is the one failure whose text is built entirely from what the
 * user typed, so it is exactly the one a report must be able to carry without
 * carrying the typing.
 */
export type ParsedArgs =
  | { readonly ok: true; readonly command: Command }
  | { readonly ok: false; readonly error: EnvelopeError }

/** One resolved invocation. */
export interface Command {
  readonly operation: OperationName
  /** The subject or pattern, absent for `analyse` and for a variadic subject. */
  readonly subject: string | null
  /**
   * The command line after `--`, for an operation whose subject is variadic.
   *
   * Empty for every other operation. `report-bug`'s subject is a whole command,
   * so it is kept as the words it was given as: joining it into a string and
   * splitting it again is a parser, and a lossy one.
   */
  readonly trailing: readonly string[]
  readonly json: boolean
  readonly noUpdate: boolean
  /** `null` means unbounded; the renderer, not the operation, owns the default. */
  readonly limit: number | null
  /** `null` means "ask the operation": depth is a semantic bound, so it owns the default. */
  readonly depth: number | null
  readonly cwd: string
  readonly color: boolean
  /** `report-bug`: add the facts that name the user's code (ADR 0011). */
  readonly withRepository: boolean
  /**
   * Where to write what an operation produces, or `null` for its own default.
   *
   * Shared by two operations and defaulted differently by each: `report-bug`
   * writes `./codedocs-report.json` unless told otherwise, and `docs draft`
   * derives a path beside the code it drafted about.
   */
  readonly out: string | null
  /** `doctor`: re-run the filesystem signals against the working tree (ADR 0009). */
  readonly measure: boolean
  /** The label filter the answer applies, or the default where none was named. */
  readonly scope: Scope
  /**
   * The commit to compare against. `null` means the operation's own default.
   *
   * `impact` defaults it to the merge base; `docs affected` defaults it to
   * nothing at all and answers from the drift set instead.
   */
  readonly base: string | null
  /** `docs check`: a verdict to exit 1 for beyond `contradicted`. */
  readonly failOn: Verdict | null
  /** `evidence`: restate the payload as ADR 0005 claim expressions. */
  readonly claims: boolean
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
  'with-repository': { type: 'boolean' },
  out: { type: 'string' },
  measure: { type: 'boolean' },
  base: { type: 'string' },
  claims: { type: 'boolean' },
  'fail-on': { type: 'string' },
  // Repeatable: one flag per axis, because the two are orthogonal and a single
  // value could only ever filter one of them.
  label: { type: 'string', multiple: true },
  'exclude-label': { type: 'string', multiple: true },
  help: { type: 'boolean', short: 'h' },
} as const

/** One parsing step's value, or the reason parsing stopped. */
type Step<T> = { readonly value: T } | { readonly error: EnvelopeError }

const failed = <T>(step: Step<T>): step is { readonly error: EnvelopeError } =>
  'error' in step

/**
 * Parse `argv` into one command.
 *
 * `--json` is explicit and never inferred from a TTY. Sniffing a pipe makes the
 * same command produce different output depending on where it runs, which an
 * agent capturing output through a pty discovers the hard way.
 *
 * @param cwd - What `--cwd` defaults to. `report-bug` passes its own, so that a
 * reproduction runs where the report-bug that asked for it was pointed, and the
 * command line stays the one the user typed rather than one codedocs edited.
 */
export function parse(
  argv: readonly string[],
  cwd: string = process.cwd(),
): ParsedArgs {
  const options = parseOptions(argv)
  if (failed(options)) return { ok: false, error: options.error }

  const { values, own, trailing } = options.value
  if (values.help === true || own.length + trailing.length === 0) {
    return { ok: false, error: { code: 'usage', params: {} } }
  }

  const invocation = resolveInvocation(own, trailing)
  if (failed(invocation)) return { ok: false, error: invocation.error }
  const { spec } = invocation.value

  const perOperation = checkFlags(values, spec)
  if (failed(perOperation)) return { ok: false, error: perOperation.error }

  const json = values.json === true
  // ADR 0006 keeps claim expressions on the machine renderer alone, so the flag
  // is refused rather than dropped: a caller who read a human answer believing
  // it held claims would have been told nothing about their absence.
  if (values.claims === true && !json) {
    return { ok: false, error: { code: 'claims-requires-json', params: {} } }
  }

  const limit = resolveLimit(values.limit, json, spec)
  if (failed(limit)) return { ok: false, error: limit.error }

  const depth = resolveDepth(values.depth, spec)
  if (failed(depth)) return { ok: false, error: depth.error }

  const scope = resolveScope(values.label, values['exclude-label'])
  if (failed(scope)) return { ok: false, error: scope.error }

  const failOn = resolveVerdict(values['fail-on'])
  if (failed(failOn)) return { ok: false, error: failOn.error }

  return {
    ok: true,
    command: {
      operation: spec.name,
      subject: invocation.value.subject,
      trailing: invocation.value.trailing,
      json,
      noUpdate: values['no-update'] === true,
      limit: limit.value,
      depth: depth.value,
      cwd: values.cwd ?? cwd,
      color: resolveColor(values.color, values['no-color']),
      withRepository: values['with-repository'] === true,
      out: values.out ?? null,
      measure: values.measure === true,
      scope: scope.value,
      base: values.base ?? null,
      claims: values.claims === true,
      failOn: failOn.value,
    },
  }
}

/**
 * Every flag `argv` gave that codedocs knows, without its value.
 *
 * ADR 0011's default report carries "the operation name, and every flag given"
 * and nothing a flag was set *to*, since a value can be a path or a subject.
 * Only recognised flags are reported, so a subject that happens to look like one
 * cannot smuggle the user's own text into the safe shape.
 */
export function flagsIn(argv: readonly string[]): readonly string[] {
  const known = new Set([
    ...Object.keys(OPTIONS),
    ...OPERATION_FLAGS.map((flag) => flag.name),
  ])
  const given: string[] = []
  for (const token of argv) {
    if (!token.startsWith('--')) continue
    const name = token.slice(2).split('=')[0] ?? ''
    if (known.has(name)) given.push(name)
  }
  return given
}

/** `parseArgs` throws on an unknown flag; a bad command line is not exceptional here. */
function parseOptions(argv: readonly string[]) {
  try {
    const parsed = parseArgs({
      args: [...argv],
      options: OPTIONS,
      allowPositionals: true,
      strict: true,
      // The `--` is load-bearing rather than decoration: it is where a variadic
      // subject begins, and `tokens` is the only way to see that it was there.
      tokens: true,
    })
    return { value: { values: parsed.values, ...partition(parsed.tokens) } }
  } catch (error) {
    // Node's own sentence names the flag the user typed, so it is a parameter
    // rather than the code: `unknown-flag` is the fact a report may carry.
    // Annotated because this function's return type is inferred, and an
    // inferred `code: string` is not a member of the closed set.
    const refused: EnvelopeError = {
      code: 'unknown-flag',
      params: {
        detail: error instanceof Error ? error.message : String(error),
      },
    }
    return { error: refused }
  }
}

/** One `parseArgs` token, at the width this file reads them. */
interface Token {
  readonly kind: string
  readonly index: number
  readonly value?: string
}

/** The positionals either side of `--`, which is where a variadic subject starts. */
function partition(tokens: readonly Token[]): {
  own: string[]
  trailing: string[]
} {
  const terminator = tokens.find((token) => token.kind === 'option-terminator')
  const own: string[] = []
  const trailing: string[] = []
  for (const token of tokens) {
    if (token.kind !== 'positional' || token.value === undefined) continue
    const after = terminator !== undefined && token.index > terminator.index
    ;(after ? trailing : own).push(token.value)
  }
  return { own, trailing }
}

/** What one command line resolved to, before its flags are checked. */
interface Invocation {
  readonly spec: OperationSpec
  readonly subject: string | null
  readonly trailing: readonly string[]
}

/**
 * The operation and its subject, with every arity rule that applies to them.
 *
 * Every rule reads the manifest rather than naming an operation: `analyse` is not
 * special-cased here, it is simply the entry whose `subject` is `null`, and
 * `report-bug` is the entry whose subject is variadic.
 *
 * A `--` before an ordinary subject is not a variadic subject — it is how the
 * MCP binding passes a subject that starts with a hyphen — so for every other
 * operation the two halves are read as one list.
 */
function resolveInvocation(
  own: readonly string[],
  trailing: readonly string[],
): Step<Invocation> {
  const matched = named([...own, ...trailing])
  if (matched === null) {
    const name = own[0] ?? trailing[0] ?? ''
    return { error: { code: 'unknown-operation', params: { name } } }
  }
  return matched.spec.subject?.variadic === true
    ? resolveVariadic(matched.spec, own, trailing)
    : resolveSubject(matched.spec, [...own, ...trailing], matched.words)
}

/**
 * The operation the leading positionals name, and how many of them it took.
 *
 * Two words are tried before one, because ADR 0006 spells two operations as
 * `docs check` and `docs affected` and there is no operation called `docs`: a
 * one-word attempt would refuse them before the two-word form was reached.
 */
function named(
  positionals: readonly string[],
): { spec: OperationSpec; words: number } | null {
  const two = positionals.slice(0, 2).join(' ')
  const pair = operationSpec(two)
  if (pair !== undefined) return { spec: pair, words: 2 }
  const one = operationSpec(positionals[0] ?? '')
  return one === undefined ? null : { spec: one, words: 1 }
}

/**
 * An operation whose subject is the command line after `--`.
 *
 * The name has to be on this side of the `--`, or there is no `--` left to start
 * the command with: `codedocs -- report-bug trace X` gave one, and it is the
 * wrong one.
 */
function resolveVariadic(
  spec: OperationSpec,
  own: readonly string[],
  trailing: readonly string[],
): Step<Invocation> {
  const noun = spec.subject?.name ?? 'argument'
  if (own.length !== 1) {
    return {
      error: {
        code: 'too-many-arguments',
        params: { operation: spec.name, noun, got: own.length - 1 },
      },
    }
  }
  if (trailing.length === 0) {
    return {
      error: {
        code: 'subject-required',
        params: { operation: spec.name, noun },
      },
    }
  }
  return { value: { spec, subject: null, trailing } }
}

/** An operation that takes one token, or — like `analyse` — takes none. */
function resolveSubject(
  spec: OperationSpec,
  positionals: readonly string[],
  words: number,
): Step<Invocation> {
  const noun = spec.subject === null ? 'argument' : spec.subject.name
  const [subject, ...rest] = positionals.slice(words)
  if (rest.length > 0) {
    return {
      error: {
        code: 'too-many-arguments',
        params: { operation: spec.name, noun, got: positionals.length - words },
      },
    }
  }
  if (spec.subject !== null && subject === undefined) {
    return {
      error: {
        code: 'subject-required',
        params: { operation: spec.name, noun },
      },
    }
  }
  return { value: { spec, subject: subject ?? null, trailing: [] } }
}

/**
 * Refuse a per-operation flag the operation does not declare.
 *
 * The same rule `--depth` has had since it existed, applied from the manifest so
 * that adding a flag to one operation cannot silently add it to five.
 */
function checkFlags(
  values: Readonly<Record<string, unknown>>,
  spec: OperationSpec,
): Step<null> {
  for (const flag of OPERATION_FLAGS) {
    if (values[flag.name] === undefined) continue
    if (spec.flags.some((entry) => entry.name === flag.name)) continue
    return {
      error: {
        code: 'flag-unsupported',
        params: { flag: flag.name, operation: spec.name },
      },
    }
  }
  return { value: null }
}

/**
 * The renderer owns the default, so an absent `--limit` means "ask the renderer".
 *
 * An operation with no result unit has nothing for a limit to count, and is told
 * so rather than accepting a flag it would drop.
 */
function resolveLimit(
  raw: string | undefined,
  json: boolean,
  spec: OperationSpec,
): Step<number | null> {
  if (raw === undefined) return { value: json ? null : HUMAN_DEFAULT_LIMIT }
  if (spec.unit === null) {
    return {
      error: {
        code: 'flag-unsupported',
        params: { flag: 'limit', operation: spec.name },
      },
    }
  }
  const limit = Number(raw)
  if (!Number.isInteger(limit) || limit < 0) {
    return { error: { code: 'limit-invalid', params: { value: raw } } }
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
  spec: OperationSpec,
): Step<number | null> {
  if (raw === undefined) return { value: null }
  if (!spec.depth) {
    return {
      error: { code: 'depth-unsupported', params: { operation: spec.name } },
    }
  }
  const depth = Number(raw)
  if (!Number.isInteger(depth) || depth < 0) {
    return { error: { code: 'depth-invalid', params: { value: raw } } }
  }
  return { value: depth }
}

/**
 * The label filters, read into the scope one answer applies.
 *
 * A typo is refused rather than silently matching nothing: a filter that quietly
 * excludes every result is the worst failure this flag can have, and the one a
 * caller is least likely to notice.
 */
function resolveScope(
  include: readonly string[] | undefined,
  exclude: readonly string[] | undefined,
): Step<Scope> {
  const read = (
    raw: readonly string[] | undefined,
    flag: string,
  ): Step<LabelFilter[]> => {
    const filters: LabelFilter[] = []
    for (const entry of raw ?? []) {
      const parsed = parseFilter(entry)
      if ('expected' in parsed) {
        return {
          error: {
            code: 'label-invalid' as const,
            params: { flag, value: entry, expectation: parsed.expected },
          },
        }
      }
      filters.push(parsed.filter)
    }
    return { value: filters }
  }
  const included = read(include, 'label')
  if (failed(included)) return { error: included.error }
  const excluded = read(exclude, 'exclude-label')
  if (failed(excluded)) return { error: excluded.error }
  return { value: scopeOf(included.value, excluded.value) }
}

/**
 * The verdicts `--fail-on` accepts.
 *
 * `verified` is not among them: a build that fails when a document checks out
 * is a build nobody would keep. `contradicted` is not either — it always exits
 * 1, so naming it would be asking for what you already have.
 */
const FAIL_ON: readonly Verdict[] = ['potentially-stale', 'unable-to-verify']

/**
 * Read `--fail-on`, or say why it is not a verdict.
 *
 * The vocabulary is closed, and spelled with hyphens: ADR 0005 writes
 * `potentially stale` in prose, and a flag value with a space in it is a value
 * every shell would have to be told about.
 */
function resolveVerdict(raw: string | undefined): Step<Verdict | null> {
  if (raw === undefined) return { value: null }
  if (!FAIL_ON.includes(raw as Verdict)) {
    return {
      error: {
        code: 'verdict-invalid',
        params: { value: raw, expectation: FAIL_ON.join(' or ') },
      },
    }
  }
  return { value: raw as Verdict }
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

/** One per-operation flag as `--help` spells it, without its summary. */
const spelled = (flag: OperationFlag): string =>
  `  --${flag.name}${flag.value === null ? '' : ` <${flag.value}>`}`

/**
 * The widest per-operation flag, so the summaries line up in one column.
 *
 * Derived rather than a constant: a flag whose name is one character longer than
 * the widest is a flag whose summary runs into it, and nobody would notice until
 * they read the help.
 */
const flagWidth = (): number =>
  Math.max(...OPERATION_FLAGS.map((flag) => spelled(flag).length))

/** How one operation is invoked, as `--help` spells it. */
function invocation(spec: OperationSpec): string {
  if (spec.subject === null) return `codedocs ${spec.name}`
  const subject = `<${spec.subject.name}>`
  return `codedocs ${spec.name} ${spec.subject.variadic ? `-- ${subject}` : subject}`
}

/**
 * The help text, which is also what an unparseable command line prints.
 *
 * Exported for the renderer: `usage` and `unknown-operation` are the two codes
 * whose sentence is this whole block, and it is derived from the manifest here
 * so that an operation cannot land without appearing in it.
 */
export function usage(): string {
  // Derived, so an operation cannot land without appearing in `--help`.
  const width = Math.max(...OPERATIONS.map((entry) => invocation(entry).length))
  return [
    'codedocs — a local codebase index for TypeScript',
    '',
    'Usage:',
    ...OPERATIONS.map(
      (entry) => `  ${invocation(entry).padEnd(width + 2)}${entry.summary}`,
    ),
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
    'Scope (repeatable, one per axis; the default is authorship=authored):',
    '  --label <axis>=<value>          keep only results whose file carries it',
    '  --exclude-label <axis>=<value>  drop results whose file carries it',
    '  role=source|test|config, authorship=authored|generated',
    // Per-operation flags are listed with the operation that takes them, so the
    // closed global set stays readable as a closed set.
    ...OPERATIONS.filter((entry) => entry.flags.length > 0).flatMap((entry) => [
      '',
      `\`${entry.name}\` only:`,
      ...entry.flags.map(
        (flag) => `${spelled(flag).padEnd(flagWidth() + 2)}${flag.summary}`,
      ),
    ]),
    '',
    'Exit codes: 0 answered, 1 negative finding, 2 could not answer.',
  ].join('\n')
}
