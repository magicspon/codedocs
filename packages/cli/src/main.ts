/**
 * The CLI binding.
 *
 * One binding of the operation set, not a layer above it: nothing here composes
 * operations, and every answer is the envelope the core returned. The MCP server
 * will be the second binding, one tool per operation, returning the machine
 * envelope verbatim.
 */

import {
  analyse,
  callees,
  callers,
  ConfigError,
  openSession,
  SCHEMA_VERSION,
  symbol,
  trace,
  type AnswerContext,
  type Envelope,
  type EnvelopeError,
} from '@codedocs/core'

import { parse, type Command } from './args.ts'
import {
  renderAnalyse,
  renderEdges,
  renderError,
  renderSymbols,
  renderTrace,
  styleFor,
  type AnalyseEnvelope,
  type Style,
} from './render.ts'

/** What one invocation produced: text for stdout or stderr, and an exit code. */
export interface Run {
  readonly stdout: string
  readonly stderr: string
  /** 0 answered, 1 negative finding, 2 could not answer. */
  readonly code: 0 | 1 | 2
}

/**
 * Run one command line and return what to print.
 *
 * Returns rather than prints so the whole binding is testable without a process,
 * which is also what makes ADR 0006's byte-identical reproducibility a fixtures
 * test rather than a promise.
 */
export function run(argv: readonly string[]): Run {
  const parsed = parse(argv)
  if (!parsed.ok) {
    return { stdout: '', stderr: parsed.message, code: 2 }
  }

  const { command } = parsed
  const style = styleFor(command.color)

  let session
  try {
    session = openSession({ cwd: command.cwd, noUpdate: command.noUpdate })
  } catch (error) {
    // Nothing was opened, so there is no snapshot to name and no conditions to
    // report — but the envelope is still the shape a caller parses, and a
    // `--json` run that answered nothing at all is the one an agent can least
    // afford to have to guess at. A bad `codedocs.jsonc` keeps its own code:
    // ADR 0010 makes it a different repair from an index that will not open.
    return failed(command, style, {
      code: error instanceof ConfigError ? error.code : 'index-unavailable',
      message: messageOf(error),
    })
  }

  try {
    const { store, context } = session
    const { depth, limit, subject } = command

    switch (command.operation) {
      case 'analyse': {
        const envelope = analyse(store, context, limit, session.repair)
        return emit(command.json, envelope, () =>
          renderAnalyse(envelope as AnalyseEnvelope, style),
        )
      }
      case 'symbol': {
        const envelope = symbol(store, context, subject ?? '*', limit)
        return emit(command.json, envelope, () =>
          renderSymbols(envelope, style),
        )
      }
      case 'callers':
      case 'callees': {
        const operation = command.operation === 'callers' ? callers : callees
        const envelope = operation(store, context, subject ?? '', limit)
        return emit(command.json, envelope, () => renderEdges(envelope, style))
      }
      case 'trace': {
        const envelope = trace(store, context, subject ?? '', limit, depth)
        return emit(command.json, envelope, () => renderTrace(envelope, style))
      }
    }
  } catch (error) {
    return failed(
      command,
      style,
      { code: 'operation-failed', message: messageOf(error) },
      session.context,
    )
  } finally {
    session.close()
  }
}

/**
 * Render one failure, as the same envelope every success uses.
 *
 * `context` is absent only where the session never opened, in which case the
 * honesty fields are empty rather than invented: an unknown snapshot is reported
 * as unknown.
 */
function failed(
  command: Command,
  style: Style,
  error: EnvelopeError,
  context?: AnswerContext,
): Run {
  const envelope: Envelope<never> = {
    operation: command.operation,
    schemaVersion: SCHEMA_VERSION,
    request: {
      subject: command.subject,
      resolved: [],
      limit: command.limit,
      depth: command.depth,
    },
    snapshot: context?.snapshot ?? {
      commit: null,
      dirty: false,
      analysedAt: null,
    },
    conditions: context?.conditions ?? [],
    blindSpots: context?.blindSpots ?? [],
    budget: { returned: 0, available: 0, truncated: false },
    error,
  }
  return {
    stdout: command.json ? JSON.stringify(envelope, null, 2) : '',
    stderr: command.json ? '' : renderError(envelope, style),
    code: 2,
  }
}

/**
 * Choose a renderer.
 *
 * The human renderer is built lazily so that `--json` cannot pay for formatting
 * it will not print — and so that a bug in the human renderer cannot corrupt a
 * machine answer.
 */
function emit(
  json: boolean,
  envelope: Envelope<unknown>,
  human: () => string,
): Run {
  return {
    stdout: json ? JSON.stringify(envelope, null, 2) : human(),
    stderr: '',
    code: 0,
  }
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)
