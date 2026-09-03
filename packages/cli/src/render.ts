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
  BaselineReport,
  BaselineUsed,
  CallEdge,
  Capture,
  Change,
  CallSite,
  Classification,
  Candidate,
  ClaimReport,
  Disagreement,
  DocsEnvelope,
  DoctorEnvelope,
  DocumentFault,
  DocumentReport,
  DraftReport,
  Envelope,
  EvidenceEnvelope,
  EvidenceKind,
  FileReport,
  ImpactEnvelope,
  ImportEdge,
  Label,
  LabelPass,
  Precondition,
  ProjectConditions,
  ProjectSummary,
  ReferenceEdge,
  RepairReport,
  SectionReport,
  ReportEnvelope,
  SpecifierEvidence,
  SymbolNode,
  TracePath,
} from '@codedocs/core'

import { operationSpec, shorthandOf } from '@codedocs/core'

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
  readonly labels: LabelPass | null
  readonly capture: Capture | null
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
  const notes = [
    repairLine(envelope.repair, style),
    labelLine(envelope.labels, style),
    captureLine(envelope.capture, style),
  ].filter((line): line is string => line !== null)
  return finish(envelope, [...body, ...notes], style, 'projects')
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

/**
 * What the label pass cost, when one ran.
 *
 * ADR 0003 recomputes the whole layer rather than invalidating it, on the
 * strength of ~0.9 s over cal.com's 5,025 files. Printing the number is what
 * keeps that a measurement rather than an assumption.
 */
function labelLine(pass: LabelPass | null, style: Style): string | null {
  if (pass === null) return null
  const git = pass.tracked ? '' : ', git absent'
  return style.dim(
    `  labelled ${count(pass.files, 'file')} in ${pass.durationMs} ms${git}`,
  )
}

/**
 * What was captured as a baseline, or why nothing was.
 *
 * Said out loud because it is a side effect: ADR 0008 gives capture no command
 * of its own, and a 20 MB copy that happens silently is one a user cannot
 * account for. The decline is printed too — "the tree is not clean" is the
 * answer to "why is there no baseline to compare against".
 */
function captureLine(taken: Capture | null, style: Style): string | null {
  if (taken === null) return null
  if (taken.commit === null) {
    return style.dim(`  no baseline captured — ${taken.declined ?? 'declined'}`)
  }
  const evicted =
    taken.evicted.length === 0
      ? ''
      : `, evicting ${count(taken.evicted.length, 'baseline')}`
  return style.dim(
    `  captured a baseline for ${taken.commit.slice(0, 7)}` +
      ` (${Math.round(taken.bytes / 1024)} KB)${evicted}`,
  )
}

/** `1 project` / `3 projects`, for a line that counts something. */
const count = (n: number, unit: string): string =>
  `${n} ${unit}${n === 1 ? '' : 's'}`

/**
 * Render an `impact` answer.
 *
 * Grouped by distance from the change, because that is the question a reader
 * has: the seeds are what was edited, and each level out is one more hop of
 * "would notice". The edge kind rides on every row — a symbol reached because a
 * type it names moved is a different fact from one that calls it.
 */
export function renderImpact(envelope: ImpactEnvelope, style: Style): string {
  const lines: string[] = []
  let depth: number | undefined
  for (const found of envelope.result ?? []) {
    if (found.depth !== depth) {
      depth = found.depth
      lines.push(
        style.bold(depth === 0 ? '  changed' : `  ${count(depth, 'step')} out`),
      )
    }
    const through =
      found.through === 'changed' ? '' : `  ${style.dim(found.through)}`
    lines.push(`    ${shorthandOf(found.id)}${through}`)
  }
  return [
    finish(envelope, lines, style, 'impacted symbols'),
    ...changesNote(envelope.changes, style),
    ...baselineChoiceNote(envelope.baseline, style),
  ].join('\n')
}

/** How many changed files are named before the rest are counted. */
const CHANGE_LIMIT = 10

