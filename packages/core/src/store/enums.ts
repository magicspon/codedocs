/**
 * Closed enums are stored as their position in these lists rather than as text.
 * `unresolved_call.cause` alone repeated one of two words 91,674 times on
 * cal.com, and `call_edge` carried three such columns on every row.
 *
 * **Append only, never reorder.** The position is what the index holds, so
 * moving a name silently relabels every stored row. `store.test.ts` pins the
 * lists for that reason; changing one is a schema change and owes a version bump.
 */

import type {
  CallerAttribution,
  Derivation,
  Fidelity,
  LabelAxis,
  LabelValue,
  PreconditionCause,
  Provenance,
  ReferenceKind,
  SymbolKind,
  UnresolvedCallCause,
} from '../model.ts'

export const KINDS: readonly SymbolKind[] = [
  'function',
  'class',
  'interface',
  'typeAlias',
  'enum',
  'variable',
  'method',
  'namespace',
]
export const ATTRIBUTIONS: readonly CallerAttribution[] = [
  'symbol',
  'variable',
  'file',
]
export const PROVENANCES: readonly Provenance[] = [
  'deterministic',
  'syntactic',
  'inferred',
]
export const DERIVATIONS: readonly Derivation[] = [
  'checker-signature',
  'checker-base-types',
  'heritage-clause',
  'jsx-element-rule',
  'shared-method-name',
  'manifest',
  'resolver',
  'user-config',
  'git-untracked',
  'generated-header',
  'codegen-path',
  'path-convention',
  'tsconfig-exclude',
  'default',
  // ADR 0007's continuity signals. Listed so the table and the type stay one
  // set; no row carries one, because continuity persists nothing.
  'content-hash',
  'path-prefix-rewrite',
  'git-rename',
  'shape-hash',
  'descriptor-suffix',
  'declared-name',
  'name-in-head',
  'call-site-overlap',
]
export const CAUSES: readonly UnresolvedCallCause[] = [
  'external',
  'unresolvable',
  'dynamic',
]
export const REFERENCE_KINDS: readonly ReferenceKind[] = [
  'references',
  'extends',
  'implements',
  'typeReferences',
]
export const LABEL_AXES: readonly LabelAxis[] = ['role', 'authorship']
/** Both axes' values in one list: a label row holds an axis and a value, and the axis says which half applies. */
export const LABEL_VALUES: readonly LabelValue[] = [
  'source',
  'test',
  'config',
  'authored',
  'generated',
]
export const FIDELITIES: readonly Fidelity[] = ['typed', 'syntactic']
export const PRECONDITION_CAUSES: readonly PreconditionCause[] = [
  'unprepared',
  'missing-generated',
  'unmapped',
  'broken',
]

/** The closed lists, exposed only so a test can pin their order. */
export interface EnumCodes {
  readonly kind: readonly SymbolKind[]
  readonly attribution: readonly CallerAttribution[]
  readonly provenance: readonly Provenance[]
  readonly derivation: readonly Derivation[]
  readonly cause: readonly UnresolvedCallCause[]
  readonly referenceKind: readonly ReferenceKind[]
  readonly labelAxis: readonly LabelAxis[]
  readonly labelValue: readonly LabelValue[]
  readonly fidelity: readonly Fidelity[]
  readonly preconditionCause: readonly PreconditionCause[]
}

/** The stored order of every closed enum, so a reorder fails a test. */
export const ENUM_CODES: EnumCodes = {
  kind: KINDS,
  attribution: ATTRIBUTIONS,
  provenance: PROVENANCES,
  derivation: DERIVATIONS,
  cause: CAUSES,
  referenceKind: REFERENCE_KINDS,
  labelAxis: LABEL_AXES,
  labelValue: LABEL_VALUES,
  fidelity: FIDELITIES,
  preconditionCause: PRECONDITION_CAUSES,
}

/** The stored code for one enum value. Throws rather than storing a wrong row. */
export function code<T>(list: readonly T[], value: T, column: string): number {
  const at = list.indexOf(value)
  if (at === -1) throw new Error(`unknown ${column}: ${String(value)}`)
  return at
}

/** The enum value one stored code names. Throws rather than inventing one. */
export function named<T>(
  list: readonly T[],
  stored: number,
  column: string,
): T {
  const value = list[stored]
  if (value === undefined) throw new Error(`unknown ${column} code: ${stored}`)
  return value
}
