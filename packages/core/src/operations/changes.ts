/**
 * What differs between a baseline and the working tree, and what must be left
 * out of the comparison.
 *
 * Two sources, and which one runs is exactly what a baseline buys. With one, the
 * two indexes are compared directly — content hashes the analyses already
 * stored, covering committed and uncommitted work alike, since the live index
 * describes the tree rather than the commit. Without one, git names the changed
 * files and the answer goes on without the fidelity comparison.
 */

import { execFileSync } from 'node:child_process'

import type { BaselineChoice } from '../baseline/index.ts'
import type { FilePath } from '../model.ts'
import {
  readCanonicalProjects,
  readFiles,
  readProjects,
  type Store,
} from '../store/index.ts'

/** One file the comparison found different. */
export interface Change {
  readonly file: FilePath
  readonly kind: 'added' | 'changed' | 'removed'
  /**
   * Why this file is out of the comparison, or `null` where it is in it.
   *
   * ADR 0008: a change in fidelity is never a finding. A file that was
   * `syntactic` then and is `typed` now has not changed — the analysis has —
   * and reporting it would fill an answer with the environment moving.
   */
  readonly excluded: string | null
}

/** Every file that differs, with the fidelity-moved ones marked. */
export function changedFiles(
  root: string,
  store: Store,
  baseline: Store | null,
  choice: BaselineChoice,
): Change[] {
  const found =
    baseline === null ? fromGit(root, choice) : fromIndexes(store, baseline)
  // Built once rather than per file: each is two whole-table reads, and a
  // change set on a real repository is thousands of files.
  const now = baseline === null ? null : fidelities(store)
  const before = baseline === null ? null : fidelities(baseline)

  return found
    .map((change) => ({
      ...change,
      excluded:
        now === null || before === null
          ? null
          : fidelityMoved(now, before, change.file),
    }))
    .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
}

/** One index's fidelity per file, through the project its facts came from. */
function fidelities(
  store: Store,
): Map<FilePath, { fidelity: string; cause: string | null }> {
  const projects = new Map(
    readProjects(store).map((project) => [
      project.configPath,
      { fidelity: project.fidelity as string, cause: project.cause },
    ]),
  )
  const found = new Map<FilePath, { fidelity: string; cause: string | null }>()
  for (const [file, project] of readCanonicalProjects(store)) {
    const row = projects.get(project)
    if (row !== undefined) found.set(file, row)
  }
  return found
}

/** The two indexes' file rows, compared on the content hash each stored. */
function fromIndexes(
  store: Store,
  baseline: Store,
): { file: FilePath; kind: Change['kind'] }[] {
  const now = new Map(
    readFiles(store).map((file) => [file.path, file.contentHash]),
  )
  const then = new Map(
    readFiles(baseline).map((file) => [file.path, file.contentHash]),
  )
  const found: { file: FilePath; kind: Change['kind'] }[] = []
  for (const [file, hash] of now) {
    const before = then.get(file)
    if (before === undefined) found.push({ file, kind: 'added' })
    else if (before !== hash) found.push({ file, kind: 'changed' })
  }
  for (const file of then.keys()) {
    if (!now.has(file)) found.push({ file, kind: 'removed' })
  }
  return found
}

/**
 * The changed files git names, for a repository with no baseline to compare.
 *
 * Both halves of the change: what the commits did, and what is uncommitted on
 * top of them. A snapshot is a commit plus whatever is uncommitted, so an answer
 * that read only the first would miss the work in front of the user.
 */
function fromGit(
  root: string,
  choice: BaselineChoice,
): { file: FilePath; kind: Change['kind'] }[] {
  const names = new Set<FilePath>()
  const collect = (args: readonly string[]): void => {
    try {
      const out = execFileSync('git', [...args], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      for (const line of out.split('\n')) {
        if (line !== '') names.add(line)
      }
    } catch {
      // No git, or a commit it does not know: the answer degrades to the
      // uncommitted half rather than failing.
    }
  }
  if (choice.requested !== null) {
    collect(['diff', '--name-only', `${choice.requested}...HEAD`])
  }
  collect(['diff', '--name-only', 'HEAD'])
  collect(['ls-files', '--others', '--exclude-standard'])

  // Every path git names is reported as `changed`: without a baseline index
  // there is nothing to say whether it existed before, and guessing would put
  // an invented distinction in front of the user.
  return [...names].map((file) => ({ file, kind: 'changed' as const }))
}

/**
 * Why one file is out of the comparison, or `null` where it is in it.
 *
 * Read per project, as ADR 0006's conditions block already is: the fidelity that
 * applies to a file is its canonical project's, and one project's fingerprint
 * moving must not silence the rest.
 */
function fidelityMoved(
  now: ReadonlyMap<FilePath, { fidelity: string; cause: string | null }>,
  before: ReadonlyMap<FilePath, { fidelity: string; cause: string | null }>,
  file: FilePath,
): string | null {
  const here = now.get(file)
  const there = before.get(file)
  if (here === undefined || there === undefined) return null
  if (here.fidelity === there.fidelity) return null
  const cause = here.cause === null ? '' : ` (${here.cause})`
  return (
    `analysed as \`${there.fidelity}\` in the baseline and \`${here.fidelity}\` ` +
    `now${cause}, so a difference here would be the analysis changing rather ` +
    `than the code`
  )
}