/** What the comparison found different, which is where the walk started. */
function changesNote(changes: readonly Change[], style: Style): Note {
  const counted = changes.filter((change) => change.excluded === null)
  if (counted.length === 0) {
    return ['', style.dim('  nothing changed against the baseline')]
  }
  const overflow = counted.length - CHANGE_LIMIT
  return [
    '',
    style.dim(`  ${count(counted.length, 'file')} changed:`),
    ...counted
      .slice(0, CHANGE_LIMIT)
      .map((change) => style.dim(`    ${change.file} (${change.kind})`)),
    ...(overflow > 0 ? [style.dim(`    …and ${overflow} more`)] : []),
  ]
}

/**
 * Which baseline answered, and how far it is from the one asked for.
 *
 * Substitution is part of the request rather than a limitation of the answer, so
 * it is stated plainly here and never filed as a blind spot: codedocs knows
 * exactly which index it compared against.
 */
function baselineChoiceNote(choice: BaselineUsed, style: Style): Note {
  const used = choice.commit
  if (used === null) return []
  const asked = choice.requested
  if (asked === null || asked === used) {
    return ['', style.dim(`  compared against ${used.slice(0, 7)}`)]
  }
  const away =
    choice.distance === null
      ? ''
      : `, ${count(Math.abs(choice.distance), 'commit')} ` +
        `${choice.distance < 0 ? 'behind' : 'ahead of'} it`
  return [
    '',
    style.warn(
      `  no baseline for ${asked.slice(0, 7)} — compared against ` +
        `${used.slice(0, 7)}${away}`,
    ),
  ]
}

/** How many distinct specifiers are named under one precondition. */
const SPECIFIER_LIMIT = 5

/**
 * Render a `doctor` answer: every unmet precondition, grouped by project.
 *
 * The grouping is the renderer's own — ADR 0006 allows it — over rows the
 * operation already deduplicated and sorted. Two things are never dropped: the
 * cause, which says what is wrong, and the absence of a remediation, which is a
 * fact about `unmapped` and `broken` rather than a gap in the output.
 */
export function renderDoctor(envelope: DoctorEnvelope, style: Style): string {
  const lines: string[] = []
  let project: string | null | undefined
  for (const found of envelope.result ?? []) {
    if (found.project !== project) {
      project = found.project
      lines.push(
        `  ${style.bold(project ?? 'files no project claims')}${fidelityOf(found, style)}`,
      )
    }
    lines.push(...precondition(found, style))
  }
  return [
    finish(envelope, lines, style, 'unmet preconditions'),
    ...measuredNote(envelope.measured, style),
    ...classificationNote(envelope.classification, style),
    ...baselineNote(envelope.baselines, style),
    ...headerNote(envelope, style),
  ].join('\n')
}

/** The project's stored fidelity, shown once beside its name. */
function fidelityOf(found: Precondition, style: Style): string {
  if (found.fidelity === null) return ''
  return found.fidelity === 'typed'
    ? style.dim('  typed')
    : style.warn('  syntactic')
}

/** One precondition: its cause, what evidenced it, and what would clear it. */
function precondition(found: Precondition, style: Style): string[] {
  const evidence = found.signal
    ? [style.dim('      the project’s own signals')]
    : []
  const overflow = found.specifiers.length - SPECIFIER_LIMIT
  return [
    `    ${style.warn(found.cause)}${postinstallNote(found, style)}`,
    ...evidence,
    ...found.specifiers
      .slice(0, SPECIFIER_LIMIT)
      .map((seen) => style.dim(`      ${specifier(seen)}`)),
    ...(overflow > 0
      ? [style.dim(`      …and ${overflow} more specifier(s)`)]
      : []),
    ...remediationLines(found, style),
  ]
}

/** One distinct specifier, its site count, and the files that wrote it. */
function specifier(seen: SpecifierEvidence): string {
  const files =
    seen.files.length === 1
      ? (seen.files[0] ?? '')
      : `${seen.files.length} files`
  return `${seen.specifier} — ${count(seen.sites, 'site')} in ${files}`
}

/**
 * What would clear it, or the silence ADR 0001 requires.
 *
 * `unmapped` and `broken` are rendered with no remediation at all, and a
 * `missing-generated` the config says nothing about is told it can be declared —
 * codedocs ships knowing nothing about any framework, deliberately.
 */
