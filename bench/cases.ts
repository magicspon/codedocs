/**
 * Reads the frozen cases from disk.
 *
 * `cases/*.json` is written once by `freeze-cases.ts` and then left alone, so a
 * benchmark run never depends on the network or on an issue being edited later.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BENCH } from './paths.ts'
import type { BenchCase } from './types.ts'

/** Every case on disk, optionally narrowed to the ids given. */
export function loadCases(only: string[] = []): BenchCase[] {
  return readdirSync(join(BENCH, 'cases'))
    .filter((f) => f.endsWith('.json'))
    .map(
      (f) =>
        JSON.parse(readFileSync(join(BENCH, 'cases', f), 'utf8')) as BenchCase,
    )
    .filter((c) => only.length === 0 || only.includes(c.id))
}

/** The same cases keyed by id, for reports that join records back to them. */
export function casesById(): Map<string, BenchCase> {
  return new Map(loadCases().map((bench) => [bench.id, bench]))
}
