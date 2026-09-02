/**
 * Checking one claim against the index.
 *
 * One rule decides every verdict here, and it is ADR 0001's rather than
 * ADR 0005's: **a blind spot can only turn a would-be `contradicted` into
 * `unable to verify`, never a `verified` into one.** A claim that holds rests on
 * a fact that is *present*, and nothing codedocs failed to see can remove a
 * present fact; a claim that fails rests on an *absence*, and an absence is
 * exactly what a `syntactic` file or an unresolved specifier can manufacture.
 * Applied to a negation the rule inverts by itself — `!calls(a, b)` is decided
 * by presence and doubted by absence — which is why it is written once here
 * rather than per predicate.
 *
 * `contradicted` requires a claim to be **falsified, never merely unresolved**.
 * ADR 0005 calls this the single most tempting wrong answer in the design and
 * measures why: of the symbols whose id vanished over 20 commits, 12 of 20 have
 * the same name elsewhere at `HEAD`, and over 60 commits it is 95 of 105. Its
 * verdict table has a clause reading "or the name exists nowhere in the index";
 * the paragraph below it argues that clause away with the measurement, ADR 0007
 * refuses to read an empty candidate list as a deletion, and this ticket's
 * acceptance says "never `contradicted`". The argued rule is the one implemented.
 */

import { continuationOf, type Candidate } from '../continuity/index.ts'
import { valueOf, type EffectiveLabels } from '../labels/effective.ts'
import type {
  CallSource,
  FilePath,
  Fidelity,
  LabelAxis,
  LabelValue,
  Provenance,
  ReferenceKind,
  SymbolNode,
} from '../model.ts'
import { resolveSubject } from '../operations/subject.ts'
import {
  readCalleeSteps,
  readCallersOf,
  readImportsOf,
  readIndexedFiles,
  readReferencesFrom,
  readReferencesTo,
  readUnresolvedSpecifiers,
  type Store,
} from '../store/index.ts'
import type { Claim, RelationPredicate } from './claim.ts'

/** ADR 0005's four verdicts. Nothing blends them, and there is no score. */
export type Verdict =
  | 'verified'
  | 'contradicted'
  | 'potentially-stale'
  | 'unable-to-verify'

/** Why one claim reached its verdict, from a closed set rather than a sentence. */
export type ClaimReason =
  | 'holds'
  /** The subject is there and the relationship is not. */
  | 'falsified'
  /** A count claim's number differs from what the index holds. */
  | 'count-differs'
  /** The subject resolved to nothing, which is never a contradiction. */
  | 'unresolved'
  /** The subject's file was parsed only, so a missing edge may be the analysis. */
  | 'syntactic'
  /** An import in the subject's file resolved to nothing, which can hide an edge. */
  | 'unresolved-specifier'

/** What a claim's subject could not be, which is the author's to fix. */
export type ClaimFault =
  | {
      readonly code: 'ambiguous-subject'
      readonly subject: string
      readonly resolved: readonly string[]
    }
  | { readonly code: 'local-subject'; readonly subject: string }
  | {
      readonly code: 'label-invalid'
      readonly axis: string
      readonly value: string
    }

/** One checked claim, or the fault that stopped it being checkable. */
export type Checked =
  | {
      readonly ok: true
      readonly verdict: Verdict
      readonly reason: ClaimReason
      /** The provenance of the fact that decided it, where a fact did. */
      readonly provenance: Provenance | null
      readonly resolved: readonly string[]
      /** Where a vanished subject appears to have gone. Inferred, never a verdict. */
      readonly candidates: readonly Candidate[]
      /** A count claim's observed number, against the one asserted. */
      readonly observed: number | null
    }
  | { readonly ok: false; readonly fault: ClaimFault }

/** Everything checking a claim needs that is not the claim. */
export interface CheckContext {
  readonly root: string
  readonly store: Store
  readonly labels: ReadonlyMap<FilePath, EffectiveLabels>
  /** The fidelity of one file, or `null` where no analysed project globs it. */
  readonly fidelityOf: (file: FilePath) => Fidelity | null
}

