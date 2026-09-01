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
  CallSite,
  Envelope,
  ProjectConditions,
  ProjectSummary,
  RepairReport,
  SymbolNode,
  TracePath,
} from '@codedocs/core'

import { formatError } from './messages.ts'

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
  readonly repair: RepairReport | null
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
  const body = lines.length > 0 ? [...lines, '', totals] : []
  const repair = repairLine(envelope.repair, style)
  return finish(
    envelope,
    repair === null ? body : [...body, repair],
    style,
    'projects',
  )
}

/**
 * What this invocation paid to bring the index up to date.
 *
 * A cold build behind a question that asked for a repair is the one cost worth
 * naming every time: it is 16 s against 3 ms on cal.com, and the reason is always
 * something the user can act on.
 */
function repairLine(repair: RepairReport | null, style: Style): string | null {
  if (repair === null) return null
  if (repair.kind === 'wave') {
    const files = repair.files === 1 ? '1 file' : `${repair.files} files`
    const waves = repair.waves === 1 ? '1 wave' : `${repair.waves} waves`
    // The environment half is named separately because nothing in the tree
    // changed: an install or a codegen landed, and the projects it reached were
    // re-analysed rather than repaired.
    const environment =
      repair.environment.length === 0
        ? ''
        : `, and re-analysed ${count(repair.environment.length, 'project')} ` +
          `whose environment changed (${repair.environment.join(', ')})`
    return style.dim(`  repaired ${files} in ${waves}${environment}`)
  }
  return style.warn(`  rebuilt cold (${repair.files} files): ${repair.reason}`)
}

/** `1 project` / `3 projects`, for a line that counts something. */
const count = (n: number, unit: string): string =>
  `${n} ${unit}${n === 1 ? '' : 's'}`

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

/**
 * Render a `callers` or `callees` answer.
 *
 * The end an answer prints is the end the caller did not name: `callers` shows
 * the source, `callees` the target.
 */
export function renderEdges(
  envelope: Envelope<readonly CallEdge[]>,
  style: Style,
): string {
  const showTarget = envelope.operation === 'callees'
  const lines = (envelope.result ?? []).map((edge) => {
    const subject = showTarget ? edge.to : edge.from
    return `  ${subject}  ${renderSite(edge, style)}`
  })
  return finish(envelope, lines, style, 'call edges')
}

/**
 * Render a `trace` answer as a tree, collapsing the prefix each path shares
 * with the one before it.
 *
 * ADR 0006 allows the human renderer to group, and here it has to: the sort puts
 * paths sharing a prefix next to each other, and printing every path in full
 * repeats the same four lines a dozen times over on a real repository. The
 * collapse is lossless — two paths agreeing on a node prefix necessarily agree
 * on those steps' call sites, because a step's sites are every site between the
 * same two symbols.
 */
export function renderTrace(
  envelope: Envelope<readonly TracePath[]>,
  style: Style,
): string {
  const lines: string[] = []
  let previous: readonly string[] = []
  for (const path of envelope.result ?? []) {
    const sequence = [path.root, ...path.steps.map((step) => step.to)]
    const shared = sharedPrefix(previous, sequence)
    if (shared === 0) lines.push(`  ${path.root}`)
    for (let at = Math.max(shared, 1); at <= path.steps.length; at += 1) {
      const step = path.steps[at - 1]
      if (step === undefined) continue
      const closes =
        path.terminus === 'cycle' && at === path.steps.length
          ? ` ${style.warn('↺ cycle')}`
          : ''
      const sites = renderSites(step.sites, style)
      lines.push(`${indent(at)}→ ${step.to}  ${sites}${closes}`)
    }
    lines.push(...terminusNote(path, envelope.request.depth, style))
    previous = sequence
  }
  return finish(envelope, lines, style, 'paths')
}

/** How many leading symbols two path sequences agree on. */
function sharedPrefix(a: readonly string[], b: readonly string[]): number {
  let at = 0
  while (at < a.length && at < b.length && a[at] === b[at]) at += 1
  return at
}

/** One level of the tree per step, with the root's own two spaces underneath. */
const indent = (level: number): string => '  '.repeat(level + 1)

/** The tail of a path that neither ended nor closed a loop, said out loud. */
function terminusNote(
  path: TracePath,
  depth: number | null,
  style: Style,
): readonly string[] {
  if (path.terminus === 'depth') {
    // Only a caller's own `--depth` can produce this terminus, so the number is
    // always there to name; the fallback is for a hand-built envelope.
    const bound = depth === null ? '' : ` ${depth}`
    return [
      style.warn(
        `${indent(path.steps.length + 1)}⇣ more calls beyond depth${bound}`,
      ),
    ]
  }
  // A root that calls nothing renders as a bare id, which reads as an answer
  // withheld rather than as the answer it is.
  if (path.terminus === 'leaf' && path.steps.length === 0) {
    return [style.dim('    calls nothing')]
  }
  return []
}

/**
 * The honesty fields a site carries, printed only where they are not the plain
 * case.
 *
 * Shared by `renderEdges` and `renderTrace` so the two cannot disagree about
 * when a fact is worth flagging: a call credited to a file, or produced by the
 * adapter's own rule, must never read as a checked one. Both belong beside the
 * site rather than beside either endpoint, because they describe this instance.
 */
function annotate(site: CallSite, style: Style): string {
  const attribution =
    site.attribution === 'symbol'
      ? ''
      : ` ${style.warn(`(${site.attribution})`)}`
  const provenance =
    site.provenance === 'deterministic'
      ? ''
      : ` ${style.warn(`[${site.provenance}: ${site.derivation}]`)}`
  return `${attribution}${provenance}`
}