function remediationLines(found: Precondition, style: Style): string[] {
  if (found.remediations.length > 0) {
    return found.remediations.map((command) => `      run \`${command}\``)
  }
  if (found.cause !== 'missing-generated') return []
  return [style.dim('      no command known — declare one in codedocs.jsonc')]
}

/** Signal 2, which only sharpens `unprepared`: the install generates types too. */
const postinstallNote = (found: Precondition, style: Style): string =>
  found.cause === 'unprepared' && found.postinstall
    ? style.dim(' — its postinstall generates types')
    : ''

/** What `--measure` found, which is never a precondition: it is a disagreement. */
function measuredNote(
  measured: readonly Disagreement[] | null,
  style: Style,
): Note {
  if (measured === null) return []
  if (measured.length === 0) {
    return ['', style.dim('  the working tree agrees with the index')]
  }
  return [
    '',
    style.warn(`  ${measured.length} signal(s) disagree with the index:`),
    ...measured.map((found) =>
      style.dim(
        `    ${found.project} ${found.signal}: indexed ${found.indexed}, now ${found.measured}`,
      ),
    ),
  ]
}

/** How many disagreeing files are named before the rest are counted. */
const DISAGREEMENT_LIMIT = 5

/**
 * What the label layer decided, and where it is least sure.
 *
 * The disagreements are the point of the section: `classify` in
 * `codedocs.jsonc` is the escape hatch, and this list is how a user discovers
 * both that it exists and which file needs it.
 */
function classificationNote(found: Classification, style: Style): Note {
  const pairs = found.counts.map((row) =>
    style.dim(
      `    ${row.role}, ${row.authorship}: ${count(row.files, 'file')} ` +
        `(${row.derivations.join(', ')})`,
    ),
  )
  if (pairs.length === 0) return []
  const overflow = found.disagreements.length - DISAGREEMENT_LIMIT
  return [
    '',
    style.bold('  classification'),
    ...pairs,
    ...(found.inferred.length === 0
      ? []
      : [
          style.dim(
            `    ${count(found.inferred.length, 'file')} classified by ` +
              'convention rather than evidence',
          ),
        ]),
    ...(found.disagreements.length === 0
      ? []
      : [
          style.warn(
            `    ${count(found.disagreements.length, 'file')} where two ` +
              'signals disagree — set `classify` in codedocs.jsonc:',
          ),
          ...found.disagreements
            .slice(0, DISAGREEMENT_LIMIT)
            .map((row) =>
              style.dim(
                `      ${row.file} ${row.axis}: ` +
                  row.values
                    .map((held) => `${held.value} (${held.derivation})`)
                    .join(' vs '),
              ),
            ),
          ...(overflow > 0 ? [style.dim(`      …and ${overflow} more`)] : []),
        ]),
  ]
}

/**
 * The baselines held, and how far `HEAD` has moved from the newest.
 *
 * ADR 0008 calls its cap of three a guess and says so. With telemetry ruled out,
 * this line is the only place the guess accrues evidence: a distance that keeps
 * growing is a cap that is too small.
 */
function baselineNote(report: BaselineReport, style: Style): Note {
  if (report.cap === 0) {
    return ['', style.dim('  baselines are disabled (`baselines: 0`)')]
  }
  if (report.held.length === 0) {
    return [
      '',
      style.dim(
        '  no baselines held — one is captured by `analyse` over a clean tree',
      ),
    ]
  }
  const distance =
    report.distance === null
      ? ''
      : `, HEAD is ${count(report.distance, 'commit')} ahead of the newest`
  const usable = report.held.filter((one) => one.ancestor).length
  return [
    '',
    style.dim(
      `  ${count(report.held.length, 'baseline')} of ${report.cap} held` +
        `${usable === report.held.length ? '' : ` (${usable} usable)`}` +
        distance,
    ),
  ]
}

/**
 * The index header, which is where a user discovers that their index was built
 * by another tool or TypeScript version (ADR 0004).
 */