/** A resolved endpoint: the node it names, and whether anything clouds it. */
interface Endpoint {
  readonly id: CallSource
  readonly file: FilePath
}

const fault = (one: ClaimFault): Checked => ({ ok: false, fault: one })

/** Check one claim, and say which fact decided it. */
export function checkClaim(context: CheckContext, claim: Claim): Checked {
  if (claim.form === 'count') return countClaim(context, claim)
  if (claim.form === 'scoped') return scopedClaim(context, claim)
  if (claim.form === 'exists') return existsClaim(context, claim)
  if (claim.form === 'label') return labelClaim(context, claim)
  return relationClaim(context, claim)
}

/**
 * The subject a claim names, or why it is not one thing.
 *
 * ADR 0005 makes an ambiguous shorthand an **error in the document** rather than
 * an `unable to verify` — deliberately unlike ADR 0006's rule for an ambiguous
 * *question*, because a document is a committed artefact that must mean one
 * thing while a question asked at a prompt may reasonably be vague. Saying so
 * immediately is what stops it rotting.
 */
function resolveOne(
  context: CheckContext,
  subject: string,
): Endpoint | ClaimFault | null {
  const symbols = resolveSubject(context.store, subject)
  if (symbols.length > 1) {
    return {
      code: 'ambiguous-subject',
      subject,
      resolved: symbols.map((node) => node.id),
    }
  }
  const only = symbols[0]
  if (only !== undefined) return durable(subject, only)
  // A subject with no descriptor path may name a file rather than a symbol,
  // which is what `imports` and `hasLabel` take.
  if (
    !subject.includes('#') &&
    readIndexedFiles(context.store).includes(subject)
  ) {
    return { id: subject, file: subject }
  }
  return null
}

/**
 * ADR 0002: nothing durable may anchor to a local symbol, so a claim may not.
 *
 * A local's id is unstable under edits that are not renames at all, so a
 * document anchored to one would rot without the code changing meaning.
 */
const durable = (subject: string, node: SymbolNode): Endpoint | ClaimFault =>
  node.durable
    ? { id: node.id, file: node.file }
    : { code: 'local-subject', subject }

const isFault = (one: Endpoint | ClaimFault | null): one is ClaimFault =>
  one !== null && 'code' in one

/**
 * Whether anything could have hidden an edge in these files.
 *
 * Two causes, both ADR 0001's: a file the type checker never ran on, and an
 * import that resolved to nothing. Either can manufacture the absence a failing
 * claim rests on, and neither can remove a fact that is present.
 */
function cloudedBy(
  context: CheckContext,
  files: readonly FilePath[],
): ClaimReason | null {
  for (const file of files) {
    if (context.fidelityOf(file) === 'syntactic') return 'syntactic'
  }
  return readUnresolvedSpecifiers(context.store, files).length > 0
    ? 'unresolved-specifier'
    : null
}

/**
 * Turn "does the fact hold" into a verdict, applying the one rule this module has.
 *
 * @param present - Whether the *fact* is there, before the claim's negation is
 * applied. Which of the two outcomes rests on an absence depends on the
 * negation, so the rule is written against the fact rather than against the
 * claim.
 * @param whole - Whether the claim rests on the whole edge set rather than on
 * one witness. A count does, so **either** outcome is doubted by a blind spot:
 * the fourth implementation a count exists to catch is exactly what a
 * `syntactic` file would hide.
 */
function decide(
  context: CheckContext,
  options: {
    readonly present: boolean
    readonly negated: boolean
    readonly whole?: boolean
    readonly files: readonly FilePath[]
    readonly provenance: Provenance | null
    readonly resolved: readonly string[]
    readonly observed?: number | null
    readonly falsified?: ClaimReason
  },
): Checked {
  const holds = options.present !== options.negated
  // A present fact decides its claim outright; an absence is exactly what a
  // blind spot can manufacture, and a count rests on both at once.
  const doubted =
    options.whole === true || !options.present
      ? cloudedBy(context, options.files)
      : null
  const base = {
    ok: true as const,
    resolved: options.resolved,
    candidates: [],
    observed: options.observed ?? null,
  }
  if (doubted !== null) {
    return {
      ...base,
      verdict: 'unable-to-verify',
      reason: doubted,
      provenance: null,
    }
  }
  return holds
    ? {
        ...base,
        verdict: 'verified',
        reason: 'holds',
        provenance: options.provenance,
      }
    : {
        ...base,
        verdict: 'contradicted',
        reason: options.falsified ?? 'falsified',
        provenance: options.provenance,
      }
}

