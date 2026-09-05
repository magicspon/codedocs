/**
 * Reads the frozen cases from disk.
 *
 * `prospects/*.json` is written once by `freeze-cases.ts` and then left alone,
 * so a benchmark run never depends on the network or on an issue being edited
 * later.
 *
 * A prospect is a case that has been researched and frozen. A *case* is a
 * prospect that is actually being run — `active.ts` says which, and why the
 * running set is deliberately smaller than the pool.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ACTIVE } from './active.ts'
import { PROSPECTS } from '../core/paths.ts'
import type { BenchCase } from '../core/types.ts'

/** Every researched case on disk, run or not, in id order. */
export function loadProspects(): BenchCase[] {
  return readdirSync(PROSPECTS)
    .filter((f) => f.endsWith('.json'))
    .map(
      (f) => JSON.parse(readFileSync(join(PROSPECTS, f), 'utf8')) as BenchCase,
    )
}

/**
 * The cases in the running set, optionally narrowed further to the ids given.
 *
 * Ordered as `ACTIVE` lists them rather than as the directory does, so the pool
 * reads level 1 first — the order the seeds define and the README documents.
 * An id in `ACTIVE` with no prospect behind it is a mistake worth stopping for:
 * silently running one fewer case than was asked for is how a set ends up
 * smaller than the write-up claims.
 */
export function loadCases(only: string[] = []): BenchCase[] {
  const byId = new Map(loadProspects().map((bench) => [bench.id, bench]))
  return ACTIVE.filter((id) => only.length === 0 || only.includes(id)).map(
    (id) => {
      const bench = byId.get(id)
      if (!bench) {
        throw new Error(
          `active.ts names case ${id}, and bench/prospects/${id}.json does not exist`,
        )
      }
      return bench
    },
  )
}

/** The same cases keyed by id, for reports that join records back to them. */
export function casesById(): Map<string, BenchCase> {
  return new Map(loadCases().map((bench) => [bench.id, bench]))
}
