/**
 * The label layer: ADR 0003's two axes, computed for every file in the index.
 *
 * A label is the third kind of thing the index holds, and this module is where
 * the signals become one. Three rules shape it:
 *
 * **Union, not first match.** Every signal that fires is stored with its own
 * provenance and derivation, so an answer can always name the rule that
 * classified a file — and `doctor` can report where two signals disagreed. Only
 * the *effective* value per axis is a precedence decision, and `user-config`
 * wins it.
 *
 * **Both axes always have a value.** `role: source` and `authorship: authored`
 * are the defaults, stored like any other label so nothing has to remember them.
 *
 * **The whole set is recomputed rather than invalidated.** ~0.9 s on cal.com
 * against the 22.9 s call-graph sweep it precedes, and incremental invalidation
 * buys under a second at the cost of a staleness bug: an edited `codedocs.jsonc`
 * that leaves old labels behind.
 *
 * Split by concern: `signals.ts` is one function per signal, `scope.ts` is the
 * filter an answer applies, and this file assembles them.
 */

import type { ClassifyRule, Config } from '../config/index.ts'
import type { Authorship, FilePath, Label, Role } from '../model.ts'
import {
  hasGeneratedHeader,
  isCodegenPath,
  roleFromPath,
  trackedFiles,
} from './signals.ts'

export { effective, type EffectiveLabels } from './effective.ts'
export {
  applyScope,
  DEFAULT_SCOPE,
  excludedBy,
  parseFilter,
  scopeOf,
  unfiltered,
  UNSCOPED,
  type LabelFilter,
  type Scope,
  type Scoping,
} from './scope.ts'

/** What one label pass cost, so the assumption that justified it stays checkable. */
export interface LabelPass {
  readonly labels: readonly Label[]
  readonly files: number
  readonly durationMs: number
  /** Whether git answered. `false` means no `git-untracked` signal ran at all. */
  readonly tracked: boolean
}

/**
 * Label every file, in one pass over the whole set.
 *
 * @param files - Every file the index holds. Labels are keyed by node id, so a
 * later signal over symbols adds rows here rather than a second store.
 */
export function labelFiles(
  root: string,
  files: readonly FilePath[],
  config: Config,
): LabelPass {
  const started = performance.now()
  const tracked = trackedFiles(root)
  const labels: Label[] = []

  for (const path of files) {
    labels.push(...labelsFor(root, path, config, tracked))
  }

  return {
    labels,
    files: files.length,
    durationMs: Math.round(performance.now() - started),
    tracked: tracked !== null,
  }
}

/** Every label one file carries, defaults included. */
function labelsFor(
  root: string,
  path: FilePath,
  config: Config,
  tracked: ReadonlySet<FilePath> | null,
): Label[] {
  // The defaults, stored rather than assumed: a caller reading the rows must not
  // have to know what codedocs would have said in their absence, and `default`
  // is the honest derivation for "nothing else fired" — which is also what makes
  // it lose every precedence contest.
  const found: Label[] = [
    {
      node: path,
      axis: 'role',
      value: 'source',
      provenance: 'inferred',
      derivation: 'default',
    },
    {
      node: path,
      axis: 'authorship',
      value: 'authored',
      provenance: 'inferred',
      derivation: 'default',
    },
  ]

  const role = roleFromPath(path)
  if (role !== null) {
    found.push({
      node: path,
      axis: 'role',
      value: role,
      provenance: 'inferred',
      derivation: 'path-convention',
    })
  }

  // Git knows exactly what it tracks, which is why this axis is mostly
  // `deterministic` where `role` is mostly `inferred`. That asymmetry is the
  // honest report rather than a defect.
  //
  // The signal fires either way and the value says which way it went: ADR 0003
  // names it after the case that changes the answer, but a *tracked* file is
  // evidence too — somebody committed it — and dropping that would leave every
  // ordinary file resting on a default.
  if (tracked !== null) {
    found.push({
      node: path,
      axis: 'authorship',
      value: tracked.has(path) ? 'authored' : 'generated',
      provenance: 'deterministic',
      derivation: 'git-untracked',
    })
  }

  if (hasGeneratedHeader(root, path)) {
    found.push({
      node: path,
      axis: 'authorship',
      value: 'generated',
      provenance: 'syntactic',
      derivation: 'generated-header',
    })
  }

  if (isCodegenPath(path)) {
    found.push({
      node: path,
      axis: 'authorship',
      value: 'generated',
      provenance: 'inferred',
      derivation: 'codegen-path',
    })
  }

  found.push(...configured(path, config.classify))
  return found
}

/**
 * The labels `codedocs.jsonc`'s `classify` block forces on a file.
 *
 * Last match wins, as ADR 0003 specifies and as the parser preserves order for,
 * so a narrow rule is written below a broad one. They are labels like any other,
 * which is what lets an answer name the line that caused a file to be treated as
 * generated.
 */
function configured(path: FilePath, rules: readonly ClassifyRule[]): Label[] {
  let role: Role | null = null
  let authorship: Authorship | null = null
  for (const rule of rules) {
    if (!matches(path, rule.glob)) continue
    role = rule.role ?? role
    authorship = rule.authorship ?? authorship
  }
  const found: Label[] = []
  const label = (
    axis: 'role' | 'authorship',
    value: Role | Authorship,
  ): Label => ({
    node: path,
    axis,
    value,
    provenance: 'deterministic',
    derivation: 'user-config',
  })
  if (role !== null) found.push(label('role', role))
  if (authorship !== null) found.push(label('authorship', authorship))
  return found
}

/**
 * Glob-match one repository path. `*` stops at a `/`, `**` crosses them.
 *
 * Written out rather than delegated to `path.matchesGlob`, for the reason the
 * config's own specifier matcher is: a repository path always uses `/`, and
 * matching must mean the same thing on every platform.
 */
function matches(path: FilePath, glob: string): boolean {
  const pattern = glob
    .split(/(\*\*\/|\*\*|\*|\?)/)
    .map((part) => {
      if (part === '**/') return '(?:[^/]+/)*'
      if (part === '**') return '.*'
      if (part === '*') return '[^/]*'
      if (part === '?') return '[^/]'
      return part.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    })
    .join('')
  return new RegExp(`^${pattern}$`).test(path)
}
