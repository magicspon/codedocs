/**
 * `symbol <pattern>` — the resolver. Glob patterns belong to it alone; every
 * other operation takes a subject.
 *
 * There is no ranking. Ranking is a judgement, so PRD §27 would make it
 * inferred, and an inferred ordering cannot also be the determinism guarantee.
 * That is most of what PRD §20's `search` meant, and why `search` is gone.
 *
 * ADR 0014: several patterns may be given at once, and `result` is one entry
 * per pattern, keyed the same way whether one was given or many.
 */

import {
  batchedAnswer,
  type AnswerContext,
  type BatchedEnvelope,
} from '../envelope.ts'
import { applyScope, type Scoping } from '../labels/index.ts'
import type { SymbolNode } from '../model.ts'
import { readSymbols, type Store } from '../store/index.ts'
import { scopeTo } from './scope.ts'

/** Translate a glob into an anchored regular expression. */
function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replaceAll(/[.+^${}()|[\]\\]/g, String.raw`\$&`)
  return new RegExp(`^${escaped.replaceAll('*', '.*').replaceAll('?', '.')}$`)
}

/**
 * Every symbol whose name or qualified name matches each pattern, one entry
 * per pattern.
 *
 * @param patterns - Globs, each matched against both the declared and
 * qualified name.
 */
export function symbol(
  store: Store,
  context: AnswerContext,
  patterns: readonly string[],
  limit: number | null,
  scoping: Scoping,
): BatchedEnvelope<readonly SymbolNode[]> {
  const entries = patterns.map((pattern) => {
    const matcher = globToRegExp(pattern)
    const found = readSymbols(store).filter(
      (node) => matcher.test(node.name) || matcher.test(node.qualified),
    )
    // A symbol does not inherit its file's labels; the scope joins to the file
    // it is declared in, which its `SymbolId` already names.
    const { kept: matches, scope } = applyScope(
      scoping,
      found,
      (node) => node.file,
    )
    const subjectContext = scopeTo(
      store,
      context,
      matches.map((node) => node.file),
    )
    return {
      subject: pattern,
      resolved: matches.map((node) => node.id),
      excluded: scope.excluded,
      blindSpots: subjectContext.blindSpots,
      conditions: subjectContext.conditions,
      items: matches,
    }
  })
  return batchedAnswer(
    'symbol',
    context.snapshot,
    limit,
    scoping.scope,
    entries,
  )
}
