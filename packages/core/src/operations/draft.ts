/**
 * `docs draft` — a Markdown file prefilled with what the index holds about one
 * subject.
 *
 * [ADR 0013](../../../../docs/adr/0013-drafting-a-document.md) reverses ADR
 * 0006's deletion of `docs generate`, and the marker is what lets it: every claim
 * a draft writes is a **candidate**, spelled `<!-- codedocs?: … -->`, which the
 * document scan does not match. A drafted file is not a [[Document]] and has no
 * [[Claim coverage]] to overstate until a person deletes a `?`.
 *
 * It composes nothing new. Each section's facts come from `assembleEvidence`, the
 * same assembly `evidence` answers with, and its candidates from `claimsFor`, the
 * same restatement `--claims` returns — so a draft and an `evidence` answer about
 * one symbol cannot disagree.
 *
 * `--limit` counts **sections** and stops there: the facts inside a section are
 * unbounded, because a limit is a display bound and a draft is a file about to be
 * edited. A fact missing from it is one the author will never learn was missing.
 */

import {
  assembled,
  type AnswerContext,
  type Budget,
  type Envelope,
} from '../envelope.ts'
import { applyScope, type Scoping } from '../labels/index.ts'
import type { FilePath, Label, ReferenceEdge, SymbolNode } from '../model.ts'
import { readLabels, readSymbolsIn, type Store } from '../store/index.ts'
import { shorthandOf } from '../symbol-id.ts'
import { claimsFor } from './claims.ts'
import {
  callFact,
  cautionFor,
  groups,
  importFact,
  labelFact,
  referenceFact,
} from './draft-facts.ts'
import { markdownFor, type DraftBody } from './draft-markdown.ts'
import {
  assembleEvidence,
  durableIds,
  type EvidenceKind,
  type EvidenceReport,
} from './evidence.ts'
import { fileReport, resolvePath, type FileReport } from './file.ts'
import { scopeTo } from './scope.ts'
import { noteCollisions, resolveSubject } from './subject.ts'

/** One section of a draft: what it is about, and what it offers to assert. */
export interface DraftSection {
  /** The heading, as the Markdown spells it. */
  readonly heading: string
  /** ADR 0005's shorthand for a symbol, or the path for a file. */
  readonly subject: string
  /**
   * The claim expressions the section offers, without their marker.
   *
   * Listed here as well as written into the Markdown so a caller can see what a
   * draft is proposing without parsing prose back out of it.
   */
  readonly candidates: readonly string[]
}

/** ADR 0013's result: the file, and what went into it. */
export interface DraftReport {
  /** The Markdown, exactly as `--out` would write it. */
  readonly markdown: string
  readonly sections: readonly DraftSection[]
}

/** How `docs draft` was asked to run. */
export interface DraftOptions {
  readonly scoping: Scoping
}

/** What one section is about, before its facts are read. */
type Subject =
  | { readonly kind: 'file'; readonly path: FilePath }
  | { readonly kind: 'symbol'; readonly node: SymbolNode }

/**
 * Draft one subject.
 *
 * @param limit - Counts sections. A symbol subject has one section, so the flag
 * only bites on a file — or on a subject that resolved to several symbols.
 */
export function draft(
  store: Store,
  context: AnswerContext,
  subject: string,
  limit: number | null,
  options: DraftOptions,
): Envelope<DraftReport> {
  const resolution = subjectsOf(store, subject)
  const { kept, scope } = applyScope(
    options.scoping,
    resolution.sections,
    fileOfSubject,
  )
  // Bounded before the facts are read rather than after: a section nobody asked
  // for costs a full pass over the label table, and there is nothing to learn
  // from assembling one only to drop it.
  const written = limit === null ? kept : kept.slice(0, limit)
  const durable = durableIds(store)

  let excluded = scope.excluded
  // One claim is offered once, by the first section that could offer it: a call
  // between two symbols of one file is a fact in both their sections and a
  // single assertion, and endorsing it twice is two claims to keep in step.
  const offered = new Set<string>()
  const bodies = written.map((one) => {
    const built = bodyOf(store, context, one, options.scoping, durable)
    excluded += built.excluded
    const candidates = built.body.candidates.filter(
      (claim) => !offered.has(claim),
    )
    for (const claim of candidates) offered.add(claim)
    return { ...built.body, candidates }
  })

  const answered = noteCollisions(
    scopeTo(store, context, [...new Set(written.map(fileOfSubject))]),
    written.flatMap((one) => (one.kind === 'symbol' ? [one.node] : [])),
  )

  const budget: Budget = {
    returned: written.length,
    available: kept.length,
    truncated: written.length < kept.length,
  }

  return assembled(
    'docs draft',
    {
      subject,
      // What the *subject* named, not what the draft is made of: a file's
      // sections are its symbols, and echoing those would report a single file
      // that declares three functions as an ambiguous subject.
      resolved: resolution.resolved,
      limit,
      depth: null,
      scope: { ...options.scoping.scope, excluded },
    },
    answered,
    {
      markdown: markdownFor(
        {
          subject,
          commit: context.snapshot.commit,
          dirty: context.snapshot.dirty,
          written: written.length,
          available: kept.length,
        },
        bodies,
        answered.blindSpots,
      ),
      sections: bodies.map((body) => ({
        heading: body.heading,
        subject: body.subject,
        candidates: body.candidates,
      })),
    },
    budget,
  )
}

/**
 * What a subject names, and therefore what the draft is a draft of.
 *
 * A path wins where a subject names both a file and a symbol, because a path is
 * the exact form and a bare name is the fuzzy one — and a subject carrying `#`
 * or a scheme prefix is never a path, so the two forms `evidence` accepts reach
 * the symbol resolver untouched.
 *
 * A file's sections are the durable symbols it declares. Local symbols are
 * skipped: ADR 0002 forbids anything durable anchoring to one, so a candidate
 * claim about a local is a candidate nobody may endorse.
 */
