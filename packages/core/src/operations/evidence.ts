/**
 * `evidence` — everything the index holds about one subject, in one answer.
 *
 * ADR 0006 found the operation behind PRD §20's `explain` real and only
 * **misnamed**: settled constraint 2 removes the prose, and what remains is
 * facts. ADR 0012 then made it what is left of `plan` — *"what is actually
 * needed to plan a change is the facts about the symbols involved"* — and was
 * explicit that this is **one operation among thirteen, not the point of the
 * product**. Nothing here writes prose, and nothing bundles a second subject:
 * a `context` command that loops over several is composition above an
 * operation, which ADR 0012 rejected.
 *
 * It composes nothing that is not already an answer. Each kind is read by the
 * function its own operation reads it with, keeps that operation's sort key, and
 * carries the provenance and fidelity it carries there — so two answers about
 * one subject cannot disagree.
 *
 * **One `--limit` per kind, and truncation reported per kind.** ADR 0006 singles
 * this operation out for it: a shared pool means adding a caller quietly evicts
 * a document. That is why the envelope is assembled rather than answered — the
 * bounding happens per kind, before the envelope exists.
 *
 * The kind ADR 0006 names and this does not yet hold is **documents**: they
 * arrive with `docs check`, step 6 of ADR 0012's order. An empty list would read
 * as "nothing documents this subject" when the truth is that codedocs holds no
 * documents at all, so the kind is absent until there is one.
 */

import {
  assembled,
  type AnswerContext,
  type Budget,
  type Envelope,
} from '../envelope.ts'
import { applyScope, type Scoping } from '../labels/index.ts'
import type {
  CallEdge,
  FilePath,
  Label,
  ReferenceEdge,
  SymbolNode,
} from '../model.ts'
import { readLabels, readSymbols, type Store } from '../store/index.ts'
import { fileOf, shorthandOf } from '../symbol-id.ts'
import { callEdgesOf } from './calls.ts'
import { claimsFor } from './claims.ts'
import { fileReport, type FileReport } from './file.ts'
import { referenceEdgesOf } from './references.ts'
import { scopeTo } from './scope.ts'
import { noteCollisions, resolveSubject } from './subject.ts'

/** One kind of fact, bounded and counted on its own. */
export interface EvidenceKind<TItem> {
  readonly items: readonly TItem[]
  /** This kind's own budget, because `--limit` applies per kind. */
  readonly budget: Budget
}

/** ADR 0006's result for `evidence`: every kind of fact, each bounded by itself. */
export interface EvidenceReport {
  /** The symbols the subject named. Several means the subject was ambiguous. */
  readonly symbols: EvidenceKind<SymbolNode>
  /** The files they live in, exactly as `file` reports them. */
  readonly files: EvidenceKind<FileReport>
  readonly callers: EvidenceKind<CallEdge>
  readonly callees: EvidenceKind<CallEdge>
  readonly references: EvidenceKind<ReferenceEdge>
  /**
   * The labels on the symbols and on their files, as separate rows.
   *
   * ADR 0003's join: a label rides on what it describes, and a symbol does not
   * inherit its file's labels. Storing an inherited copy would be ADR 0002's
   * containment mistake in new clothes, and reporting one here would be the
   * same mistake at render time.
   */
  readonly labels: EvidenceKind<Label>
}

/** An `evidence` answer, with the claim expressions `--claims` asked for. */
export type EvidenceEnvelope = Envelope<EvidenceReport> & {
  /** ADR 0005 claim expressions for the facts above, or `null` when unasked. */
  readonly claims: readonly string[] | null
}

/** How `evidence` was asked to run. */
export interface EvidenceOptions {
  readonly scoping: Scoping
  /** Whether to restate the payload as claim expressions. Machine renderer only. */
  readonly claims: boolean
}

/**
 * Assemble what the index holds about one subject.
 *
 * @param limit - Applied **per kind**, so a subject with 176 callers still
 * answers with its file, its labels and its references rather than spending the
 * whole budget on one kind.
 */
export function evidence(
  store: Store,
  context: AnswerContext,
  subject: string,
  limit: number | null,
  options: EvidenceOptions,
): EvidenceEnvelope {
  const resolved = resolveSubject(store, subject)
  const assembly = assembleEvidence(
    store,
    context,
    resolved,
    limit,
    options.scoping,
  )
  const result = assembly.report

  return {
    ...assembled(
      'evidence',
      {
        subject,
        resolved: resolved.map((node) => node.id),
        limit,
        depth: null,
        scope: { ...options.scoping.scope, excluded: assembly.excluded },
      },
      noteCollisions(
        scopeTo(store, context, touched(result, assembly.paths)),
        resolved,
      ),
      result,
      totals(result),
    ),
    claims: options.claims ? claimsFor(result, durableIds(store)) : null,
  }
}

