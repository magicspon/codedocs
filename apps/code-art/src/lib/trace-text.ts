import type { Trace, TraceQuery } from './trace.ts'

/**
 * The trace in words, for the search panel and the file panel. Kept apart from
 * the components so the wording can be tested without a DOM.
 */

/** `n` hops, in words. */
function hopCount(n: number): string {
  return `${n} ${n === 1 ? 'hop' : 'hops'}`
}

/** One line on what the trace holds, or why it holds nothing. */
export function traceSummary(query: TraceQuery, trace: Trace | null): string {
  if (!query.text.trim()) return 'Type part of a path, or click a file.'
  if (!trace) return 'No file path matches.'
  const reached = trace.focus.filter((f) => f > 0 && f < 1).length
  const matched = trace.matches.length
  const found = `${matched} ${matched === 1 ? 'file' : 'files'} found`
  const capped =
    matched > trace.roots.length
      ? ` (tracing the first ${trace.roots.length})`
      : ''
  return `${found}${capped} · ${reached} reached · ${trace.edges.length} links`
}

/** Where `file` sits on the trace, in words, or `undefined` off it. */
export function traceHops(
  trace: Trace | null,
  file: number | null,
): string | undefined {
  if (!trace || file === null) return undefined
  if (trace.focus[file]! >= 1) return 'searched'
  const parts = [
    trace.hopIn[file]! > 0 ? `${hopCount(trace.hopIn[file]!)} in` : '',
    trace.hopOut[file]! > 0 ? `${hopCount(trace.hopOut[file]!)} out` : '',
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : undefined
}
