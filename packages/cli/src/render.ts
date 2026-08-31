/**
 * The human renderer.
 *
 * ADR 0006: a pure function of the envelope. It never queries the index and
 * never sees a field `--json` withheld. It may colour, group, add totals and
 * headers, wrap and hyperlink; it may not re-sort, change a fact, drop a result
 * silently, or omit blind spots, truncation or non-deterministic provenance.
 */

import type {
  AnalysisTotals,
  CallEdge,
  Envelope,
  ProjectSummary,
  SymbolNode,
} from '@codedocs/core'

/** Terminal styling, disabled wholesale when colour is off. */
export interface Style {
  dim(text: string): string
  bold(text: string): string
  warn(text: string): string
}

/** Written as a code point so no control character enters the source. */
const ESC = String.fromCharCode(27)

/** Build the style functions for one invocation. */
export function styleFor(color: boolean): Style {
  const wrap =
    (code: string) =>
    (text: string): string =>
      color ? `${ESC}[${code}m${text}${ESC}[0m` : text
  return { dim: wrap('2'), bold: wrap('1'), warn: wrap('33') }
}

/** An `analyse` envelope, which carries totals alongside the standard shape. */
export type AnalyseEnvelope = Envelope<readonly ProjectSummary[]> & {
  readonly totals: AnalysisTotals
}

/** Render an `analyse` answer. */
export function renderAnalyse(envelope: AnalyseEnvelope, style: Style): string {
  const lines = (envelope.result ?? []).map((row) => {
    const fidelity =
      row.fidelity === 'typed' ? style.dim('typed') : style.warn('syntactic')
    return `  ${row.project}  ${style.dim(`${row.files} files`)}  ${fidelity}`
  })
  const { symbols, callEdges, unresolvedCalls } = envelope.totals
  const totals =
    `  ${style.bold(String(symbols))} symbols, ` +
    `${style.bold(String(callEdges))} call edges, ` +
    `${unresolvedCalls} call sites unresolved`
  return finish(
    envelope,
    lines.length > 0 ? [...lines, '', totals] : [],
    style,
    'projects',
  )
}

/** Render a `symbol` answer. */
export function renderSymbols(
  envelope: Envelope<readonly SymbolNode[]>,
  style: Style,
): string {
  const lines = (envelope.result ?? []).map((node) => {
    const durability = node.durable ? '' : ` ${style.warn('local')}`
    const where = style.dim(`${node.file}:${node.line}`)
    return `  ${node.id}  ${style.dim(node.kind)}  ${where}${durability}`
  })
  return finish(envelope, lines, style, 'symbols')
}

/** Render a `callers` or `callees` answer. */
export function renderEdges(
  envelope: Envelope<readonly CallEdge[]>,
  style: Style,
): string {
  const showTarget = envelope.operation === 'callees'
  const lines = (envelope.result ?? []).map((edge) => {
    const subject = showTarget ? edge.to : edge.from
    const attribution =
      edge.attribution === 'symbol'
        ? ''
        : ` ${style.warn(`(${edge.attribution})`)}`
    // Provenance is shown whenever it is not observed, because an inferred or
    // syntactic edge must never read as a checked one.
    const provenance =
      edge.provenance === 'deterministic'
        ? ''
        : ` ${style.warn(`[${edge.provenance}: ${edge.derivation}]`)}`
    const where = style.dim(`${edge.file}:${edge.line}`)
    return `  ${subject}${attribution}  ${where}${provenance}`
  })
  return finish(envelope, lines, style, 'call edges')
}

/** Render a failure envelope. */
export function renderError(envelope: Envelope<never>, style: Style): string {
  const error = envelope.error
  return style.warn(
    `  ${error?.code ?? 'error'}: ${error?.message ?? 'could not answer'}`,
  )
}

/**
 * Append the honesty footer every answer owes.
 *
 * The index header may be omitted when the answer is complete and the working
 * tree has not drifted, because no news is the honest render of a clean state.
 * Blind spots and truncation are never omitted.
 */
function finish(
  envelope: Envelope<unknown>,
  lines: readonly string[],
  style: Style,
  unit: string,
): string {
  const out = lines.length > 0 ? [...lines] : [style.dim(`  no ${unit}`)]
  const { budget, request } = envelope

  if (budget.truncated) {
    out.push(
      '',
      style.dim(
        `  showing ${budget.returned} of ${budget.available} — pass --limit for more`,
      ),
    )
  }

  // An ambiguous subject is not an error: the candidates are the answer to
  // "which did you mean", so they are named rather than costing a round trip.
  if (request.resolved.length > 1 && envelope.operation !== 'symbol') {
    const subject = request.subject ?? ''
    out.push(
      '',
      style.warn(
        `  \`${subject}\` is ambiguous — ${request.resolved.length} symbols:`,
      ),
      ...request.resolved.map((id) => style.dim(`    ${id}`)),
    )
  }

  const syntactic = envelope.conditions.filter(
    (row) => row.fidelity === 'syntactic',
  )
  if (syntactic.length > 0) {
    out.push(
      '',
      style.warn(`  ${syntactic.length} project(s) analysed without types:`),
      ...syntactic.map((row) => style.dim(`    ${row.project}`)),
      // Named, not diagnosed. A remediation needs a framework lookup ADR 0001
      // allows to be absent, and guessing "run install" is wrong for a tsconfig
      // that simply globs nothing.
      style.dim('    calls into and out of these projects may be missing'),
    )
  }

  if (envelope.blindSpots.length > 0) {
    out.push(
      '',
      style.warn(
        `  ${envelope.blindSpots.length} blind spot(s) — this answer may be incomplete:`,
      ),
    )
    for (const spot of envelope.blindSpots.slice(0, 10)) {
      out.push(style.dim(`    ${spot.subject} — ${spot.reason}`))
    }
    if (envelope.blindSpots.length > 10) {
      out.push(style.dim(`    …and ${envelope.blindSpots.length - 10} more`))
    }
  }

  if (envelope.snapshot.dirty) {
    const commit = envelope.snapshot.commit ?? 'an unknown commit'
    out.push('', style.dim(`  answered from the snapshot at ${commit}`))
  }

  return out.join('\n')
}
