/**
 * `docs check` and `docs affected` — the two operations over ADR 0005's claims.
 *
 * One module because they differ in one thing: which documents they answer
 * about. `docs check` answers about every document in the repository; `docs
 * affected` intersects the derived scopes with a changed set first. The check
 * itself is the same check, and keeping them apart would give the two a second
 * chance to disagree about a verdict.
 *
 * ADR 0012 puts "which documents a change contradicts" on the codedocs side of
 * the `fallow` boundary for the simplest possible reason: ADR 0005's claims
 * exist nowhere else.
 *
 * **`docs affected` needs one index, not two.** The only thing a second would
 * buy is the sentence "this was verified before your change", at 22.9 s to build
 * on cal.com — which is [#14](https://github.com/magicspon/codedocs/issues/14)'s
 * to grant behind an explicit flag. One index is what keeps this usable inside a
 * pre-commit hook or an agent loop.
 */

import type { Config } from '../config/index.ts'
import { answer, type AnswerContext, type Envelope } from '../envelope.ts'
import { changedPaths } from '../git.ts'
import {
  applyScope,
  type EffectiveLabels,
  type Scoping,
} from '../labels/index.ts'
import type { Fidelity, FilePath } from '../model.ts'
import {
  checkDocument,
  discoverDocuments,
  scopeFromText,
  type CheckContext,
  type DocumentReport,
  type DocumentScan,
  type Verdict,
} from '../docs/index.ts'
import { readMembershipOf, type Store } from '../store/index.ts'
import { scopeTo } from './scope.ts'

/** How the `docs` operations were asked to run. */
export interface DocsOptions {
  readonly root: string
  /** Read for `discover.skip`, which the document scan honours as discovery does. */
  readonly config: Config
  readonly scoping: Scoping
  readonly labels: ReadonlyMap<FilePath, EffectiveLabels>
  /**
   * What this session found different from the stored snapshot.
   *
   * ADR 0006's consequence: `docs affected` with no arguments uses the drift set
   * rather than a diff against a guessed default branch, so the zero-argument
   * case answers "what have I broken right now" with no git and no
   * configuration.
   */
  readonly drifted: readonly FilePath[]
  /** `docs check`: the verdict that raises the exit code beyond `contradicted`. */
  readonly failOn: Verdict | null
  /** `docs affected`: the ref to widen the changed set with, or `null`. */
  readonly base: string | null
}

/** A `docs` answer, with what the scan cost and what would fail a build. */
export type DocsEnvelope = Envelope<readonly DocumentReport[]> & {
  /** What the marker scan found and cost, so the number stays a measurement. */
  readonly scan: Omit<DocumentScan, 'documents'> & {
    readonly documents: number
  }
  /** The files the answer treated as changed, which is what produces staleness. */
  readonly changed: readonly FilePath[]
  /** How many documents reached a verdict the caller asked to fail on. */
  readonly failing: number
  /** How many documents carry an error of their own, which is the author's to fix. */
  readonly faulted: number
}

/**
 * Every document in the repository, checked.
 *
 * Exit 1 is the caller's, not this function's: it returns the counts and the CLI
 * decides. `contradicted` alone reaches it by default — ADR 0005 measured
 * pointer signals of `potentially stale`'s character at 59–77% false alarms, and
 * wiring that to a red build is the change that would get `docs check` removed
 * from CI within a month.
 */
export function docsCheck(
  store: Store,
  context: AnswerContext,
  limit: number | null,
  options: DocsOptions,
): DocsEnvelope {
  const scan = discoverDocuments(options.root, options.config)
  const changed = [...options.drifted].sort()
  const checking = contextFor(store, context, options)
  const reports = scan.documents.map((document) =>
    checkDocument(checking, document, new Set(changed)),
  )
  return assemble(
    'docs check',
    store,
    context,
    limit,
    options,
    scan,
    changed,
    reports,
  )
}

/**
 * The documents a change reaches, checked against the current index.
 *
 * The intersection happens on the scope read from the document's *text* rather
 * than from its checked claims: a claim's subject carries its own path, so the
 * scope is derivable without resolving anything, and a repository of 400
 * documents is not checked to answer about the two a change touched.
 */
export function docsAffected(
  store: Store,
  context: AnswerContext,
  limit: number | null,
  options: DocsOptions,
): DocsEnvelope {
  const scan = discoverDocuments(options.root, options.config)
  const changed = [
    ...new Set([
      ...options.drifted,
      ...(options.base === null
        ? []
        : changedPaths(options.root, options.base)),
    ]),
  ].sort()
  const touched = new Set(changed)
  const affected = scan.documents.filter((document) =>
    scopeFromText(document).some((file) => touched.has(file)),
  )
  const checking = contextFor(store, context, options)
  const reports = affected.map((document) =>
    checkDocument(checking, document, touched),
  )
  return assemble(
    'docs affected',
    store,
    context,
    limit,
    options,
    scan,
    changed,
    reports,
  )
}

/** The envelope both operations owe, built once so they cannot differ in it. */
function assemble(
  operation: 'docs check' | 'docs affected',
  store: Store,
  context: AnswerContext,
  limit: number | null,
  options: DocsOptions,
  scan: DocumentScan,
  changed: readonly FilePath[],
  found: readonly DocumentReport[],
): DocsEnvelope {
  // A document is a file like any other, so the scope channel filters it by the
  // labels on it — a claim written inside a generated Markdown file is excluded
  // by the same default that excludes generated source.
  const { kept, scope } = applyScope(options.scoping, found, (one) => one.path)
  const failing = kept.filter((one) => fails(one, options.failOn)).length

  return {
    ...answer(
      operation,
      { subject: options.base, resolved: [], limit, depth: null, scope },
      scopeTo(
        store,
        context,
        kept.flatMap((one) => one.scope),
      ),
      kept,
    ),
    scan: {
      documents: scan.documents.length,
      scanned: scan.scanned,
      durationMs: scan.durationMs,
    },
    changed,
    failing,
    faulted: kept.filter((one) => one.faults.length > 0).length,
  }
}

/**
 * Whether one document's verdict is one the caller asked to fail on.
 *
 * `contradicted` is always in the set and `--fail-on` adds exactly the verdict
 * it names — rather than everything "worse", which would need a severity ladder
 * over four verdicts that ADR 0005 deliberately declined to rank.
 */
const fails = (report: DocumentReport, failOn: Verdict | null): boolean =>
  report.verdict === 'contradicted' || report.verdict === failOn

/** The context a check runs in, built once per answer. */
function contextFor(
  store: Store,
  context: AnswerContext,
  options: DocsOptions,
): CheckContext {
  // Read off the conditions the session already assembled rather than the
  // project table, so a claim reported as unverifiable in a `syntactic` file and
  // the envelope's own conditions block cannot disagree about that file.
  const byProject = new Map(
    context.conditions.map((row) => [row.project, row.fidelity]),
  )
  const fidelities = new Map<FilePath, Fidelity | null>()
  return {
    root: options.root,
    store,
    labels: options.labels,
    fidelityOf: (file) => {
      // Memoised per answer: a document with 20 claims in one file would
      // otherwise ask the same two joins 20 times.
      if (!fidelities.has(file)) {
        const canonical = readMembershipOf(store, file).canonical
        fidelities.set(
          file,
          canonical === null ? null : (byProject.get(canonical) ?? null),
        )
      }
      return fidelities.get(file) ?? null
    },
  }
}