function headerNote(envelope: DoctorEnvelope, style: Style): Note {
  const { header } = envelope
  return [
    '',
    style.dim(
      `  ${count(header.projects, 'project')}, ${count(header.files, 'file')}, ` +
        `built by codedocs ${header.toolVersion} against TypeScript ${header.typescriptVersion}`,
    ),
  ]
}

/** Render a `symbol` answer. */
export function renderSymbols(
  envelope: Envelope<readonly SymbolNode[]>,
  style: Style,
): string {
  const lines = (envelope.result ?? []).map(
    (node) => `  ${symbolLine(node, style)}`,
  )
  return finish(envelope, lines, style, 'symbols')
}

/** One symbol row, shared with `evidence` so the two cannot print it differently. */
function symbolLine(node: SymbolNode, style: Style): string {
  const durability = node.durable ? '' : ` ${style.warn('local')}`
  const where = style.dim(`${node.file}:${node.line}`)
  return `${shorthandOf(node.id)}  ${style.dim(node.kind)}  ${where}${durability}`
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
    return `  ${shorthandOf(subject)}  ${renderSite(edge, style)}`
  })
  return finish(envelope, lines, style, 'call edges')
}

/**
 * Render a `references` answer.
 *
 * Both directions arrive in one list, so each line names both ends: unlike
 * `callers`, the end the caller did not ask about is not the same end on every
 * row. The kind is never dropped — `extends` and a type annotation are different
 * facts about the same pair.
 */
export function renderReferences(
  envelope: Envelope<readonly ReferenceEdge[]>,
  style: Style,
): string {
  const lines = (envelope.result ?? []).map(
    (edge) => `  ${referenceLine(edge, style)}`,
  )
  return finish(envelope, lines, style, 'references')
}

/** One reference row, shared with `evidence`. Provenance is never dropped. */
function referenceLine(edge: ReferenceEdge, style: Style): string {
  const where = style.dim(`${edge.file}:${edge.line}`)
  const how =
    edge.provenance === 'deterministic'
      ? ''
      : ` ${style.warn(`[${edge.provenance}: ${edge.derivation}]`)}`
  const from = shorthandOf(edge.from)
  return `${from} ${style.warn(edge.kind)} ${shorthandOf(edge.to)}  ${where}${how}`
}

/** How many symbols, imports or importers are named before the rest are counted. */
const FILE_LIST_LIMIT = 10

/**
 * Render a `file` answer.
 *
 * Grouped under headings rather than flattened, because the four lists answer
 * four questions and a caller reading one has no use for the other three
 * interleaved. Each is capped and says what it capped, which is the renderer's
 * only licence to withhold.
 */
export function renderFile(
  envelope: Envelope<readonly FileReport[]>,
  style: Style,
): string {
  const lines = (envelope.result ?? []).flatMap((report) =>
    fileLines(report, style).map((line) => `  ${line}`),
  )
  return finish(envelope, lines, style, 'files')
}

/**
 * One file's row set, indented relative to wherever it is printed.
 *
 * Relative because `evidence` prints the same block one level deeper, under the
 * heading for its own kind: the two operations report the same file facts, and
 * a second copy of this would be a second thing to keep in step.
 */
function fileLines(report: FileReport, style: Style): string[] {
  return [
    `${style.bold(report.path)}${fidelityNote(report, style)}`,
    ...projectLines(report, style),
    ...listing(
      'declares',
      report.symbols.map(
        (node) => `${node.qualified}  ${style.dim(node.kind)}`,
      ),
      style,
    ),
    ...listing('imports', report.imports.map(importLine), style),
    ...listing('imported by', [...report.importers], style),
  ]
}

/** The fidelity the file was analysed at, with the cause where there is one. */
function fidelityNote(report: FileReport, style: Style): string {
  if (report.fidelity === null) return style.warn('  not analysed')
  if (report.fidelity === 'typed') return style.dim('  typed')
  const cause = report.cause === null ? '' : ` (${report.cause})`
  return style.warn(`  syntactic${cause}`)
}

