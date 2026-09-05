/**
 * The difficulty levels, and the names the report prints for them.
 *
 * A level says how much of the repository an agent must understand to answer,
 * never how large the eventual patch was. The rubric is `bench/DIFFICULTY.md`;
 * the one-liners here are its headings, short enough for a table.
 */

import type { BenchCase, DifficultyLevel } from '../core/types.ts'

/** Every level, in order, with the heading the report prints above its cases. */
export const LEVELS: ReadonlyArray<{
  level: DifficultyLevel
  name: string
}> = [
  { level: 1, name: 'local — the report points at the code' },
  { level: 2, name: 'one subsystem, no address' },
  { level: 3, name: 'across layers' },
  { level: 4, name: 'a relationship, not a location' },
]

/** The heading for one level. */
export function levelName(level: DifficultyLevel): string {
  return LEVELS.find((l) => l.level === level)?.name ?? 'unnamed'
}

/**
 * The level a result belongs under, or null when no case file explains it.
 *
 * A record whose case has been removed still has numbers in it, so the report
 * keeps it and groups it as unclassified rather than dropping it silently.
 */
export function levelOf(bench: BenchCase | undefined): DifficultyLevel | null {
  return bench?.difficulty.level ?? null
}