/** One assembled report, and what the scope withheld while assembling it. */
export interface EvidenceAssembly {
  readonly report: EvidenceReport
  /** Counted across every kind, because the envelope echoes one scope. */
  readonly excluded: number
  /** The files the subject's symbols live in, sorted. */
  readonly paths: readonly FilePath[]
}

/**
 * Assemble the report for symbols already resolved.
 *
 * Exported for `docs draft`, which needs the same facts for each of a file's
 * symbols and must not be able to disagree with `evidence` about any of them —
 * ADR 0013's draft is `evidence` shaped as a file, not a second reading of the
 * index. The subject resolution stays with the caller because a draft's subject
 * may be a path, which resolves to no symbol at all.
 */
export function assembleEvidence(
  store: Store,
  context: AnswerContext,
  resolved: readonly SymbolNode[],
  limit: number | null,
  scoping: Scoping,
): EvidenceAssembly {
  const paths = [...new Set(resolved.map((node) => node.file))].sort()

  // Counted across every kind, because the envelope echoes one scope: a caller
  // must be able to tell "no callers" from "callers, hidden by the default
  // scope", and the per-kind split is the budget's business rather than the
  // scope's.
  let excluded = 0
  const scoped = <TItem>(
    rows: readonly TItem[],
    fileOf: (row: TItem) => string,
  ): TItem[] => {
    const { kept, scope } = applyScope(scoping, rows, fileOf)
    excluded += scope.excluded
    return kept
  }

  const report: EvidenceReport = {
    symbols: bound(
      scoped(resolved, (node) => node.file),
      limit,
    ),
    files: bound(
      scoped(
        paths.map((path) => fileReport(store, context, path)),
        (report) => report.path,
      ),
      limit,
    ),
    callers: bound(
      scoped(callEdgesOf(store, resolved, 'callers'), (edge) => edge.file),
      limit,
    ),
    callees: bound(
      scoped(callEdgesOf(store, resolved, 'callees'), (edge) => edge.file),
      limit,
    ),
    references: bound(
      scoped(referenceEdgesOf(store, resolved), (edge) => edge.file),
      limit,
    ),
    labels: bound(
      scoped(labelsOn(store, resolved, paths), (label) => fileOf(label.node)),
      limit,
    ),
  }

  return { report, excluded, paths }
}

/** Apply this kind's own `--limit`, and say what it withheld. */
function bound<TItem>(
  items: readonly TItem[],
  limit: number | null,
): EvidenceKind<TItem> {
  const returned = limit === null ? items : items.slice(0, limit)
  return {
    items: returned,
    budget: {
      returned: returned.length,
      available: items.length,
      truncated: returned.length < items.length,
    },
  }
}

/** Every kind in the report, so the totals and the touched files read them once. */
const kindsOf = (report: EvidenceReport): readonly EvidenceKind<unknown>[] =>
  Object.values(report)

/**
 * The envelope's own budget, summed over the kinds.
 *
 * The envelope holds one budget and every operation owes it, so this is the
 * honest total: it says how much was returned of how much there was, and each
 * kind still says which of them was cut. Reading only this one would tell a
 * caller that something was truncated, never that it was the callers.
 */
function totals(report: EvidenceReport): Budget {
  const kinds = kindsOf(report)
  return {
    returned: kinds.reduce((sum, kind) => sum + kind.budget.returned, 0),
    available: kinds.reduce((sum, kind) => sum + kind.budget.available, 0),
    truncated: kinds.some((kind) => kind.budget.truncated),
  }
}

/** Every file the answer touched, which is what narrows the conditions. */
function touched(
  report: EvidenceReport,
  paths: readonly FilePath[],
): FilePath[] {
  const edges = [
    ...report.callers.items,
    ...report.callees.items,
    ...report.references.items,
  ]
  return [...paths, ...edges.map((edge) => edge.file)]
}

/**
 * The labels filed against the subject and against its files.
 *
 * Read from the whole set rather than per node: ADR 0003 stores two to six
 * integer rows per file, so one scan is cheaper than the round trips that would
 * replace it, and the store's order — node, then axis — is already this kind's
 * sort key.
 */
function labelsOn(
  store: Store,
  resolved: readonly SymbolNode[],
  paths: readonly FilePath[],
): Label[] {
  const nodes = new Set<string>([...resolved.map((node) => node.id), ...paths])
  return readLabels(store).filter((label) => nodes.has(label.node))
}

/**
 * Every durable `SymbolId` in the index, for the claims a document may anchor to.
 *
 * Read only when `--claims` was given: it is a full scan, and an answer that was
 * not asked for claim expressions must not pay for one. Exported so `docs draft`
 * pays for exactly one across every section it writes, rather than one per
 * section — a file with forty symbols would otherwise scan the table forty times.
 */
export const durableIds = (store: Store): ReadonlySet<string> =>
  new Set(
    readSymbols(store)
      .filter((node) => node.durable)
      // As shorthands, because that is the form a claim names a subject in.
      .map((node) => shorthandOf(node.id)),
  )
