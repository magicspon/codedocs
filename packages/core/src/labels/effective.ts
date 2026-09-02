/**
 * Which label wins, per node and axis.
 *
 * The store holds every signal that fired, because an answer must be able to
 * name the rule that classified a file and `doctor` must be able to report where
 * two rules disagreed. Exactly one of them decides what a node *is*, and that is
 * this precedence — ADR 0003's table read top to bottom.
 */

import type {
  Authorship,
  Derivation,
  FilePath,
  Label,
  LabelAxis,
  LabelValue,
  Role,
} from '../model.ts'

/**
 * ADR 0003's signals, strongest first.
 *
 * `default` is last and always loses, which is what makes "nothing fired" a
 * stored fact rather than an absence a reader has to know about.
 */
const PRECEDENCE: readonly Derivation[] = [
  'user-config',
  'git-untracked',
  'generated-header',
  'codegen-path',
  'path-convention',
  'tsconfig-exclude',
  'default',
]

const rank = (derivation: Derivation): number => {
  const at = PRECEDENCE.indexOf(derivation)
  // A derivation from the edge half of the enum classifies nothing, so it can
  // never outrank a label — but it must not silently win by sorting first.
  return at === -1 ? PRECEDENCE.length : at
}

/** What one node is, on both axes, with the label that decided each. */
export interface EffectiveLabels {
  readonly role: Role
  readonly authorship: Authorship
  /** The winning label per axis, so an answer can name the rule that decided it. */
  readonly decided: ReadonlyMap<LabelAxis, Label>
}

/** The defaults, which apply to a node the label pass never reached. */
const DEFAULTS: EffectiveLabels = {
  role: 'source',
  authorship: 'authored',
  decided: new Map(),
}

/**
 * Resolve every node's labels to one value per axis.
 *
 * Returned as a map because every caller that filters wants the whole set at
 * once: a `callers` answer over 1,038 edges asks the same question of each.
 */
export function effective(
  labels: readonly Label[],
): Map<FilePath, EffectiveLabels> {
  const winners = new Map<string, Map<LabelAxis, Label>>()
  for (const label of labels) {
    let byAxis = winners.get(label.node)
    if (byAxis === undefined) {
      byAxis = new Map()
      winners.set(label.node, byAxis)
    }
    const held = byAxis.get(label.axis)
    if (held === undefined || rank(label.derivation) < rank(held.derivation)) {
      byAxis.set(label.axis, label)
    }
  }

  const found = new Map<FilePath, EffectiveLabels>()
  for (const [node, byAxis] of winners) {
    found.set(node, {
      role: (byAxis.get('role')?.value as Role) ?? DEFAULTS.role,
      authorship:
        (byAxis.get('authorship')?.value as Authorship) ?? DEFAULTS.authorship,
      decided: byAxis,
    })
  }
  return found
}

/** One node's effective labels, defaulting where the pass never reached it. */
const labelsOf = (
  effectiveLabels: ReadonlyMap<FilePath, EffectiveLabels>,
  node: string,
): EffectiveLabels => effectiveLabels.get(node) ?? DEFAULTS

/** One axis's effective value for a node. */
export const valueOf = (
  effectiveLabels: ReadonlyMap<FilePath, EffectiveLabels>,
  node: string,
  axis: LabelAxis,
): LabelValue =>
  axis === 'role'
    ? labelsOf(effectiveLabels, node).role
    : labelsOf(effectiveLabels, node).authorship
