/**
 * One fact of a draft, as the line a reader sees.
 *
 * Split from the operation because these are the choices about *reading*: which
 * end of an edge to print, when provenance is worth a reader's attention, and
 * when a label needs the node it sits on named. The operation above decides what
 * a section is about; this decides what a fact looks like once it is in one.
 */

import type { CallEdge, FilePath, Label, ReferenceEdge } from '../model.ts'
import type { DraftFactGroup } from './draft-markdown.ts'
import type { FileReport } from './file.ts'
import { shorthandOf } from '../symbol-id.ts'

/** Drop the groups with nothing in them: an absent fact is not a fact. */
export const groups = (
  entries: readonly (readonly [string, readonly string[]])[],
): DraftFactGroup[] =>
  entries
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }))

/**
 * One call, as the end of it the reader is not already looking at.
 *
 * Provenance rides along only where it is not `deterministic`: ADR 0006 forbids
 * a renderer dropping an `inferred` fact's provenance, and printing
 * `deterministic` on every line would bury the ones that matter.
 */
export const callFact =
  (end: 'from' | 'to') =>
  (edge: CallEdge): string =>
    `\`${shorthandOf(edge[end])}\` (${edge.file}:${edge.line}${hedge(edge.provenance, edge.derivation)})`

/** The same, with the kind of reference it is, which `calls` does not need. */
export const referenceFact =
  (end: 'from' | 'to') =>
  (edge: ReferenceEdge): string =>
    `\`${shorthandOf(edge[end])}\` (${edge.file}:${edge.line}, ${edge.kind}${hedge(edge.provenance, edge.derivation)})`

/**
 * One label, and the rule that produced it.
 *
 * The node is named where it is not the section's own subject: a symbol section
 * reports its file's labels beside its own, and `role=test` read as a fact about
 * the function rather than about the file it lives in is a fact misread.
 */
export const labelFact =
  (subject: string) =>
  (label: Label): string =>
    `\`${label.axis}=${label.value}\`` +
    `${label.node === subject ? '' : ` on \`${label.node}\``} ` +
    `(${label.provenance}: ${label.derivation})`

export const importFact = (edge: {
  specifier: string
  to: FilePath | null
}): string =>
  edge.to === null
    ? `\`${edge.specifier}\` (unresolved)`
    : `\`${edge.specifier}\` → \`${edge.to}\``

const hedge = (provenance: string, derivation: string): string =>
  provenance === 'deterministic' ? '' : `, ${provenance}: ${derivation}`

/**
 * The warning a `syntactic` section carries into the committed file.
 *
 * Fidelity is not completeness — a `typed` file may still have blind spots — but
 * a `syntactic` one has a named reason to doubt every edge below it, and the
 * reader of the committed document has no envelope to read that from.
 */
export function cautionFor(report: FileReport | undefined): string | null {
  if (report === undefined || report.fidelity !== 'syntactic') return null
  const because =
    report.cause === null ? '' : ` (\`${report.cause}\`)` /* ADR 0009's cause */
  return (
    `codedocs analysed \`${report.path}\` syntactically${because}, so the facts ` +
    'below are what parsing alone could see. `codedocs doctor` names what would ' +
    'raise it.'
  )
}