/**
 * The projects that globbed the file, with the canonical one marked.
 *
 * Marked rather than listed alone: a file can belong to several, and which one
 * produced its facts is what decides the fidelity on the line above.
 */
function projectLines(report: FileReport, style: Style): string[] {
  if (report.projects.length === 0) return []
  return [
    style.dim(
      `  in ${report.projects
        .map((project) =>
          project === report.canonicalProject ? `${project} *` : project,
        )
        .join(', ')}`,
    ),
  ]
}

/** One import: the specifier, and the file it resolved to or that it did not. */
const importLine = (edge: ImportEdge): string =>
  edge.to === null
    ? `${edge.specifier} → unresolved`
    : `${edge.specifier} → ${edge.to}`

/**
 * One capped list under its heading.
 *
 * The heading is printed even for an empty list: a file nothing imports is the
 * answer to the question most often asked of this operation, and silence there
 * reads as an answer withheld rather than as the count it is.
 */
function listing(
  heading: string,
  entries: readonly string[],
  style: Style,
): string[] {
  const overflow = entries.length - FILE_LIST_LIMIT
  return [
    style.dim(`  ${heading} (${entries.length})`),
    ...entries.slice(0, FILE_LIST_LIMIT).map((entry) => `    ${entry}`),
    ...(overflow > 0 ? [style.dim(`    …and ${overflow} more`)] : []),
  ]
}

/**
 * Render an `evidence` answer, one heading per kind.
 *
 * Grouped because the kinds answer different questions, and headed even when a
 * kind is empty: "no callers" is a fact about the subject, and silence would
 * read as a kind that was dropped. Each heading carries that kind's own budget,
 * because ADR 0006 gives this operation one `--limit` per kind and the
 * envelope's single budget can only say that *something* was cut.
 *
 * `--claims` never reaches here. ADR 0006 keeps claim expressions on the machine
 * renderer, and the parser refuses the flag without `--json` rather than letting
 * this renderer quietly drop them.
 */
export function renderEvidence(
  envelope: EvidenceEnvelope,
  style: Style,
): string {
  const report = envelope.result
  // An unresolved subject has no kinds worth heading — `finish` says that it
  // matched nothing, which is a different fact from every kind being empty.
  const lines =
    report === undefined || envelope.request.resolved.length === 0
      ? []
      : [
          ...kindLines('symbols', report.symbols, (node) => [
            symbolLine(node, style),
          ]),
          ...kindLines('files', report.files, (file) => fileLines(file, style)),
          ...kindLines('callers', report.callers, (edge) => [
            `${shorthandOf(edge.from)}  ${renderSite(edge, style)}`,
          ]),
          ...kindLines('callees', report.callees, (edge) => [
            `${shorthandOf(edge.to)}  ${renderSite(edge, style)}`,
          ]),
          ...kindLines('references', report.references, (edge) => [
            referenceLine(edge, style),
          ]),
          ...kindLines('labels', report.labels, (label) => [
            labelRow(label, style),
          ]),
        ]
  return finish(envelope, lines, style, 'facts')
}

/**
 * One kind under its heading, with the truncation that kind reports.
 *
 * @param lines - One kind's item as the lines it prints, relative to the
 * heading, so a multi-line item like a file report indents with the rest.
 */
function kindLines<TItem>(
  heading: string,
  kind: EvidenceKind<TItem>,
  lines: (item: TItem) => readonly string[],
): string[] {
  const { returned, available, truncated } = kind.budget
  const counted = truncated
    ? `showing ${returned} of ${available}`
    : String(available)
  return [
    `  ${heading} (${counted})`,
    ...kind.items.flatMap((item) => lines(item).map((line) => `    ${line}`)),
  ]
}

/**
 * One label row: what it says, and the rule that said it.
 *
 * The derivation is never dropped, for the reason `references` never drops
 * provenance: `default` and `user-config` are the same value arrived at by
 * guessing and by being told, and only the derivation tells them apart.
 */
const labelRow = (label: Label, style: Style): string =>
  `${label.node}  ${label.axis}=${label.value}  ` +
  style.dim(`[${label.provenance}: ${label.derivation}]`)

