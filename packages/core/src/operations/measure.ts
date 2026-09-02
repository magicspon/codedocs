/**
 * `doctor --measure`: signals 1-3 re-run against the working tree, against what
 * the index stored.
 *
 * ADR 0009 makes this a diagnostic and nothing more. It opens no program and
 * extracts nothing — a flag that silently costs a cold build is the hidden cost
 * `analyse` exists to be instead of. What it buys is the one thing the static
 * view cannot know: the index reports the analysis that ran, so a machine that
 * moved underneath it in a way the [[Environment fingerprint]] does not hash
 * reads as unchanged for ever.
 *
 * The dependency check is that blind spot in particular. Signal 1 asks whether a
 * `node_modules` exists at all; an install that is present and incomplete
 * answers yes, hashes the same lockfile, and keeps a stored `typed` alive over
 * files the checker can no longer see whole.
 */

import { dirname, join } from 'node:path'

import type { FilePath, ProjectNode } from '../model.ts'
import {
  absentDependencies,
  preflightProjects,
  type ProjectPreflight,
} from '../preflight/index.ts'

/** Which measurement disagreed. Named after ADR 0009's signals. */
export type MeasuredSignal =
  | 'tsconfig'
  | 'node_modules'
  | 'dependencies'
  | 'postinstall'
  | 'globbed'
  | 'fingerprint'

/** One disagreement between the working tree now and the index's stored row. */
export interface Disagreement {
  readonly project: FilePath
  readonly signal: MeasuredSignal
  /** What the index recorded when it analysed this project. */
  readonly indexed: string
  /** What the same signal says about the working tree now. */
  readonly measured: string
}

/** The order disagreements are reported in: the config, then the signals in turn. */
const SIGNAL_ORDER: readonly MeasuredSignal[] = [
  'tsconfig',
  'node_modules',
  'dependencies',
  'postinstall',
  'globbed',
  'fingerprint',
]

/** How many absent dependencies are named before the rest are counted. */
const NAMED_DEPENDENCIES = 3

/**
 * Re-measure every project and name where the tree and the index disagree.
 *
 * @param seenFiles - The tree walk the session has already done, so signal 3
 * needs no sweep of its own.
 */
export function measureProjects(
  root: string,
  projects: readonly ProjectNode[],
  seenFiles: readonly FilePath[],
): Disagreement[] {
  const measured = preflightProjects(
    root,
    projects.map((project) => project.configPath),
    seenFiles,
  )
  const found = projects.flatMap((project) => {
    const preflight = measured.get(project.configPath)
    return preflight === undefined ? [] : compare(root, project, preflight)
  })
  return found.sort(
    (a, b) =>
      compareText(a.project, b.project) ||
      SIGNAL_ORDER.indexOf(a.signal) - SIGNAL_ORDER.indexOf(b.signal),
  )
}

/**
 * Every disagreement one project has, in signal order.
 *
 * One comparison per signal, each answering with a disagreement or with silence,
 * so a signal added later is a line here rather than another branch inside a
 * function that already reads five things.
 */
function compare(
  root: string,
  stored: ProjectNode,
  measured: ProjectPreflight,
): Disagreement[] {
  // A project whose config has gone is not an environment change but a
  // structural one, and every signal below it would be measured against a
  // config that is not there. It is the whole answer for this project.
  if (!measured.present) {
    return [
      at(stored, 'tsconfig', 'analysed as a project', 'its tsconfig is gone'),
    ]
  }
  return [
    // The deeper question is asked only where signal 1 itself agrees: an
    // uninstalled project has every dependency absent, and saying so twice is
    // the duplication `doctor` deduplicates causes to avoid.
    nodeModules(stored, measured) ?? incomplete(root, stored, measured),
    postinstall(stored, measured),
    globbed(stored, measured),
    // Last, because it is the sum of the four above plus the lockfile and the
    // `compilerOptions`: on its own it says only that something moved.
    fingerprint(stored, measured),
  ].filter((found): found is Disagreement => found !== null)
}

/** One disagreement about one project. */
const at = (
  stored: ProjectNode,
  signal: MeasuredSignal,
  indexed: string,
  measured: string,
): Disagreement => ({
  project: stored.configPath,
  signal,
  indexed,
  measured,
})

/** Signal 1: a `node_modules` at or above the project. */
function nodeModules(
  stored: ProjectNode,
  measured: ProjectPreflight,
): Disagreement | null {
  const installed = stored.cause !== 'unprepared'
  if (installed === measured.installed) return null
  return at(
    stored,
    'node_modules',
    installed ? 'a node_modules above the project' : 'no node_modules',
    measured.installed ? 'a node_modules above the project' : 'none',
  )
}

/**
 * Signal 1 again, at the granularity that catches an incomplete install.
 *
 * The accepted blind spot, made visible: the fingerprint hashes the lockfile
 * rather than the tree the lockfile produced, so a `node_modules` edited by hand
 * — a package deleted, a linked package replaced — moves nothing and the index
 * keeps answering at the fidelity it was built with.
 */
function incomplete(
  root: string,
  stored: ProjectNode,
  measured: ProjectPreflight,
): Disagreement | null {
  if (!measured.installed) return null
  const absent = absentDependencies(
    root,
    join(root, dirname(stored.configPath)),
  )
  if (absent.length === 0) return null
  const named = absent.slice(0, NAMED_DEPENDENCIES).join(', ')
  const rest =
    absent.length > NAMED_DEPENDENCIES
      ? `, and ${absent.length - NAMED_DEPENDENCIES} more`
      : ''
  return at(
    stored,
    'dependencies',
    `analysed as \`${stored.fidelity}\``,
    `${absent.length} declared dependency(s) absent from node_modules: ${named}${rest}`,
  )
}

/** Signal 2: an install script declared in the nearest `package.json`. */
function postinstall(
  stored: ProjectNode,
  measured: ProjectPreflight,
): Disagreement | null {
  if (stored.postinstall === measured.postinstall) return null
  return at(
    stored,
    'postinstall',
    stored.postinstall ? 'an install script' : 'no install script',
    measured.postinstall ? 'an install script' : 'none',
  )
}

/** Signal 3: whether the config globs anything at all. */
function globbed(
  stored: ProjectNode,
  measured: ProjectPreflight,
): Disagreement | null {
  const globbing = stored.cause !== 'missing-generated'
  if (globbing === measured.globbed.length > 0) return null
  return at(
    stored,
    'globbed',
    globbing ? 'its config globbed files' : 'its config globbed nothing',
    measured.globbed.length === 0
      ? 'it globs nothing'
      : `it globs ${measured.globbed.length} file(s)`,
  )
}

/** The fingerprint over all of it, which is what decides a re-analysis. */
function fingerprint(
  stored: ProjectNode,
  measured: ProjectPreflight,
): Disagreement | null {
  if (stored.fingerprint === measured.fingerprint) return null
  return at(
    stored,
    'fingerprint',
    'the environment it was analysed in',
    'the environment has moved since',
  )
}

const compareText = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0
