/**
 * The CLI binding.
 *
 * One binding of the operation set, not a layer above it: nothing here composes
 * operations, and every answer is the envelope the core returned. The MCP server
 * will be the second binding, one tool per operation, returning the machine
 * envelope verbatim.
 *
 * `report-bug` is the one operation that runs another, and it is still not
 * composition: it re-runs a command line the user gave and reports the envelope
 * that came back, which is the same envelope `codedocs` itself would have
 * printed. ADR 0011 makes the reproduction the payload precisely so that nothing
 * has to be logged for a report to exist.
 */

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  analyse,
  callees,
  callers,
  ConfigError,
  openSession,
  REPORT_FILE,
  reportBug,
  SCHEMA_VERSION,
  symbol,
  trace,
  type AnswerContext,
  type Envelope,
  type EnvelopeError,
  type ReportEnvelope,
  type Reproduction,
  type Session,
} from '@codedocs/core'

import { flagsIn, parse, type Command, type ParsedArgs } from './args.ts'
import { formatError } from './messages.ts'
import { codedocsFrames } from './stack.ts'
import {
  renderAnalyse,
  renderEdges,
  renderError,
  renderReport,
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
 * One invocation, before it is reduced to text.
 *
 * `report-bug` needs the envelope of the command it re-ran rather than the
 * bytes that command would have printed, and nothing else may: `run` returns
 * `Run`, so this stays inside the binding.
 */
interface Outcome extends Run {
  /** The envelope the operation produced, or `null` where none was reached. */
  readonly envelope: Envelope<unknown> | null
  /** The failure, where there was no envelope to carry it. */
  readonly error: EnvelopeError | null
}

/**
 * Run one command line and return what to print.
 *
 * Returns rather than prints so the whole binding is testable without a process,
 * which is also what makes ADR 0006's byte-identical reproducibility a fixtures
 * test rather than a promise.
 */
export function run(argv: readonly string[]): Run {
  const { stdout, stderr, code } = execute(argv)
  return { stdout, stderr, code }
}

/**
 * Run one command line and keep the envelope, for the one caller that needs it.
 *
 * @param cwd - What `--cwd` defaults to, which only `report-bug` sets: a
 * reproduction runs where its `report-bug` was pointed.
 */
function execute(argv: readonly string[], cwd?: string): Outcome {
  const parsed = parse(argv, cwd)
  if (!parsed.ok) {
    // No operation was resolved, so there is no envelope to put this in: an
    // envelope names the operation it answers for, and inventing one would tell
    // a caller that a command it never ran had failed.
    return {
      stdout: '',
      stderr: formatError(parsed.error),
      code: 2,
      envelope: null,
      error: parsed.error,
    }
  }
  const { command } = parsed
  const style = styleFor(command.color)
  // `report-bug` is the one operation that opens no session of its own: it
  // re-runs a command that opens one, and reads the index that answered it.
  return command.operation === 'report-bug'
    ? report(command, style)
    : answered(command, style)
}

/**
 * Open the index, answer, and close it however that went.
 *
 * Every failure past this point is the same envelope a success would have been,
 * because a `--json` run that answered nothing at all is the one an agent can
 * least afford to have to guess at.
 */
function answered(command: Command, style: Style): Outcome {
  let session
  try {
    session = openSession({ cwd: command.cwd, noUpdate: command.noUpdate })
  } catch (error) {
    // Nothing was opened, so there is no snapshot to name and no conditions to
    // report — the envelope's honesty fields are empty rather than invented.
    return failed(command, style, unavailable(error))
  }
  try {
    return dispatch(command, session, style)
  } catch (error) {
    return failed(
      command,
      style,
      {
        code: 'operation-failed',
        params: { detail: messageOf(error) },
        stack: codedocsFrames(error),
      },
      session.context,
    )
  } finally {
    session.close()
  }
}

/**
 * One operation, and the renderer that goes with it.
 *
 * The subject is coalesced once: the parser has already refused an operation
 * that needs one and was given none, so the fallback is unreachable and exists
 * only because the type says it can be `null` for `analyse`.
 */
function dispatch(command: Command, session: Session, style: Style): Outcome {
  const { store, context } = session
  const { depth, json, limit } = command
  const subject = command.subject ?? ''

  switch (command.operation) {
    case 'analyse': {
      const envelope = analyse(store, context, limit, session.repair)
      return emit(json, envelope, () =>
        renderAnalyse(envelope as AnalyseEnvelope, style),
      )
    }
    case 'symbol': {
      const envelope = symbol(store, context, subject, limit)
      return emit(json, envelope, () => renderSymbols(envelope, style))
    }
    case 'callers':
    case 'callees': {
      const operation = command.operation === 'callers' ? callers : callees
      const envelope = operation(store, context, subject, limit)
      return emit(json, envelope, () => renderEdges(envelope, style))
    }
    case 'trace': {
      const envelope = trace(store, context, subject, limit, depth)
      return emit(json, envelope, () => renderTrace(envelope, style))
    }
    // Unreachable: `execute` routes `report-bug` before a session is opened.
    // The case is here so that adding an operation is a type error rather than a
    // silent fall through — and if it ever did run, it did fail.
    case 'report-bug':
      return failed(command, style, {
        code: 'operation-failed',
        params: { detail: '`report-bug` opens no session' },
      })
  }
}

/**
 * `report-bug`: re-run the failing command, then write what it did.
 *
 * The re-run happens in this process rather than in a child, because the
 * envelope is the payload and a child would only hand back the bytes it printed.
 */
function report(command: Command, style: Style): Outcome {
  const inner = parse(command.trailing, command.cwd)
  // Reproducing a reproduction writes two reports over one path and reads as one
  // failure nested in another. The command that failed is the one to give it.
  if (inner.ok && inner.command.operation === 'report-bug') {
    return failed(command, style, { code: 'report-recursive', params: {} })
  }

  const envelope = reportBug(reproduce(command, inner), command.withRepository)
  const written = write(command, envelope)
  return written.error === null
    ? present(command, envelope, written, style)
    : failed(command, style, written.error)
}

/**
 * Run the failing command again, and record what running it cost.
 *
 * `operation` and `cwd` come from the parse rather than from the run, because a
 * command line that named nothing codedocs knows still has a report owed about
 * it — and the report then says so rather than guessing at an operation.
 */
function reproduce(command: Command, inner: ParsedArgs): Reproduction {
  const started = performance.now()
  const rerun = execute(command.trailing, command.cwd)
  return {
    argv: command.trailing,
    operation: inner.ok ? inner.command.operation : null,
    flags: flagsIn(command.trailing),
    // Where the failing command ran, which is the index the report describes.
    cwd: inner.ok ? inner.command.cwd : command.cwd,
    exitCode: rerun.code,
    durationMs: Math.round(performance.now() - started),
    envelope: rerun.envelope,
    error: rerun.error,
  }
}

/**
 * What a written report prints, which depends only on where it went.
 *
 * With `--out -` the report *is* stdout, so the disclosure moves to stderr
 * rather than into the bytes an agent is piping. `--json` puts the envelope on
 * stdout as every other operation does, and prints no disclosure at all: it is
 * in the file, and in the `carries` block of the report itself.
 */
function present(
  command: Command,
  envelope: ReportEnvelope,
  written: Written,
  style: Style,
): Outcome {
  const disclosure = renderReport(envelope, written.path, style)
  const toStdout = written.path === null
  return {
    stdout: command.json
      ? JSON.stringify(envelope, null, 2)
      : toStdout
        ? written.text
        : disclosure,
    stderr: command.json || !toStdout ? '' : disclosure,
    code: 0,
    envelope,
    error: null,
  }
}

/**
 * Write the report where `--out` said, or report that it could not be.
 *
 * `path` is `null` for `--out -`, which writes no file: `text` is then the
 * payload the caller puts on stdout. codedocs writes the one file it was asked
 * for and edits nothing else — not the user's `.gitignore`, not their config.
 */
interface Written {
  /** Where it landed, or `null` for `--out -`, which writes no file. */
  readonly path: string | null
  /** The report as JSON, which is the payload `--out -` puts on stdout. */
  readonly text: string
  readonly error: EnvelopeError | null
}

function write(command: Command, envelope: ReportEnvelope): Written {
  const text = JSON.stringify(envelope.result, null, 2)
  const out = command.out ?? REPORT_FILE
  if (out === '-') return { path: null, text, error: null }
  // Relative to the directory the user is standing in, not to `--cwd`: `--cwd`
  // names the repository to answer about, and a file the user is meant to find
  // belongs where they typed the command.
  const path = resolve(process.cwd(), out)
  try {
    writeFileSync(path, `${text}\n`)
  } catch (error) {
    return {
      path,
      text,
      error: {
        code: 'report-unwritable',
        params: { out, detail: messageOf(error) },
        stack: codedocsFrames(error),
      },
    }
  }
  return { path, text, error: null }
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
): Outcome {
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
    envelope,
    error,
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
): Outcome {
  return {
    stdout: json ? JSON.stringify(envelope, null, 2) : human(),
    stderr: '',
    code: 0,
    envelope,
    error: null,
  }
}

/**
 * Why the session could not be opened.
 *
 * A bad `codedocs.jsonc` keeps its own code: ADR 0010 makes it a different
 * repair from an index that will not open, and the refusal already carries the
 * parameters that say which key was wrong.
 */
function unavailable(error: unknown): EnvelopeError {
  const stack = codedocsFrames(error)
  if (error instanceof ConfigError) return { ...error.refusal, stack }
  return {
    code: 'index-unavailable',
    params: { detail: messageOf(error) },
    stack,
  }
}

/**
 * The thrown message, kept as a parameter rather than as the error itself.
 *
 * It is free text out of `node:fs` or the adapter and can name a path, which is
 * exactly why it is a parameter: ADR 0011's default report drops parameters and
 * keeps codes.
 */
const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)