/**
 * What a `docs draft` run says about itself, which is never the draft.
 *
 * The Markdown is the answer and it goes where it was asked to go — stdout, or
 * the file `--out` named. This is the note beside it, and it follows
 * `report-bug`'s rule: where the payload is stdout, the note moves to stderr
 * rather than into the bytes somebody is piping into a file.
 *
 * @param path - Where the draft was written, or `null` where it went to stdout.
 */
export function renderDraft(
  envelope: Envelope<DraftReport>,
  path: string | null,
  style: Style,
): string {
  const sections = envelope.result?.sections ?? []
  const lines = sections.map(
    (section) =>
      `  ${section.heading}  ` +
      style.dim(count(section.candidates.length, 'candidate claim')),
  )
  const landed =
    path === null
      ? '  nothing written — pass --out <path> to write this draft to a file'
      : `  wrote ${count(sections.length, 'section')} to ${path}`
  return finish(
    envelope,
    lines.length === 0 ? [] : [...lines, '', style.dim(landed)],
    style,
    'section',
  )
}

/** How a verdict is spelled for a person, and how it is coloured. */
const VERDICTS: Readonly<Record<string, string>> = {
  verified: 'verified',
  contradicted: 'contradicted',
  'potentially-stale': 'potentially stale',
  'unable-to-verify': 'unable to verify',
}

/**
 * Render a `docs check` or `docs affected` answer.
 *
 * A verdict never renders without its [[Claim coverage]]: without it, `verified`
 * silently means "the checkable part is true", which is exactly the completeness
 * failure ADR 0001 exists to prevent. Coverage is not a confidence score and is
 * never combined with the verdict into one — they sit side by side because they
 * are answers to different questions.
 *
 * Sections are printed under their document because the per-section verdict is
 * the whole reason claims live inline: a document-level verdict alone would send
 * a reader to re-read a file whose contradiction is in one paragraph.
 */
export function renderDocs(envelope: DocsEnvelope, style: Style): string {
  const lines = (envelope.result ?? []).flatMap((report) =>
    documentLines(report, style),
  )
  return [
    finish(envelope, lines, style, 'documents'),
    ...scanNote(envelope, style),
  ].join('\n')
}

/** One document: its verdict, its coverage, and the sections that assert anything. */
function documentLines(report: DocumentReport, style: Style): string[] {
  const { covered, sections } = report.coverage
  const verdict = verdictText(report.verdict, style)
  return [
    `  ${style.bold(report.path)}  ${verdict}` +
      style.dim(`, ${covered} of ${sections} sections covered`),
    ...report.sections
      .filter((section) => section.verdict !== null)
      .flatMap((section) => sectionLines(section, style)),
    ...report.faults.flatMap((fault) => faultLines(fault, style)),
  ]
}

/** A verdict, warned about unless it is the one that needs no attention. */
const verdictText = (verdict: string, style: Style): string => {
  const spelled = VERDICTS[verdict] ?? verdict
  return verdict === 'verified' ? style.dim(spelled) : style.warn(spelled)
}

function sectionLines(section: SectionReport, style: Style): string[] {
  const heading = section.heading ?? '(preamble)'
  const verdict =
    section.verdict === null ? '' : verdictText(section.verdict, style)
  return [
    `    ${heading}  ${verdict}  ${style.dim(`:${section.line}`)}`,
    ...section.claims.flatMap((claim) => claimLines(claim, style)),
    ...section.links
      .filter((link) => link.broken)
      .map((link) =>
        style.warn(`      ${link.target} → no such file  :${link.line}`),
      ),
  ]
}

/**
 * One claim, with what decided it.
 *
 * A verified claim prints its provenance only when it is not `deterministic`:
 * ADR 0005 has provenance ride on the verdict rather than multiply it, and a
 * checker-resolved edge saying so on every line would bury the ones that are
 * inferred.
 */
