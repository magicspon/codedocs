/**
 * Folds a fallow report into an `Atlas`. Pure, so it is tested without the
 * fallow binary; `read-fallow.ts` does the running.
 */

import type { Atlas, FileHealth, FileScore, Link } from '../src/lib/atlas.ts'

/** Clone pairs in a large repo run to tens of thousands; the faintest add nothing visible. */
const MAX_CLONE_LINKS = 20_000

/** The parts of `fallow --format json` (dead-code + dupes + health) this reads. */
export interface FallowReport {
  readonly version: string
  readonly check: {
    readonly unused_files: readonly { readonly path: string }[]
    readonly unused_exports: readonly { readonly path: string }[]
    readonly circular_dependencies: readonly {
      readonly files: readonly string[]
    }[]
  }
  readonly dupes: {
    readonly clone_groups: readonly {
      readonly line_count: number
      readonly instances: readonly {
        readonly file: string
        readonly start_line: number
        readonly end_line: number
      }[]
    }[]
  }
  readonly health: {
    readonly file_scores?: readonly {
      readonly path: string
      readonly maintainability_index: number
      readonly complexity_density: number
      readonly total_cyclomatic: number
      readonly total_cognitive: number
      readonly crap_max: number
      readonly lines: number
    }[]
    readonly hotspots?: readonly {
      readonly path: string
      readonly score: number
      readonly commits: number
      readonly trend: string
    }[]
  }
}

/** fallow's trend words as a signed number a scene can blend between frames. */
const TREND: Record<string, number> = {
  cooling: -1,
  stable: 0,
  accelerating: 1,
}

/** Two decimals: enough to draw, and it keeps a vscode export small. */
const round = (n: number): number => Math.round(n * 100) / 100

/** Counts how often each path appears. */
function tally(paths: Iterable<string>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const p of paths) counts.set(p, (counts.get(p) ?? 0) + 1)
  return counts
}

/** Lines each file has inside clone groups. */
function duplicatedLines(report: FallowReport): Map<string, number> {
  const lines = new Map<string, number>()
  for (const group of report.dupes.clone_groups)
    for (const at of group.instances)
      lines.set(
        at.file,
        (lines.get(at.file) ?? 0) + at.end_line - at.start_line + 1,
      )
  return lines
}

/**
 * Links files that share a clone group. Each group is chained in path order
 * rather than joined pairwise: a group of 36 copies would otherwise add 630
 * links, while a chain of 35 still keeps every copy connected.
 */
function cloneLinks(
  report: FallowReport,
  index: ReadonlyMap<string, number>,
): Link[] {
  const weights = new Map<string, number>()
  for (const group of report.dupes.clone_groups) {
    const files = [
      ...new Set(
        group.instances
          .map((at) => index.get(at.file))
          .filter((i) => i !== undefined),
      ),
    ].sort((a, b) => a - b)
    for (let k = 1; k < files.length; k++) {
      const key = `${files[k - 1]},${files[k]}`
      weights.set(key, (weights.get(key) ?? 0) + group.line_count)
    }
  }
  return [...weights]
    .map(([key, w]): Link => {
      const [a, b] = key.split(',').map(Number)
      return [a!, b!, w]
    })
    .sort((x, y) => y[2] - x[2])
    .slice(0, MAX_CLONE_LINKS)
}

type RawScore = NonNullable<FallowReport['health']['file_scores']>[number]

function scoreOf(raw: RawScore): FileScore {
  return {
    maintainability: round(raw.maintainability_index),
    density: round(raw.complexity_density),
    cyclomatic: raw.total_cyclomatic,
    cognitive: raw.total_cognitive,
    crap: round(raw.crap_max),
  }
}

/** Every fallow finding, keyed by path, so each file is one lookup per kind. */
interface Lookups {
  readonly scores: ReadonlyMap<string, RawScore>
  readonly hotspots: ReadonlyMap<string, RawHotspot>
  readonly duplicated: ReadonlyMap<string, number>
  readonly cyclic: ReadonlySet<string>
  /** Absent when dead code is not trusted. */
  readonly dead?: {
    readonly files: ReadonlySet<string>
    readonly exports: ReadonlyMap<string, number>
  }
}

type RawHotspot = NonNullable<FallowReport['health']['hotspots']>[number]

function lookups(report: FallowReport, deadCode: boolean): Lookups {
  return {
    scores: new Map(report.health.file_scores?.map((s) => [s.path, s])),
    hotspots: new Map(report.health.hotspots?.map((h) => [h.path, h])),
    duplicated: duplicatedLines(report),
    cyclic: new Set(report.check.circular_dependencies.flatMap((c) => c.files)),
    ...(deadCode && {
      dead: {
        files: new Set(report.check.unused_files.map((f) => f.path)),
        exports: tally(report.check.unused_exports.map((e) => e.path)),
      },
    }),
  }
}

/** A file that is not a hotspot reads as cold and still. */
function hotspotOf(
  hot: RawHotspot | undefined,
): Pick<FileHealth, 'hotspot' | 'commits' | 'trend'> {
  if (!hot) return { hotspot: 0, commits: 0, trend: 0 }
  return {
    hotspot: round(hot.score),
    commits: hot.commits,
    trend: TREND[hot.trend] ?? 0,
  }
}

function deadOf(
  path: string,
  dead: Lookups['dead'],
): Pick<FileHealth, 'unused' | 'unusedExports'> {
  if (!dead) return {}
  return {
    unused: dead.files.has(path),
    unusedExports: dead.exports.get(path) ?? 0,
  }
}

function healthOf(path: string, at: Lookups): FileHealth {
  const score = at.scores.get(path)
  const lines = at.duplicated.get(path) ?? 0
  return {
    ...(score && { score: scoreOf(score) }),
    ...hotspotOf(at.hotspots.get(path)),
    // Groups can overlap, so the sum can pass the file's length.
    duplicated: Math.min(lines, score?.lines ?? lines),
    cyclic: at.cyclic.has(path),
    ...deadOf(path, at.dead),
  }
}

/**
 * Returns `atlas` with every file's `health`, the clone links and the
 * `fallow` stamp. `deadCode` says whether to trust the unused-code findings.
 */
export function withHealth(
  atlas: Atlas,
  report: FallowReport,
  deadCode: boolean,
): Atlas {
  const at = lookups(report, deadCode)
  const index = new Map(atlas.files.map((f, i) => [f.path, i]))
  return {
    ...atlas,
    files: atlas.files.map((file) => ({
      ...file,
      health: healthOf(file.path, at),
    })),
    fallow: { version: report.version, deadCode },
    clones: cloneLinks(report, index),
  }
}
