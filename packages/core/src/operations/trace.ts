/**
 * `trace <root>` — the first aggregate, and the one the human story leads with.
 *
 * Settled constraint 4 on the map: aggregates lead. `callers` and `callees`
 * answer one hop, which any editor already does; a *path* is the answer no
 * editor offers. ADR 0006 also absorbed `walkthrough` into this operation,
 * because what was left of `walkthrough` once codedocs writes no prose was a
 * natural-language parser we do not have and a walk we do.
 *
 * The walk is outward — what does this call, and what does *that* call. There is
 * no direction flag: the inward aggregate is `impact`, which ADR 0006 puts in
 * Phase 5 with a baseline behind it, and a flag here would pre-empt that design
 * with the half of it that happens to be cheap.
 */

import { answer, type AnswerContext, type Envelope } from '../envelope.ts'
import { excludedBy, type Scope, type Scoping } from '../labels/index.ts'
import type { CallSite, FilePath, SymbolId } from '../model.ts'
import { readCalleeSteps, type CalleeStep, type Store } from '../store/index.ts'
import { scopeTo } from './scope.ts'
import { noteCollisions, resolveSubject } from './subject.ts'
import { fileOf } from '../symbol-id.ts'

/**
 * Why a path stopped where it did.
 *
 * `depth` is the one value that means "there is more beyond here", which is why
 * it is named per path rather than counted once for the answer: the caller needs
 * to know *which* branch was cut, not how many were. It appears only when the
 * caller passed `--depth`, since nothing else bounds the walk.
 */
export type PathTerminus = 'leaf' | 'depth' | 'cycle'

/**
 * One step along a path: the symbol reached, and every call site that reaches it.
 *
 * The step's source is not stored — it is the previous step's `to`, or the
 * path's `root` for the first — because a field that repeats a fact is a field
 * that can disagree with it.
 */
export interface TraceStep {
  readonly to: SymbolId
  /** Every site realising this step, so a path never hides one. */
  readonly sites: readonly CallSite[]
}
// This coincides with the store's `CalleeStep` today and is still declared
// apart: it is the envelope's published schema, and a column the store wants
// must not appear in an answer because the two shared a type.

/** One walk outward from a root, and why it ended. */
export interface TracePath {
  readonly root: SymbolId
  /** Empty for a root that calls nothing, which is an answer rather than an absence. */
  readonly steps: readonly TraceStep[]
  readonly terminus: PathTerminus
}

/**
 * Every path out of the subject, sorted lexically.
 *
 * **The walk is unbounded unless the caller bounds it.** ADR 0006 owns that
 * rule, along with the measurement behind it and the revisit trigger, because it
 * is part of the renderer contract rather than a property of this walk.
 *
 * @param depth - Maximum steps per path; `null` walks until every path ends.
 */
export function trace(
  store: Store,
  context: AnswerContext,
  subject: string,
  limit: number | null,
  depth: number | null,
  scoping: Scoping,
): Envelope<readonly TracePath[]> {
  const resolved = resolveSubject(store, subject)
  const walked = walk(
    store,
    resolved.map((node) => node.id),
    depth,
    scoping,
  )
  const paths = walked.paths
  paths.sort((a, b) => compareSequences(sequenceOf(a), sequenceOf(b)))

  return answer(
    'trace',
    {
      subject,
      resolved: resolved.map((node) => node.id),
      limit,
      depth,
      scope: walked.scope,
    },
    noteCollisions(
      scopeTo(store, context, [
        ...resolved.map((node) => node.file),
        ...filesOf(paths),
      ]),
      resolved,
    ),
    paths,
  )
}

/** A path under construction, carrying the visited set its cycle check needs. */
interface Walk {
  readonly root: SymbolId
  readonly steps: readonly TraceStep[]
  /** Every symbol already on this path. Per path, so the walk enumerates simple paths. */
  readonly visited: ReadonlySet<SymbolId>
}