function claimLines(claim: ClaimReport, style: Style): string[] {
  const provenance =
    claim.provenance === null || claim.provenance === 'deterministic'
      ? ''
      : ` ${style.warn(`[${claim.provenance}]`)}`
  // The observed number is only news when the claim is wrong: a verified
  // `== 2` already prints the two, and repeating it on every line would bury
  // the ones that differ.
  const counted =
    claim.observed === null || claim.verdict === 'verified'
      ? ''
      : style.dim(`  (index holds ${claim.observed})`)
  return [
    `      ${claim.text}  ${verdictText(claim.verdict, style)}${provenance}${counted}` +
      style.dim(`  :${claim.line}`),
    ...candidateLines(claim.candidates, style),
  ]
}

/**
 * Where a vanished subject appears to have gone.
 *
 * A fixed template over the candidate's fields rather than a sentence codedocs
 * composed: ADR 0006 deleted `docs generate` on the principle that codedocs
 * writes no prose, and an agent repairing a claim wants the fields anyway,
 * since it has to rewrite a shorthand rather than read English.
 *
 * An empty list prints nothing at all, and never "deleted": an absence with no
 * candidate is indistinguishable from a move the matcher failed to see.
 */
function candidateLines(
  candidates: readonly Candidate[],
  style: Style,
): string[] {
  return candidates.map((candidate) => {
    const how = candidate.derivations.join(', ')
    const where =
      candidate.commit === null ? '' : ` in ${candidate.commit.slice(0, 7)}`
    const score =
      candidate.similarity === null
        ? ''
        : ` (git similarity ${candidate.similarity}%)`
    return style.dim(
      `        candidate: ${candidate.id}${where} [${how}]${score}`,
    )
  })
}

/**
 * An error in the document itself, which is the author's to fix.
 *
 * Never a verdict: ADR 0005 makes an ambiguous shorthand an error reported at
 * check time rather than an `unable to verify`, because a document is a
 * committed artefact that must mean one thing.
 */
function faultLines(fault: DocumentFault, style: Style): string[] {
  return [
    style.warn(`    ${fault.text}  :${fault.line}`),
    style.warn(`      ${faultText(fault)}`),
  ]
}

/** What one fault says, from the closed set of codes rather than a sentence on the wire. */
function faultText(entry: DocumentFault): string {
  const fault = entry.fault
  switch (fault.code) {
    case 'unparseable':
      return 'not a claim expression'
    case 'unknown-predicate':
      return `\`${fault.predicate}\` is not one of the claim predicates`
    case 'no-backend':
      return (
        `\`${fault.predicate}\` has no backend: the index holds no export ` +
        'edges and no package nodes, so nothing could check it'
      )
    case 'arity':
      return `\`${fault.predicate}\` takes ${fault.expected} arguments, got ${fault.got}`
    case 'count-invalid':
      return fault.detail
    case 'ambiguous-subject':
      return (
        `\`${fault.subject}\` names ${fault.resolved.length} symbols — ` +
        `${fault.resolved.join(', ')}. A claim must mean one thing.`
      )
    case 'local-subject':
      return `\`${fault.subject}\` is a local symbol, and nothing durable may anchor to one`
    case 'label-invalid':
      return `\`${fault.axis}=${fault.value}\` is not a label codedocs knows`
  }
}

/**
 * What the marker scan found and cost.
 *
 * Printed because ADR 0005 rests document discovery on a measurement — 46 ms
 * over cal.com's 380 Markdown files — and a number nobody can see is an
 * assumption.
 */
