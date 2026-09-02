/**
 * `impact` — what a change could reach.
 *
 * ADR 0012 makes this **the only composed operation in the product**, and the
 * only one of Phase 5's three that survived: `review` was `fallow`'s work plus
 * two other operations printed together, and `plan` was a ranking. `impact`
 * survives because it is the one answer that needs more than one part of the
 * index at once — a [[Baseline]] to say what changed, [[Continuity]] to say
 * that a moved symbol is the same symbol, and a reachability walk to say what
 * that reaches. No combination of the other operations produces it.
 *
 * Three rules from ADR 0008 shape what it will not do:
 *
 * **A change in fidelity is never a finding.** A file that was `syntactic` then
 * and is `typed` now has not changed; the analysis has. Those files leave the
 * comparison and are named as blind spots, **per project**, because a
 * fingerprint change in one of cal.com's 34 must not silence the other 33.
 *
 * **A missing baseline degrades the answer, it does not block it.** The edits
 * still come from git, and the walk still runs; what is lost is the fidelity
 * comparison and continuity. So it is a blind spot at exit 0, never exit 2.
 *
 * **Substitution is part of the request, not a limitation of the answer.** Which
 * baseline was used, which was asked for, and how far apart they are ride in the
 * envelope beside the scope — never as a blind spot, because codedocs knows
 * exactly which index it compared against.
 */

import {
  chooseBaseline,
  openBaseline,
  type BaselineChoice,
} from '../baseline/index.ts'
import {
  answer,
  type AnswerContext,
  type BlindSpot,
  type Envelope,
} from '../envelope.ts'
import { changedFiles, type Change } from './changes.ts'
import { applyScope, type Scoping } from '../labels/index.ts'
import type { ReferenceKind, SymbolId, SymbolNode } from '../model.ts'
import {
  readCallersOf,
  readReferencesTo,
  readSymbols,
  type Store,
} from '../store/index.ts'
import { scopeTo } from './scope.ts'
import { fileOf } from '../symbol-id.ts'

/** How a symbol was reached from a change. */
export type ImpactKind = 'changed' | 'calls' | ReferenceKind

/** ADR 0006's result unit for `impact`: one symbol a change could reach. */
export interface ImpactedSymbol {
  readonly id: SymbolId
  readonly file: string
  /** Steps from the change: `0` is a symbol the change itself touched. */
  readonly depth: number
  /** How it was first reached — `changed` for a seed, else the edge kind. */
  readonly through: ImpactKind
  /** The symbol it was reached from, or `null` for a seed. */
  readonly from: SymbolId | null
}

/** How `impact` was asked to run. */
export interface ImpactOptions {
  readonly root: string
  /** What `--base` named, or `null` for the merge base with the default branch. */
  readonly base: string | null
  readonly scoping: Scoping
}

/**
 * Which baseline answered, as the envelope publishes it.
 *
 * The stored baseline's own path is left out: it is absolute, so it names the
 * machine rather than the repository, and every other path an answer carries is
 * repository-relative. The commit is the baseline's identity in any case.
 */
export interface BaselineUsed {
  readonly commit: string | null
  readonly committedAt: string | null
  readonly requested: string | null
  /** Signed: positive where the baseline used is newer than the one asked for. */
  readonly distance: number | null
  /** Why no baseline is in use, or `null` where one is. */
  readonly absent: string | null
}

/** An `impact` answer: the symbols reached, and the comparison they came from. */
export type ImpactEnvelope = Envelope<readonly ImpactedSymbol[]> & {
  /** Which baseline was used, which was asked for, and how far apart they are. */
  readonly baseline: BaselineUsed
  /** The files the comparison found different, before the walk. */
  readonly changes: readonly Change[]
}

/** The published half of a choice, without the path that names the machine. */
const published = (choice: BaselineChoice): BaselineUsed => ({
  commit: choice.used?.commit ?? null,
  committedAt: choice.used?.committedAt ?? null,
  requested: choice.requested,
  distance: choice.distance,
  absent: choice.absent,
})

/**
 * Every symbol a change could reach, walked inward through the index's edges.
 *
 * @param depth - Steps from a changed symbol; `null` walks until nothing new is
 * reached. Unbounded by default for the reason ADR 0006 gives `trace`: a bound
 * that changes the shape of an answer must be the caller's.
 */
