/**
 * Continuity: deciding that a symbol named today is the one a document named
 * last month. ADR 0007's **subject matching**, the half that needs no baseline.
 *
 * It starts from a [[Claim]] subject that no longer resolves and asks git and
 * the current index where it went. Its consumer is `docs check`, and it exists
 * because of one measurement: of the symbols whose id vanished over 20 commits,
 * **12 of 20 have the same name elsewhere at `HEAD`**, and over 60 commits it is
 * **95 of 105**. A verdict reading "the symbol is gone, therefore the document
 * is wrong" would be wrong most of the time it fired.
 *
 * Four rules from ADR 0007 shape it.
 *
 * **The git probe is primary and name matching is the fallback.** "This file was
 * renamed to `src/middlewares/withAuth.ts` in commit `ab21c7f`" is evidence; "a
 * symbol of that name exists elsewhere" is a hint. Name matching covers only
 * what git cannot explain, which is the in-file rename.
 *
 * **There is no score.** Every signal is boolean, because any signal producing a
 * continuous value forces a threshold and a threshold is a score wearing a
 * different hat. codedocs inherits exactly one threshold — git's own `-M` — and
 * names whose it is.
 *
 * **An empty list means "no candidate found", in those words, and never
 * "deleted".** ADR 0002 makes deletion only ever an absence, and an absence with
 * no candidate is indistinguishable from a move the matcher failed to see.
 *
 * **Local symbols are never a subject and never a candidate.** A local's id is
 * unstable under edits that are not renames at all, so a match on one is noise
 * dressed as a finding.
 *
 * Snapshot matching — the other matcher, needing two indexes and the
 * `shape-hash` signal — is specified in ADR 0007 and arrives with `impact`.
 */

import { lastCommitTouching, renamesIn, type GitRename } from '../git.ts'
import type { Derivation, FilePath, SymbolNode } from '../model.ts'
import { partsOf } from '../store/shared.ts'
import { readSymbolsNamed, type Store } from '../store/index.ts'

/**
 * One possible continuation of a subject, with the derivations that produced it.
 *
 * Never asserted as the answer even when it is alone in the list: ADR 0005
 * measured `searchParams` matching two candidates in one fixture, and a list was
 * the only honest answer.
 */
export interface Candidate {
  /** Where the subject appears to have gone: a `SymbolId`, or a path alone. */
  readonly id: string
  readonly file: FilePath
  /** Every derivation that fired, strongest first. */
  readonly derivations: readonly Derivation[]
  /** The commit the rename happened in, or `null` for a name match. */
  readonly commit: string | null
  /** Git's own `-M` similarity, or `null`. Never a codedocs score. */
  readonly similarity: number | null
}

/**
 * ADR 0007's precedence, strongest first. This ordering **is** the ranking rule.
 *
 * `content-hash` leads because identical bytes involve no heuristic at all, and
 * it is not a corner case: 46% of cal.com's renames are byte-identical.
 * `path-prefix-rewrite` outranks `git-rename` because it *is* a git rename plus
 * 595 siblings agreeing with it, and that corroboration is the one thing git
 * cannot give you on its own.
 */
const PRECEDENCE: readonly Derivation[] = [
  'content-hash',
  'path-prefix-rewrite',
  'git-rename',
  'name-in-head',
]

const rank = (derivation: Derivation): number => {
  const at = PRECEDENCE.indexOf(derivation)
  return at === -1 ? PRECEDENCE.length : at
}

/**
 * How many candidates travel before the rest are reported as truncated.
 *
 * The ranking is what makes a cap safe: `name-in-head` is the weakest
 * derivation, so a candidate carrying only that never outranks a `content-hash`,
 * and a list of 14 weak candidates reads as weak on its face. The measured tail
 * is short — cal.com's worst offender is `_function` at 14.
 */
export const CANDIDATE_LIMIT = 10

/** A ranked candidate list, and how many were left out of it. */
export interface Continuation {
  readonly candidates: readonly Candidate[]
  /** How many the cap withheld. Truncation, never suppression. */
  readonly withheld: number
}

/**
 * Where a subject that no longer resolves appears to have gone.
 *
 * @param subject - The claim's shorthand, `path#Descriptor.path` or a bare name.
 * A bare name has no path for the git probe to start from, so it is answered by
 * `name-in-head` alone — which is the honest half of the answer rather than a
 * degraded whole one.
 */
