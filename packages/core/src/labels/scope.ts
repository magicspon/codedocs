/**
 * The scope channel: what the caller asked to be excluded, and what that cost.
 *
 * ADR 0006 makes this **one generic pair over the labels** rather than bespoke
 * per-operation flags like `--no-tests`: the store is keyed by node id precisely
 * so the same filter works on a symbol and on a file.
 *
 * A scope exclusion is reported as a count beside the echoed scope and **never
 * as a blind spot**. codedocs knows exactly what it withheld; a blind spot is by
 * definition what it could not see, and filing a known exclusion as one teaches
 * readers that blind spots are routine — which is the one thing that would
 * destroy the signal ADR 0001 exists to protect.
 */

import type { FilePath, LabelAxis, LabelValue } from '../model.ts'
import { valueOf, type EffectiveLabels } from './effective.ts'

/** One `axis=value` filter, as the caller spelled it. */
export interface LabelFilter {
  readonly axis: LabelAxis
  readonly value: LabelValue
}

/** The scope one answer applied, echoed on every answer whether or not it bit. */
export interface Scope {
  /** A result is kept only if it matches every one of these. */
  readonly include: readonly LabelFilter[]
  /** A result is dropped if it matches any of these. */
  readonly exclude: readonly LabelFilter[]
  /** How many results the scope withheld. Never a blind spot, never truncation. */
  readonly excluded: number
}

/**
 * The default scope, applied when the caller names none.
 *
 * `role` is deliberately unfiltered: hiding test callers from `callers` makes
 * tested-but-unreferenced code look dead, which is the Redwood Cells trap the
 * backend spike found and named. `authorship` is not — generated code is real
 * source, but a repository's answers are about what its authors wrote.
 */
export const DEFAULT_SCOPE: Scope = {
  include: [{ axis: 'authorship', value: 'authored' }],
  exclude: [],
  excluded: 0,
}

/**
 * The scope an operation applies, and the labels to apply it against.
 *
 * Bundled because an operation never wants one without the other, and because
 * the labels are read once per session rather than once per operation.
 */
export interface Scoping {
  readonly scope: Scope
  readonly labels: ReadonlyMap<FilePath, EffectiveLabels>
}

/**
 * The scoping an answer applies when no labels have been read.
 *
 * Inert rather than absent: every node an empty map is asked about answers with
 * the defaults, which the default scope keeps. It is what a caller that does not
 * filter — a test, a reproduction — passes rather than a `null` every operation
 * would then have to test for.
 */
export const UNSCOPED: Scoping = { scope: DEFAULT_SCOPE, labels: new Map() }

/** The scope that filters nothing, for an operation whose unit has no file. */
export const unfiltered = (scoping: Scoping): Scope => ({
  ...scoping.scope,
  excluded: 0,
})

/** The axes and the values each one takes, for a parser that may not be trusted. */
const AXIS_VALUES: Readonly<Record<LabelAxis, readonly LabelValue[]>> = {
  role: ['source', 'test', 'config'],
  authorship: ['authored', 'generated'],
}

/**
 * Read one `axis=value` filter, or say why it is not one.
 *
 * The vocabulary is closed, so a typo is refused rather than silently matching
 * nothing — a filter that quietly excludes everything is the worst failure this
 * flag can have.
 */
export function parseFilter(
  raw: string,
): { readonly filter: LabelFilter } | { readonly expected: string } {
  const [axis, ...rest] = raw.split('=')
  const value = rest.join('=')
  const values = AXIS_VALUES[axis as LabelAxis]
  if (axis === undefined || values === undefined) {
    return { expected: `an axis of ${Object.keys(AXIS_VALUES).join(' or ')}` }
  }
  if (!values.includes(value as LabelValue)) {
    return { expected: `\`${axis}\` to be one of ${values.join(', ')}` }
  }
  return { filter: { axis: axis as LabelAxis, value: value as LabelValue } }
}

/**
 * The scope a request carries: what the caller named, or the default.
 *
 * An explicit `--label` on an axis replaces the default for that axis alone, so
 * `--label role=test` still excludes generated code and `--label
 * authorship=generated` asks about exactly what the default hides.
 */
export function scopeOf(
  include: readonly LabelFilter[],
  exclude: readonly LabelFilter[],
): Scope {
  const named = new Set(include.map((filter) => filter.axis))
  const defaults = DEFAULT_SCOPE.include.filter(
    (filter) => !named.has(filter.axis),
  )
  return { include: [...defaults, ...include], exclude, excluded: 0 }
}

/**
 * Whether a scope excludes a node.
 *
 * The join ADR 0003 names: a symbol does not inherit its file's labels, so an
 * operation asks about the *file* its results are in. Storing an inherited copy
 * would be ADR 0002's containment mistake in new clothes.
 */
export function excludedBy(
  scope: Scope,
  labels: ReadonlyMap<FilePath, EffectiveLabels>,
  node: string,
): boolean {
  for (const filter of scope.include) {
    if (valueOf(labels, node, filter.axis) !== filter.value) return true
  }
  for (const filter of scope.exclude) {
    if (valueOf(labels, node, filter.axis) === filter.value) return true
  }
  return false
}

/**
 * Apply a scope to one operation's results, and count what it withheld.
 *
 * @param fileOf - The node each result is filed under, which is the file it is
 * in for every operation that has one.
 */
export function applyScope<TResult>(
  scoping: Scoping,
  results: readonly TResult[],
  fileOf: (result: TResult) => string,
): { readonly kept: TResult[]; readonly scope: Scope } {
  const { scope, labels } = scoping
  const kept = results.filter(
    (result) => !excludedBy(scope, labels, fileOf(result)),
  )
  return {
    kept,
    scope: { ...scope, excluded: results.length - kept.length },
  }
}