function scanNote(envelope: DocsEnvelope, style: Style): Note {
  const { documents, scanned, durationMs } = envelope.scan
  return [
    '',
    style.dim(
      `  scanned ${count(scanned, 'Markdown file')} in ${durationMs} ms, ` +
        `finding ${count(documents, 'document')}`,
    ),
  ]
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
    // Projected to the shorthand once, and compared in that form: a shorthand
    // names one symbol per file, so a shared prefix is the same either way.
    const sequence = [path.root, ...path.steps.map((step) => step.to)].map(
      shorthandOf,
    )
    const shared = sharedPrefix(previous, sequence)
    if (shared === 0) lines.push(`  ${sequence[0]}`)
    for (let at = Math.max(shared, 1); at <= path.steps.length; at += 1) {
      const step = path.steps[at - 1]
      if (step === undefined) continue
      const closes =
        path.terminus === 'cycle' && at === path.steps.length
          ? ` ${style.warn('↺ cycle')}`
          : ''
      const sites = renderSites(step.sites, style)
      lines.push(`${indent(at)}→ ${sequence[at]}  ${sites}${closes}`)
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

/**
 * Render what `report-bug` wrote, which is the disclosure it owes the user.
 *
 * ADR 0011 fixes what this says: the path, the shape, a category summary with
 * counts, and — in the default shape only — one line naming the flag that adds
 * the rest. There is no confirmation prompt, because the default is already the
 * safe one and a prompt over a safe default only teaches people to dismiss
 * prompts.
 *
 * @param out - Where it went, as the user spelled it, or `null` for stdout.
 */
export function renderReport(
  envelope: ReportEnvelope,
  out: string | null,
  style: Style,
): string {
  const report = envelope.result
  const { carries, reproduction } = report
  const lines = [
    out === null
      ? style.bold('  wrote the report to stdout')
      : `  ${style.bold(`wrote ${out}`)}`,
    style.dim(
      `  ${report.repositoryFacts} repository facts — ${report.contains}`,
    ),
    style.dim(
      `  carries ${count(carries.blindSpotReasons, 'blind-spot reason')}, ` +
        `${count(carries.paths, 'path')}, ` +
        `${count(carries.symbolNames, 'symbol name')}, ` +
        `${count(carries.moduleSpecifiers, 'module specifier')}`,
    ),
    style.dim(
      `  reproduced \`${reproduction.operation ?? 'nothing codedocs knows'}\`: ` +
        `exit ${reproduction.exitCode} in ${reproduction.durationMs} ms` +
        (reproduction.error === null ? '' : ` — ${reproduction.error.code}`),
    ),
  ]
  if (report.repositoryFacts === 'included') return lines.join('\n')
  return [
    ...lines,
    '',
    style.dim(
      '  --with-repository adds the facts that name your code: file paths, ' +
        'symbol names, module specifiers, dependency versions and the commit',
    ),
  ].join('\n')
}

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
    ...scopeNote(envelope, style),
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
    return style.warn(`  \`${subject}\` matched no ${nounOf(envelope)}`)
  }
  return style.dim(`  no ${unit}`)
}

/**
 * What an operation's subject names, so one that takes a path does not report
 * that it matched no *symbol*.
 *
 * Read off the manifest rather than listed here, so an operation that arrives
 * with a subject of its own cannot be forgotten in this sentence.
 */
const nounOf = (envelope: Envelope<unknown>): string => {
  const named = operationSpec(envelope.operation)?.subject?.name ?? ''
  return named === 'path' ? 'file' : 'symbol'
}

/** How many blind spots are named before the rest are counted. */
const BLIND_SPOT_LIMIT = 10

/** Each note is empty or opens with a blank line, so `finish` never spaces them itself. */
type Note = readonly string[]

/**
 * The label filter this answer applied, and what it withheld.
 *
 * Printed when it bit or when the caller named it, and silent for a default
 * scope that excluded nothing — which is the "no news" ADR 0006 lets the human
 * renderer omit. `--json` carries the scope on every answer regardless, because
 * a machine reader cannot infer a default it was never told about.
 *
 * Never phrased as a blind spot: codedocs knows exactly what it withheld here.
 */
function scopeNote(envelope: Envelope<unknown>, style: Style): Note {
  const { scope } = envelope.request
  const named = scope.exclude.length > 0 || scope.include.length > 1
  if (scope.excluded === 0 && !named) return []
  const applied = [
    ...scope.include.map((filter) => `${filter.axis}=${filter.value}`),
    ...scope.exclude.map((filter) => `not ${filter.axis}=${filter.value}`),
  ].join(', ')
  const withheld =
    scope.excluded === 0
      ? 'nothing excluded'
      : `${scope.excluded} excluded by it`
  return ['', style.dim(`  scope ${applied} — ${withheld}`)]
}

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
    ...resolved.map((id) => style.dim(`    ${shorthandOf(id)}`)),
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