export function continuationOf(
  root: string,
  store: Store,
  subject: string,
): Continuation {
  const [path, qualified] = partsOf(subject)
  const found = new Map<string, Candidate>()

  if (qualified !== '') {
    for (const moved of movedPaths(root, path)) {
      // The whole file went somewhere; the symbol went with it under the same
      // descriptor path, which is the claim the author can repair by hand.
      const id = `${moved.file}#${qualified}`
      found.set(id, { ...moved, id })
    }
  }

  for (const named of namedInHead(store, qualified === '' ? path : qualified)) {
    merge(found, {
      id: named.id,
      file: named.file,
      derivations: ['name-in-head'],
      commit: null,
      similarity: null,
    })
  }

  const ranked = [...found.values()].sort(byEvidence)
  return {
    candidates: ranked.slice(0, CANDIDATE_LIMIT),
    withheld: Math.max(0, ranked.length - CANDIDATE_LIMIT),
  }
}

/** A candidate already found by a stronger route keeps its stronger derivations. */
function merge(found: Map<string, Candidate>, one: Candidate): void {
  const held = found.get(one.id)
  if (held === undefined) {
    found.set(one.id, one)
    return
  }
  found.set(one.id, {
    ...held,
    derivations: [...new Set([...held.derivations, ...one.derivations])].sort(
      (a, b) => rank(a) - rank(b),
    ),
  })
}

/**
 * Lexicographic over the derivation set: strongest wins, ties fall through to
 * the next, then to how many fired, and finally to the id so the order is total
 * rather than merely mostly-total, per ADR 0006.
 */
function byEvidence(a: Candidate, b: Candidate): number {
  const width = Math.max(a.derivations.length, b.derivations.length)
  for (let at = 0; at < width; at += 1) {
    const left = a.derivations[at]
    const right = b.derivations[at]
    if (left === undefined) return right === undefined ? 0 : 1
    if (right === undefined) return -1
    const difference = rank(left) - rank(right)
    if (difference !== 0) return difference
  }
  if (a.derivations.length !== b.derivations.length) {
    return b.derivations.length - a.derivations.length
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** One candidate destination for a whole file, before a descriptor is put back on it. */
type MovedFile = Omit<Candidate, 'id'>

/**
 * ADR 0007's two-step git probe: which commit removed the path, and what it did.
 *
 * Two derivations come out of one answer. `content-hash` fires on `R100`, which
 * is git saying the bytes are identical — no heuristic is involved, so it is not
 * git's judgement that is being trusted, only its arithmetic.
 * `path-prefix-rewrite` fires when the same directory rewrite moved a sibling in
 * the same commit: 2,312 of cal.com's 2,452 renamed files (94%) moved alongside
 * one, so per-file matching would re-derive one conclusion 596 times and discard
 * the corroboration that makes it strong.
 *
 * TODO(#72): the unstaged-move bridge ADR 0007 requires of drift — pairing a
 * tracked deletion with an untracked file by content hash — needs the removed
 * files' hashes handed over before repair evicts them, and is not built.
 */
function movedPaths(root: string, path: FilePath): MovedFile[] {
  const commit = lastCommitTouching(root, path)
  if (commit === null) return []
  const renames = renamesIn(root, commit)
  const mine = renames.filter((rename) => rename.from === path)

  return mine.map((rename) => ({
    file: rename.to,
    derivations: derivationsFor(rename, renames),
    commit,
    similarity: rename.similarity,
  }))
}

/** Which signals one rename carries, given every rename in the same commit. */
function derivationsFor(
  rename: GitRename,
  siblings: readonly GitRename[],
): Derivation[] {
  const found: Derivation[] = []
  // git's `R100` is byte-identity, which is arithmetic rather than similarity.
  if (rename.similarity === 100) found.push('content-hash')
  if (sweptWith(rename, siblings) > 0) found.push('path-prefix-rewrite')
  found.push('git-rename')
  return found
}

/** How many siblings made the same directory rewrite in the same commit. */
function sweptWith(rename: GitRename, siblings: readonly GitRename[]): number {
  const from = directoryOf(rename.from)
  const to = directoryOf(rename.to)
  if (from === to) return 0
  return siblings.filter(
    (other) =>
      other !== rename &&
      directoryOf(other.from) === from &&
      directoryOf(other.to) === to,
  ).length
}

const directoryOf = (path: FilePath): string =>
  path.slice(0, path.lastIndexOf('/') + 1)

/**
 * Every durable symbol in the current index declaring the subject's leaf name.
 *
 * The weakest derivation, and never suppressed above a candidate count:
 * suppression is another threshold, failing in the direction that costs most —
 * it would turn a partial answer into silence exactly when a document's subject
 * is a common name, producing the bare "unable to verify" this layer exists to
 * avoid.
 */
function namedInHead(store: Store, qualified: string): SymbolNode[] {
  const leaf = qualified.split('.').at(-1) ?? qualified
  if (leaf === '') return []
  return readSymbolsNamed(store, leaf).filter((node) => node.durable)
}