export function impact(
  store: Store,
  context: AnswerContext,
  limit: number | null,
  depth: number | null,
  options: ImpactOptions,
): ImpactEnvelope {
  const choice = chooseBaseline(options.root, options.base)
  const baseline =
    choice.used === null ? null : openBaseline(options.root, choice.used.path)
  try {
    const changes = changedFiles(options.root, store, baseline, choice)
    const seeds = seedSymbols(store, changes)
    const reached = walk(store, seeds, depth)
    const { kept, scope } = applyScope(
      options.scoping,
      reached,
      (one) => one.file,
    )

    return {
      ...answer(
        'impact',
        {
          subject: options.base,
          resolved: choice.used === null ? [] : [choice.used.commit],
          limit,
          depth,
          scope,
        },
        {
          ...scopeTo(
            store,
            context,
            changes.map((change) => change.file),
          ),
          blindSpots: [...context.blindSpots, ...spotsFor(choice, changes)],
        },
        kept,
      ),
      baseline: published(choice),
      changes,
    }
  } finally {
    baseline?.close()
  }
}

/**
 * The symbols a change touched, which is where the walk starts.
 *
 * A file's symbols rather than a per-symbol diff: [[Impact]] is "the symbols a
 * working tree's **edits** reach", and an edit is a file. A per-symbol seed set
 * would need a per-symbol signature the index does not hold, and would still
 * have to fall back to the file for anything it could not match.
 */
function seedSymbols(store: Store, changes: readonly Change[]): SymbolNode[] {
  const touched = new Set(
    changes
      .filter((change) => change.kind !== 'removed' && !change.excluded)
      .map((change) => change.file),
  )
  return readSymbols(store).filter((node) => touched.has(node.file))
}

/**
 * Walk inward from the seeds, one level at a time.
 *
 * Inward rather than outward: `trace` answers "what does this call", and this
 * answers "what would notice if this changed". Both call edges and references
 * are followed, because a changed type reaches everything that *names* it — the
 * whole reason `references` had to exist before this operation could.
 */
function walk(
  store: Store,
  seeds: readonly SymbolNode[],
  depth: number | null,
): ImpactedSymbol[] {
  const found = new Map<SymbolId, ImpactedSymbol>()
  for (const seed of seeds) {
    found.set(seed.id, {
      id: seed.id,
      file: seed.file,
      depth: 0,
      through: 'changed',
      from: null,
    })
  }

  let live = seeds.map((seed) => seed.id)
  let level = 0
  while (live.length > 0 && (depth === null || level < depth)) {
    level += 1
    const next: SymbolId[] = []
    for (const id of live) {
      for (const { source, kind } of reaching(store, id)) {
        // First reach wins, which makes `depth` the shortest distance from a
        // change rather than whichever path the walk happened to take last.
        if (found.has(source)) continue
        found.set(source, {
          id: source,
          file: fileOf(source),
          depth: level,
          through: kind,
          from: id,
        })
        next.push(source)
      }
    }
    live = next
  }

  return [...found.values()].sort(
    (a, b) => a.depth - b.depth || compare(a.id, b.id),
  )
}

/** Everything that calls or names one symbol, with the kind that reached it. */
function reaching(
  store: Store,
  id: SymbolId,
): { source: SymbolId; kind: ImpactKind }[] {
  return [
    ...readCallersOf(store, id).map((edge) => ({
      source: edge.from,
      kind: 'calls' as const,
    })),
    ...readReferencesTo(store, id).map((edge) => ({
      source: edge.from,
      kind: edge.kind,
    })),
  ]
}

/**
 * What this answer could not see, which is never the substitution.
 *
 * Two kinds only: a baseline that is absent, and a file whose fidelity moved
 * between the two snapshots. Both are things codedocs could not compare; which
 * baseline it used is a fact about the request.
 */
function spotsFor(
  choice: BaselineChoice,
  changes: readonly Change[],
): BlindSpot[] {
  const spots: BlindSpot[] = []
  if (choice.absent !== null) {
    spots.push({ subject: 'baseline', reason: choice.absent })
  }
  for (const change of changes) {
    if (change.excluded === null) continue
    spots.push({ subject: change.file, reason: change.excluded })
  }
  return spots
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