/**
 * A subject that resolved to nothing: `unable to verify`, with where it went.
 *
 * The candidate list is the exact text an agent needs to repair the claim, and
 * it is never a verdict — ADR 0007 refuses to read an empty list as a deletion,
 * because an absence with no candidate is indistinguishable from a move the
 * matcher failed to see.
 */
const vanished = (context: CheckContext, subject: string): Checked => ({
  ok: true,
  verdict: 'unable-to-verify',
  reason: 'unresolved',
  provenance: null,
  resolved: [],
  candidates: continuationOf(context.root, context.store, subject).candidates,
  observed: null,
})

function existsClaim(
  context: CheckContext,
  claim: Extract<Claim, { form: 'exists' }>,
): Checked {
  const found = resolveOne(context, claim.subject)
  if (isFault(found)) return fault(found)
  // `exists` is the one predicate whose evaluation *is* the resolution, so an
  // unresolved subject under a negation is the claim holding rather than a
  // subject that vanished under it.
  if (found === null && !claim.negated) return vanished(context, claim.subject)
  return decide(context, {
    present: found !== null,
    negated: claim.negated,
    files: found === null ? [] : [found.file],
    provenance: 'deterministic',
    resolved: found === null ? [] : [found.id],
  })
}

/** The edge kind each relation predicate reads, and `null` for a call. */
const REFERENCE_KINDS: Readonly<Record<string, ReferenceKind>> = {
  references: 'references',
  extends: 'extends',
  implements: 'implements',
  usesType: 'typeReferences',
}

function relationClaim(
  context: CheckContext,
  claim: Extract<Claim, { form: 'relation' }>,
): Checked {
  const from = resolveOne(context, claim.from)
  if (isFault(from)) return fault(from)
  if (from === null) return vanished(context, claim.from)
  const to = resolveOne(context, claim.to)
  if (isFault(to)) return fault(to)
  if (to === null) return vanished(context, claim.to)

  const witness = witnessFor(context.store, claim.predicate, from, to)
  return decide(context, {
    present: witness !== null,
    negated: claim.negated,
    files: [from.file, to.file],
    provenance: witness,
    resolved: [from.id, to.id],
  })
}

/**
 * The provenance of the strongest fact backing a relation, or `null` for none.
 *
 * Strongest rather than weakest because a claim needs one witness: a pair joined
 * by both a checker-resolved edge and an inferred one is verified by the first,
 * and reporting the second would understate what codedocs actually knows.
 */
function witnessFor(
  store: Store,
  predicate: RelationPredicate,
  from: Endpoint,
  to: Endpoint,
): Provenance | null {
  if (predicate === 'imports') {
    return readImportsOf(store, from.file).some((edge) => edge.to === to.file)
      ? 'deterministic'
      : null
  }
  if (predicate === 'reaches') {
    return reaches(store, from.id, to.id) ? 'deterministic' : null
  }
  if (predicate === 'calls') {
    const sites = (readCalleeSteps(store, [from.id]).get(from.id) ?? [])
      .filter((step) => step.to === to.id)
      .flatMap((step) => step.sites)
    return strongest(sites.map((site) => site.provenance))
  }
  const kind = REFERENCE_KINDS[predicate]
  const edges = readReferencesFrom(store, from.id).filter(
    (edge) => edge.to === to.id && edge.kind === kind,
  )
  return strongest(edges.map((edge) => edge.provenance))
}

const ORDER: readonly Provenance[] = ['deterministic', 'syntactic', 'inferred']

const strongest = (found: readonly Provenance[]): Provenance | null =>
  found.length === 0
    ? null
    : (ORDER.find((one) => found.includes(one)) ?? 'inferred')

