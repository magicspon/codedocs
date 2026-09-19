/**
 * Runs fallow over a repository for the art. fallow is optional: without it on
 * the PATH an export still works, it just carries no health readings.
 */

import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { churnAt } from './churn.ts'
import type { FallowReport } from './fallow-health.ts'

/** fallow's report on vscode runs to hundreds of MB before it is trimmed. */
const MAX_OUTPUT = 2 ** 30

/** A fallow run the art can use; small enough to cache once per commit. */
export interface FallowReading {
  readonly report: FallowReport
  /** Whether the repo has its own fallow config, which dead code needs. */
  readonly deadCode: boolean
}

function fallow(
  root: string,
  args: readonly string[],
): SpawnSyncReturns<string> {
  return spawnSync('fallow', [...args, '--root', root], {
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT,
    // Telemetry is opt-in and off by default; this keeps it off whatever the
    // machine's own setting, so an export never talks to anyone.
    env: { ...process.env, FALLOW_TELEMETRY: 'off' },
  })
}

/**
 * Keeps only what `withHealth` reads. The raw report carries fix actions and
 * code fragments per finding, which would make a cached frame many times larger.
 */
export function trimReport(raw: FallowReport): FallowReport {
  const { check, dupes, health } = raw
  return {
    version: raw.version,
    check: {
      unused_files: check.unused_files.map(({ path }) => ({ path })),
      unused_exports: check.unused_exports.map(({ path }) => ({ path })),
      circular_dependencies: check.circular_dependencies.map(({ files }) => ({
        files,
      })),
    },
    dupes: {
      clone_groups: dupes.clone_groups.map((g) => ({
        line_count: g.line_count,
        instances: g.instances.map(({ file, start_line, end_line }) => ({
          file,
          start_line,
          end_line,
        })),
      })),
    },
    health: {
      file_scores: health.file_scores?.map((s) => ({
        path: s.path,
        maintainability_index: s.maintainability_index,
        complexity_density: s.complexity_density,
        total_cyclomatic: s.total_cyclomatic,
        total_cognitive: s.total_cognitive,
        crap_max: s.crap_max,
        lines: s.lines,
      })),
      hotspots: health.hotspots?.map(({ path, score, commits, trend }) => ({
        path,
        score,
        commits,
        trend,
      })),
    },
  }
}

/**
 * Writes the history as of `root`'s HEAD to a temporary churn file, or returns
 * no arguments when `root` is not a git checkout, leaving fallow to its own.
 */
function churnArgs(root: string, scratch: string): string[] {
  try {
    const path = join(scratch, 'churn.json')
    writeFileSync(path, JSON.stringify(churnAt(root)))
    return ['--churn-file', path]
  } catch {
    return []
  }
}

/**
 * Runs dead-code, dupes and health in one pass over `root`, with hotspots
 * scored as of the checkout's HEAD. Returns `null`, with a warning, when
 * fallow is missing or fails; the export goes on without.
 */
export function readFallow(root: string): FallowReading | null {
  const scratch = mkdtempSync(join(tmpdir(), 'code-art-fallow-'))
  try {
    const run = fallow(root, [
      '--format',
      'json',
      '--quiet',
      ...churnArgs(root, scratch),
    ])
    if (run.error) {
      console.warn(`fallow: not run (${run.error.message}); no health readings`)
      return null
    }
    // Exit 1 only means "issues found"; 2 is a real failure.
    if (run.status !== 0 && run.status !== 1) {
      // With `--format json`, fallow reports its own errors on stdout.
      console.warn(
        `fallow: exited ${run.status}; no health readings\n${run.stdout.slice(0, 500)}`,
      )
      return null
    }
    // `config --path` exits 3 when no config file is found.
    const deadCode = fallow(root, ['config', '--path']).status === 0
    return {
      report: trimReport(JSON.parse(run.stdout) as FallowReport),
      deadCode,
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}
