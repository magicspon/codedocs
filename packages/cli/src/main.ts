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
  openSession,
  symbol,
  type Envelope,
} from '@codedocs/core'

import { parse } from './args.ts'
import {
  renderAnalyse,
  renderEdges,
  renderError,
  renderSymbols,
  styleFor,
  type AnalyseEnvelope,
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
    // A failure to open or build the index is the one case with no envelope to
    // carry it: there is no snapshot to name and no conditions to report.
    return {
      stdout: '',
      stderr: style.warn(`  index-unavailable: ${messageOf(error)}`),
      code: 2,
    }
  }

  try {
    const { store, context } = session
    const { limit, subject } = command

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
    }
  } catch (error) {
    const envelope: Envelope<never> = {
      operation: command.operation,
      schemaVersion: 1,
      request: { subject: command.subject, resolved: [], limit: command.limit },
      snapshot: session.context.snapshot,
      conditions: session.context.conditions,
      blindSpots: session.context.blindSpots,
      budget: { returned: 0, available: 0, truncated: false },
      error: { code: 'operation-failed', message: messageOf(error) },
    }
    return {
      stdout: command.json ? JSON.stringify(envelope, null, 2) : '',
      stderr: command.json ? '' : renderError(envelope, style),
      code: 2,
    }
  } finally {
    session.close()
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
