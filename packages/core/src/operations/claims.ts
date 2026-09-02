/**
 * The facts of an `evidence` answer, restated as ADR 0005 claim expressions.
 *
 * ADR 0005's consequence is that codedocs hands back **candidate claims** rather
 * than writing documents: an agent that has the syntax handed to it never
 * invents one, and codedocs never puts an unreviewed fact into a committed file.
 * ADR 0006 then trimmed it from always-on to an opt-in `--claims` on the machine
 * renderer alone, because a claim string is a restatement of a fact already in
 * the payload — always sending it would spend budget saying the same thing twice.
 *
 * Nothing here reads the index. Every expression comes from the payload it is
 * handed, so a claim can never assert something the answer did not carry.
 */

import type { CallEdge, Label, ReferenceEdge, ReferenceKind } from '../model.ts'
import { shorthandOf } from '../symbol-id.ts'
import type { FileReport } from './file.ts'
import type { EvidenceReport } from './evidence.ts'

/**
 * ADR 0005's predicate for each reference kind.
 *
 * `typeReferences` is `usesType` and not its own name: the predicate set is the
 * document author's vocabulary and the edge enum is the index's. They are
 * allowed to differ, and this table is the one place that says how.
 */
const PREDICATES: Readonly<Record<ReferenceKind, string>> = {
  references: 'references',
  extends: 'extends',
  implements: 'implements',
  typeReferences: 'usesType',
}

/**
 * One candidate claim: the expression, and the nodes it anchors to.
 *
 * The subjects are carried apart from the text because only they are tested for
 * durability — an axis and a value are literals, and running them through the
 * same test would only pass them by accident.
 */
interface Candidate {
  readonly text: string
  readonly subjects: readonly string[]
}

/**
 * One predicate over subjects alone, which is every claim but `hasLabel`.
 *
 * Subjects are projected to ADR 0005's shorthand on the way in: a claim is
 * written into a paragraph by hand, and ADR 0005 refused the `SymbolId` string
 * for that job on the grounds that nobody will type one.
 */
const over = (name: string, ...ids: readonly string[]): Candidate => {
  const subjects = ids.map(shorthandOf)
  return { text: `${name}(${subjects.join(', ')})`, subjects }
}

/**
 * Restate one answer's facts as claim expressions, in the order they appear.
 *
 * @param durable - Every `SymbolId` a document may anchor to. ADR 0002 forbids
 * anything durable from anchoring to a local symbol and ADR 0005 refuses such a
 * claim at check time, so a claim about one is not emitted — the fact itself is
 * still in the payload, where it is a fact rather than an assertion someone is
 * being invited to commit.
 */
export function claimsFor(
  report: EvidenceReport,
  durable: ReadonlySet<string>,
): string[] {
  const candidates: readonly (Candidate | null)[] = [
    ...report.symbols.items.map((node) => over('exists', node.id)),
    ...report.files.items.flatMap(importClaims),
    ...report.callers.items.map(callClaim),
    ...report.callees.items.map(callClaim),
    ...report.references.items.map(referenceClaim),
    ...report.labels.items.map(labelClaim),
  ]
  const anchored = (subject: string): boolean =>
    !subject.includes('#') || durable.has(subject)

  // Deduplicated because a claim is about a pair and the payload is about sites:
  // two calls between the same two symbols are two facts and one claim. A `Set`
  // keeps the first occurrence, so the order stays the payload's order and the
  // answer stays reproducible.
  return [
    ...new Set(
      candidates
        .filter(
          (one): one is Candidate =>
            one !== null && one.subjects.every(anchored),
        )
        .map((one) => one.text),
    ),
  ]
}

/** One `imports` claim per specifier that resolved inside the repository. */
const importClaims = (file: FileReport): Candidate[] =>
  file.imports.flatMap((edge) =>
    // An unresolved specifier names a package or nothing at all, and neither is
    // a node a claim can be made about.
    edge.to === null ? [] : [over('imports', edge.from, edge.to)],
  )

/**
 * One `calls` claim, or none where the call has no symbol to credit.
 *
 * A call attributed to a file is a real fact and not a `calls` claim: the
 * predicate relates two symbols, and the source there is a module.
 */
const callClaim = (edge: CallEdge): Candidate | null =>
  edge.attribution === 'file' ? null : over('calls', edge.from, edge.to)

/** The same rule for a reference, under the predicate its kind maps to. */
const referenceClaim = (edge: ReferenceEdge): Candidate | null =>
  edge.attribution === 'file'
    ? null
    : over(PREDICATES[edge.kind], edge.from, edge.to)

/** `hasLabel`, the one claim whose arguments are not all subjects. */
const labelClaim = (label: Label): Candidate => {
  const subject = shorthandOf(label.node)
  return {
    text: `hasLabel(${subject}, ${label.axis}, ${label.value})`,
    subjects: [subject],
  }
}