/**
 * Whether a call path of any length runs from one symbol to another.
 *
 * Reachability rather than path enumeration: `trace` enumerates because a reader
 * wants to see the routes, and a claim only wants to know there is one, so a
 * visited set makes this linear in the reachable set rather than exponential in
 * its depth.
 */
function reaches(store: Store, from: CallSource, to: CallSource): boolean {
  const seen = new Set<CallSource>([from])
  let live: CallSource[] = [from]
  while (live.length > 0) {
    const steps = readCalleeSteps(store, live)
    const next: CallSource[] = []
    for (const found of steps.values()) {
      for (const step of found) {
        if (step.to === to) return true
        if (seen.has(step.to)) continue
        seen.add(step.to)
        next.push(step.to)
      }
    }
    live = next
  }
  return false
}

const AXIS_VALUES: Readonly<Record<string, readonly string[]>> = {
  role: ['source', 'test', 'config'],
  authorship: ['authored', 'generated'],
}

function labelClaim(
  context: CheckContext,
  claim: Extract<Claim, { form: 'label' }>,
): Checked {
  const values = AXIS_VALUES[claim.axis]
  if (values === undefined || !values.includes(claim.value)) {
    return fault({
      code: 'label-invalid',
      axis: claim.axis,
      value: claim.value,
    })
  }
  const found = resolveOne(context, claim.subject)
  if (isFault(found)) return fault(found)
  if (found === null) return vanished(context, claim.subject)

  // ADR 0003's join: a symbol does not inherit its file's labels, so the label
  // is read against the file the subject is in — which is the node one is filed
  // against.
  const held = valueOf(context.labels, found.file, claim.axis as LabelAxis)
  return decide(context, {
    // A label is always present on both axes, so this is never doubted by a
    // blind spot: the defaults are stored rows like any other.
    present: held === (claim.value as LabelValue),
    negated: claim.negated,
    files: [],
    provenance: 'deterministic',
    resolved: [found.id],
  })
}

/**
 * `onlyCalledBy(x, dir/)` — nothing outside a directory calls the subject.
 *
 * A caller outside the directory is a *presence*, so it falsifies outright; the
 * absence of one is what a blind spot can manufacture, which is why the two
 * halves reach different verdicts under the same doubt.
 */
function scopedClaim(
  context: CheckContext,
  claim: Extract<Claim, { form: 'scoped' }>,
): Checked {
  const found = resolveOne(context, claim.subject)
  if (isFault(found)) return fault(found)
  if (found === null) return vanished(context, claim.subject)

  const prefix = claim.directory.endsWith('/')
    ? claim.directory
    : `${claim.directory}/`
  const outside = readCallersOf(context.store, found.id).filter(
    (edge) => !edge.file.startsWith(prefix),
  )
  return decide(context, {
    present: outside.length === 0,
    negated: false,
    files: [found.file],
    provenance:
      strongest(outside.map((edge) => edge.provenance)) ?? 'deterministic',
    resolved: [found.id],
    observed: outside.length,
  })
}

/**
 * `implementations(x) == 3` and `callers(x) == 0`.
 *
 * A count rests on the whole edge set rather than one witness, so it is doubted
 * by any blind spot touching the subject — the fourth implementation this exists
 * to catch is exactly what a `syntactic` file would hide.
 */
function countClaim(
  context: CheckContext,
  claim: Extract<Claim, { form: 'count' }>,
): Checked {
  const found = resolveOne(context, claim.subject)
  if (isFault(found)) return fault(found)
  if (found === null) return vanished(context, claim.subject)

  const sources =
    claim.predicate === 'callers'
      ? readCallersOf(context.store, found.id).map((edge) => edge.from)
      : readReferencesTo(context.store, found.id)
          .filter((edge) => edge.kind === 'implements')
          .map((edge) => edge.from)
  // Distinct sources, because two call sites in one function are two facts and
  // one caller — and "how many callers" is the question a count claim asks.
  const observed = new Set(sources).size

  return decide(context, {
    present: observed === claim.expected,
    negated: false,
    whole: true,
    files: [found.file],
    provenance: 'deterministic',
    resolved: [found.id],
    observed,
    falsified: 'count-differs',
  })
}
