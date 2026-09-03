/**
 * The case pool, hand-picked and hand-verified, grouped by difficulty level.
 *
 * For every entry: the issue has a merged fix on `main`, the tree the case runs
 * against is the commit under that fix — which is where the bug still is — and
 * the prompt is the reporter's own text, never the fixing pull request.
 *
 * `truth` lists only non-test source files, because a patch is scored on the
 * source it changed and a run is told not to write tests. It also lists only
 * files the fix *modified*: a file the fix created does not exist in the tree
 * the case runs against, so it can never be ground truth, and a case whose
 * answer depends on one is not seeded.
 *
 * One file per level, because the pool is read by level: the benchmark's claim
 * is that the benefit grows with structural complexity, and a level that holds
 * one case cannot support a direction. The rubric is `bench/DIFFICULTY.md`.
 */

import type { BenchCase } from '../types.ts'
import { level1 } from './level1.ts'
import { level2 } from './level2.ts'
import { level3 } from './level3.ts'
import { level4 } from './level4.ts'

/**
 * A case before its issue text is fetched.
 *
 * The base commit is not written by hand. It is read from GitHub as the fix's
 * parent, because a hash typed twice is a hash that can disagree with itself.
 */
export type Seed = Omit<BenchCase, 'title' | 'body' | 'issueUrl' | 'base'>

/** Every seeded case, level 1 first. */
export const seeds: Seed[] = [...level1, ...level2, ...level3, ...level4]
