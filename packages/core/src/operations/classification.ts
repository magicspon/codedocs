/**
 * `doctor`'s view of the label layer: what it classified, and where it is least
 * sure.
 *
 * ADR 0003 asks for this list by name, and for one reason: `classify` in
 * `codedocs.jsonc` is the escape hatch, and a user who cannot see what the
 * signals decided has no way to discover that the escape hatch exists — or which
 * file needs it.
 */

import type { Authorship, FilePath, Label, LabelAxis, Role } from '../model.ts'
import { effective, type EffectiveLabels } from '../labels/index.ts'

/** How many files fall under one `(role, authorship)` pair. */
export interface ClassificationCount {
  readonly role: Role
  readonly authorship: Authorship
  readonly files: number
  /** The derivations that decided these files, distinct and sorted. */
  readonly derivations: readonly string[]
}

/** One file where two signals fired on one axis with different answers. */
export interface Disagreement {
  readonly file: FilePath
  readonly axis: LabelAxis
  /** Each value that fired, with the signal that produced it, strongest first. */
  readonly values: readonly { value: string; derivation: string }[]
}

/** What `doctor` reports about the classification of the repository. */
export interface Classification {
  /** One row per `(role, authorship)` pair, sorted by role then authorship. */
  readonly counts: readonly ClassificationCount[]
  /**
   * Files whose effective classification rests on a convention rather than on
   * evidence.
   *
   * A guess codedocs actually made, not a file it had nothing to say about: the
   * default is excluded, because "no signal fired" is not a classification a
   * user needs to correct. `role` is mostly inferred and `authorship` mostly
   * deterministic, and that asymmetry is the honest report rather than a defect.
   */
  readonly inferred: readonly FilePath[]
  /** Where the signals contradicted each other, which is where config is owed. */
  readonly disagreements: readonly Disagreement[]
}

/** Assemble the classification report from every label in the index. */
export function classification(labels: readonly Label[]): Classification {
  const byNode = group(labels)
  const decided = effective(labels)

  return {
    counts: countPairs(byNode, decided),
    inferred: [...decided.entries()]
      .filter(([, labels]) =>
        [...labels.decided.values()].some(
          (label) =>
            label.provenance === 'inferred' && label.derivation !== 'default',
        ),
      )
      .map(([node]) => node)
      .sort(),
    disagreements: disagreementsIn(byNode),
  }
}

/** Every label, keyed by the node it classifies. */
function group(labels: readonly Label[]): Map<string, Label[]> {
  const byNode = new Map<string, Label[]>()
  for (const label of labels) {
    const held = byNode.get(label.node)
    if (held === undefined) byNode.set(label.node, [label])
    else held.push(label)
  }
  return byNode
}

/** One row per `(role, authorship)` pair, with the signals that decided them. */
function countPairs(
  byNode: ReadonlyMap<string, readonly Label[]>,
  decided: ReadonlyMap<string, EffectiveLabels>,
): ClassificationCount[] {
  const pairs = new Map<
    string,
    { role: Role; authorship: Authorship; files: number; from: Set<string> }
  >()
  for (const node of byNode.keys()) {
    const labels = decided.get(node)
    if (labels === undefined) continue
    const key = `${labels.role} ${labels.authorship}`
    const held = pairs.get(key) ?? {
      role: labels.role,
      authorship: labels.authorship,
      files: 0,
      from: new Set<string>(),
    }
    held.files += 1
    for (const label of labels.decided.values()) held.from.add(label.derivation)
    pairs.set(key, held)
  }
  return [...pairs.values()]
    .map(({ role, authorship, files, from }) => ({
      role,
      authorship,
      files,
      derivations: [...from].sort(),
    }))
    .sort(
      (a, b) => compare(a.role, b.role) || compare(a.authorship, b.authorship),
    )
}

/**
 * Where two signals on one axis disagreed.
 *
 * The `@generated` header without the matching name, the `.test.ts` inside
 * `src/` — the cases ADR 0003 names, and the ones worth a `classify` line.
 */
function disagreementsIn(
  byNode: ReadonlyMap<string, readonly Label[]>,
): Disagreement[] {
  const found: Disagreement[] = []
  for (const [file, labels] of byNode) {
    for (const axis of ['role', 'authorship'] as const) {
      // The default is not a disagreeing signal: it is what fires when nothing
      // else did, so a file with one real signal has no contradiction to report.
      const fired = labels.filter(
        (label) => label.axis === axis && label.derivation !== 'default',
      )
      const values = new Set(fired.map((label) => label.value))
      if (values.size < 2) continue
      found.push({
        file,
        axis,
        values: fired.map((label) => ({
          value: label.value,
          derivation: label.derivation,
        })),
      })
    }
  }
  return found.sort(
    (a, b) => compare(a.file, b.file) || compare(a.axis, b.axis),
  )
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