function subjectsOf(store: Store, subject: string): Resolution {
  const paths = subject.includes('#') ? [] : resolvePath(store, subject)
  if (paths.length > 0) {
    return {
      resolved: paths,
      sections: paths.flatMap((path) => [
        { kind: 'file' as const, path },
        ...readSymbolsIn(store, path)
          .filter((node) => node.durable)
          .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
          .map((node) => ({ kind: 'symbol' as const, node })),
      ]),
    }
  }
  const nodes = resolveSubject(store, subject)
  return {
    resolved: nodes.map((node) => node.id),
    sections: nodes.map((node) => ({ kind: 'symbol' as const, node })),
  }
}

/** What a subject named, and the sections that follow from it. */
interface Resolution {
  /** The canonical identifiers, which the envelope echoes. */
  readonly resolved: readonly string[]
  readonly sections: readonly Subject[]
}

const fileOfSubject = (one: Subject): FilePath =>
  one.kind === 'file' ? one.path : one.node.file

/** One section's facts, and what the scope withheld while reading them. */
function bodyOf(
  store: Store,
  context: AnswerContext,
  one: Subject,
  scoping: Scoping,
  durable: ReadonlySet<string>,
): { body: DraftBody; excluded: number } {
  return one.kind === 'file'
    ? fileBody(store, context, one.path, durable)
    : symbolBody(store, context, one.node, scoping, durable)
}

/**
 * A section about one symbol, built from the assembly `evidence` answers with.
 *
 * The limit passed down is `null` on purpose: ADR 0013 bounds a draft by section
 * and leaves the facts within one whole.
 */
function symbolBody(
  store: Store,
  context: AnswerContext,
  node: SymbolNode,
  scoping: Scoping,
  durable: ReadonlySet<string>,
): { body: DraftBody; excluded: number } {
  const { report, excluded } = assembleEvidence(
    store,
    context,
    [node],
    null,
    scoping,
  )
  const file = report.files.items[0]
  const outgoing = (edge: ReferenceEdge): boolean => edge.from === node.id

  return {
    excluded,
    body: {
      heading: node.qualified,
      subject: shorthandOf(node.id),
      lead:
        `A \`${node.kind}\` declared at \`${node.file}:${node.line}\`` +
        `${file === undefined ? '' : `, analysed at \`${file.fidelity ?? 'unknown'}\` fidelity`}.`,
      caution: cautionFor(file),
      facts: groups([
        ['Calls', report.callees.items.map(callFact('to'))],
        ['Called by', report.callers.items.map(callFact('from'))],
        [
          'Names without calling',
          report.references.items.filter(outgoing).map(referenceFact('to')),
        ],
        [
          'Named by',
          report.references.items
            .filter((edge) => !outgoing(edge))
            .map(referenceFact('from')),
        ],
        ['Labels', report.labels.items.map(labelFact(shorthandOf(node.id)))],
      ]),
      // A section offers only the claims its own subject is named in. The
      // assembly reports the symbol's *file* too, so an unfiltered list would
      // invite someone to endorse `imports(…)` beside facts about a function —
      // and ADR 0005 puts a claim next to what justifies it.
      candidates: claimsFor(report, durable).filter((claim) =>
        claim.includes(shorthandOf(node.id)),
      ),
    },
  }
}

/**
 * A section about the file itself, which opens a file subject's draft.
 *
 * Assembled from the same `fileReport` the `file` operation answers with, and
 * its candidates from the same `claimsFor` — handed a report holding only the
 * kinds a file has, so the claim vocabulary stays one implementation rather than
 * two that agree today.
 */
function fileBody(
  store: Store,
  context: AnswerContext,
  path: FilePath,
  durable: ReadonlySet<string>,
): { body: DraftBody; excluded: number } {
  const report = fileReport(store, context, path)
  const labels = readLabels(store).filter((label) => label.node === path)
  const declared = report.symbols.filter((node) => node.durable)

  return {
    excluded: 0,
    body: {
      heading: path,
      subject: path,
      lead:
        `Analysed at \`${report.fidelity ?? 'unknown'}\` fidelity` +
        `${report.canonicalProject === null ? '' : ` in \`${report.canonicalProject}\``}, ` +
        `declaring ${declared.length} durable ${declared.length === 1 ? 'symbol' : 'symbols'}.`,
      caution: cautionFor(report),
      facts: groups([
        ['Declares', declared.map((node) => `\`${node.qualified}\``)],
        ['Imports', report.imports.map(importFact)],
        ['Imported by', report.importers.map((from) => `\`${from}\``)],
        ['Labels', labels.map(labelFact(path))],
      ]),
      candidates: claimsFor(fileOnly(report, labels), durable),
    },
  }
}

/** An empty kind, for the report shape a file section fills two entries of. */
const nothing = <TItem>(): EvidenceKind<TItem> => ({
  items: [],
  budget: { returned: 0, available: 0, truncated: false },
})

/** A whole kind, which is every kind here: a draft bounds sections, not facts. */
const whole = <TItem>(items: readonly TItem[]): EvidenceKind<TItem> => ({
  items,
  budget: {
    returned: items.length,
    available: items.length,
    truncated: false,
  },
})

/** A file's facts in the shape `claimsFor` reads, which yields `imports` and `hasLabel`. */
const fileOnly = (
  report: FileReport,
  labels: readonly Label[],
): EvidenceReport => ({
  symbols: nothing(),
  files: whole([report]),
  callers: nothing(),
  callees: nothing(),
  references: nothing(),
  labels: whole(labels),
})
