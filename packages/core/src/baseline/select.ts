/**
 * Which baseline an answer compares against, and what to say when it is not the
 * one that was asked for.
 *
 * ADR 0008: the default is the merge base with the default branch, which is
 * right for a two-day branch and wrong for a month-old one — so the merge base
 * *seeds* the search and the answer is **the newest stored baseline that is an
 * ancestor of `HEAD`**.
 *
 * When an older ancestor is used instead, that is **substitution**, reported
 * through the scope channel with the commit requested, the commit used and the
 * distance between them. Never a blind spot: codedocs knows exactly which
 * baseline it used.
 */

import { commitsBetween, defaultBranch, mergeBase, resolveRef } from '../git.ts'
import { listBaselines, type StoredBaseline } from './store.ts'

/** Which baseline an answer used, and how far it is from the one asked for. */
export interface BaselineChoice {
  /** The baseline in use, or `null` where none could be. */
  readonly used: StoredBaseline | null
  /** The commit the caller asked about, resolved. `null` where none was named. */
  readonly requested: string | null
  /**
   * Commits between the requested commit and the one used, signed.
   *
   * Positive where the baseline in use is *newer* than the commit asked for,
   * which is the ordinary case: the answer is the newest stored ancestor.
   */
  readonly distance: number | null
  /** Why no baseline is in use, or `null` where one is. */
  readonly absent: string | null
}

/**
 * Choose the baseline for this answer.
 *
 * @param ref - What `--base` named, or `null` for the default: the merge base
 * with the default branch.
 */
export function chooseBaseline(
  root: string,
  ref: string | null,
): BaselineChoice {
  const held = listBaselines(root).filter((one) => one.ancestor)
  const requested = requestedCommit(root, ref)

  if (held.length === 0) {
    return {
      used: null,
      requested,
      distance: null,
      // A missing baseline degrades an answer rather than blocking one: subject
      // matching needs none, so this is a blind spot on an answer that still
      // comes back at exit 0.
      absent:
        'no baseline is stored for an ancestor of HEAD — one is captured by ' +
        '`codedocs analyse` over a clean tree',
    }
  }

  // Exact first: a caller who named a commit that *is* stored gets it, and no
  // substitution is reported.
  const exact = held.find((one) => one.commit === requested)
  if (exact !== undefined) {
    return { used: exact, requested, distance: 0, absent: null }
  }

  // `listBaselines` returns newest first, so the first ancestor is the newest.
  const used = held[0]!
  return {
    used,
    requested,
    distance:
      requested === null ? null : commitsBetween(root, requested, used.commit),
    absent: null,
  }
}

/**
 * The commit the caller asked about.
 *
 * A named ref is resolved as written. Absent one, the merge base with the
 * default branch is the seed — it is, by construction, a commit the developer
 * once had checked out clean, which is the only kind that has a baseline.
 */
function requestedCommit(root: string, ref: string | null): string | null {
  if (ref !== null) return resolveRef(root, ref)
  const branch = defaultBranch(root)
  return branch === null ? null : mergeBase(root, branch)
}