/** One call site: where it is, and what to know about it. */
const renderSite = (site: CallSite, style: Style): string =>
  `${style.dim(`${site.file}:${site.line}`)}${annotate(site, style)}`

/**
 * Every site of one step, with the lines that share a file collapsed onto it.
 *
 * A hot step in cal.com has six sites in one file, and printing the path six
 * times costs 300 columns to say what the first one said. Sites arrive sorted by
 * `(file, line)`, so a file's lines are contiguous; sites whose honesty fields
 * differ never merge, because the annotation belongs to the instance.
 */
function renderSites(sites: readonly CallSite[], style: Style): string {
  const groups: { readonly site: CallSite; readonly lines: number[] }[] = []
  for (const site of sites) {
    const last = groups.at(-1)
    if (
      last !== undefined &&
      last.site.file === site.file &&
      sameFacts(last.site, site)
    ) {
      last.lines.push(site.line)
    } else {
      groups.push({ site, lines: [site.line] })
    }
  }
  return groups
    .map(
      (group) =>
        `${style.dim(`${group.site.file}:${group.lines.join(',')}`)}${annotate(group.site, style)}`,
    )
    .join('  ')
}

const sameFacts = (a: CallSite, b: CallSite): boolean =>
  a.attribution === b.attribution &&
  a.provenance === b.provenance &&
  a.derivation === b.derivation

/** Render a failure envelope. */
export function renderError(envelope: Envelope<never>, style: Style): string {
  const error = envelope.error
  if (error === undefined) return style.warn('  error: could not answer')
  return style.warn(`  ${error.code}: ${formatError(error)}`)
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
  const body = lines.length > 0 ? lines : [emptyLine(envelope, style, unit)]
  return [
    ...body,
    ...truncationNote(envelope, style),
    ...ambiguityNote(envelope, style),
    ...syntacticNote(envelope, style),
    ...blindSpotNote(envelope, style),
    ...snapshotNote(envelope, style),
  ].join('\n')
}

/**
 * What an answer with nothing in it says.
 *
 * "No callers" and "no such symbol" are different facts, and an operation that
 * resolves its subject knows which one it is holding. Saying only the first
 * leaves a caller retrying a name that will never match — and for `trace` it
 * would be plainly wrong, since a root that calls nothing still answers with a
 * path of no steps.
 */
function emptyLine(
  envelope: Envelope<unknown>,
  style: Style,
  unit: string,
): string {
  const { subject, resolved } = envelope.request
  if (subject !== null && resolved.length === 0) {
    return style.warn(`  \`${subject}\` matched no symbol`)
  }
  return style.dim(`  no ${unit}`)
}

/** How many blind spots are named before the rest are counted. */
const BLIND_SPOT_LIMIT = 10

/** Each note is empty or opens with a blank line, so `finish` never spaces them itself. */
type Note = readonly string[]

function truncationNote(envelope: Envelope<unknown>, style: Style): Note {
  const { budget } = envelope
  if (!budget.truncated) return []
  return [
    '',
    style.dim(
      `  showing ${budget.returned} of ${budget.available} — pass --limit for more`,
    ),
  ]
}

/**
 * An ambiguous subject is not an error: the candidates are the answer to "which
 * did you mean", so they are named rather than costing a round trip.
 */
function ambiguityNote(envelope: Envelope<unknown>, style: Style): Note {
  const { resolved, subject } = envelope.request
  if (resolved.length <= 1 || envelope.operation === 'symbol') return []
  return [
    '',
    style.warn(
      `  \`${subject ?? ''}\` is ambiguous — ${resolved.length} symbols:`,
    ),
    ...resolved.map((id) => style.dim(`    ${id}`)),
  ]
}

function syntacticNote(envelope: Envelope<unknown>, style: Style): Note {
  const syntactic = envelope.conditions.filter(
    (row) => row.fidelity === 'syntactic',
  )
  if (syntactic.length === 0) return []
  return [
    '',
    style.warn(`  ${syntactic.length} project(s) analysed without types:`),
    ...syntactic.map((row) => style.dim(`    ${row.project}${causeOf(row)}`)),
    style.dim('    calls into and out of these projects may be missing'),
  ]
}

/**
 * Why one project was analysed without types, in the caller's own terms.
 *
 * The cause is read off the stored preflight rather than guessed at: an absent
 * install and a config that globs nothing are fixed by different commands, and
 * ADR 0001 refuses a remediation that would send a user the wrong way. Signal 2
 * only sharpens the first — a repository that declares an install script has
 * codegen waiting behind its install.
 */
function causeOf(row: ProjectConditions): string {
  if (row.cause === 'unprepared') {
    return row.postinstall
      ? ' — no node_modules; install (its postinstall generates types)'
      : ' — no node_modules; install the dependencies'
  }
  if (row.cause === 'missing-generated') {
    return ' — its config globs no files, so something has yet to generate them'
  }
  return ''
}

function blindSpotNote(envelope: Envelope<unknown>, style: Style): Note {
  const spots = envelope.blindSpots
  if (spots.length === 0) return []
  const overflow = spots.length - BLIND_SPOT_LIMIT
  return [
    '',
    style.warn(
      `  ${spots.length} blind spot(s) — this answer may be incomplete:`,
    ),
    ...spots
      .slice(0, BLIND_SPOT_LIMIT)
      .map((spot) => style.dim(`    ${spot.subject} — ${spot.reason}`)),
    ...(overflow > 0 ? [style.dim(`    …and ${overflow} more`)] : []),
  ]
}

function snapshotNote(envelope: Envelope<unknown>, style: Style): Note {
  const { dirty, commit } = envelope.snapshot
  if (!dirty) return []
  return [
    '',
    style.dim(
      `  answered from the snapshot at ${commit ?? 'an unknown commit'}`,
    ),
  ]
}