/**
 * Breadth-first from every root at once, one query per level.
 *
 * Cycles are detected against the path rather than against the whole walk, which
 * is what makes "path" mean the usual thing and what makes the result set finite.
 * A repeat is *reported*, not cut: the closing step is kept so the reader can see
 * which symbol closed the loop.
 *
 * The scope is applied **during** the walk rather than to its result, because a
 * path is not a thing a filter can be applied to afterwards: an excluded callee
 * hides everything beyond it, and a path that ran through one and was then
 * dropped would take honest steps down with it. The count is of the steps not
 * taken, which is what was withheld.
 */
function walk(
  store: Store,
  roots: readonly SymbolId[],
  depth: number | null,
  scoping: Scoping,
): { paths: TracePath[]; scope: Scope } {
  const finished: TracePath[] = []
  let excluded = 0
  let live: Walk[] = roots.map((root) => ({
    root,
    steps: [],
    visited: new Set([root]),
  }))

  while (live.length > 0) {
    const outgoing = readCalleeSteps(store, [...new Set(live.map(tailOf))])
    const next: Walk[] = []
    for (const path of live) {
      const reachable = outgoing.get(tailOf(path)) ?? []
      const callees = reachable.filter(
        (step) => !excludedBy(scoping.scope, scoping.labels, fileOf(step.to)),
      )
      excluded += reachable.length - callees.length
      const terminus = terminusOf(path, callees, depth)
      if (terminus !== null) {
        finished.push(finish(path, terminus))
        continue
      }
      for (const callee of callees) {
        const extended = extend(path, callee)
        if (path.visited.has(callee.to))
          finished.push(finish(extended, 'cycle'))
        else next.push(extended)
      }
    }
    live = next
  }
  return { paths: finished, scope: { ...scoping.scope, excluded } }
}

/** Why this path ends here, or `null` where it continues. */
function terminusOf(
  path: Walk,
  callees: readonly CalleeStep[],
  depth: number | null,
): PathTerminus | null {
  // A leaf is a leaf whether or not the bound had run out, so it is tested
  // first: reporting `depth` on a symbol that calls nothing would claim there is
  // more to see.
  if (callees.length === 0) return 'leaf'
  // Tested before extending, so the step that closes a cycle is never the one
  // that overruns the depth the caller asked for.
  if (depth !== null && path.steps.length >= depth) return 'depth'
  return null
}

/** The symbol a walk is currently standing on. */
const tailOf = (path: Walk): SymbolId => path.steps.at(-1)?.to ?? path.root

const extend = (path: Walk, step: CalleeStep): Walk => ({
  root: path.root,
  steps: [...path.steps, step],
  visited: new Set(path.visited).add(step.to),
})

const finish = (path: Walk, terminus: PathTerminus): TracePath => ({
  root: path.root,
  steps: path.steps,
  terminus,
})

/** ADR 0006's sort key for `trace`: the `SymbolId` sequence, lexically. */
const sequenceOf = (path: TracePath): readonly SymbolId[] => [
  path.root,
  ...path.steps.map((step) => step.to),
]

/**
 * Lexical over the sequences, with a prefix sorting before what extends it.
 *
 * Total without a tie-break, because the walk visits each callee once per path:
 * no two paths in one answer share a sequence.
 */
function compareSequences(
  a: readonly SymbolId[],
  b: readonly SymbolId[],
): number {
  for (let at = 0; at < Math.min(a.length, b.length); at += 1) {
    const left = a[at] ?? ''
    const right = b[at] ?? ''
    if (left !== right) return left < right ? -1 : 1
  }
  return a.length - b.length
}

/** Every file a path touched, for the envelope's conditions. */
const filesOf = (paths: readonly TracePath[]): FilePath[] =>
  paths.flatMap((path) =>
    path.steps.flatMap((step) => step.sites.map((site) => site.file)),
  )
