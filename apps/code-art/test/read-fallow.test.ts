/**
 * Running fallow, against a stub binary on the PATH rather than a mocked
 * `spawnSync`: what is pinned is the contract with a real process — exit 1 is
 * "issues found" and still a reading, exit 2 is a failure, and a missing binary
 * leaves the export without health rather than stopping it.
 */

import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FallowReport } from '../scripts/fallow-health.ts'
import { readFallow } from '../scripts/read-fallow.ts'

/** The smallest report `trimReport` accepts. */
const REPORT: FallowReport = {
  version: '3.22.0',
  check: {
    unused_files: [{ path: 'a.ts' }],
    unused_exports: [],
    circular_dependencies: [],
  },
  dupes: { clone_groups: [] },
  health: {
    file_scores: [
      {
        path: 'a.ts',
        maintainability_index: 70,
        complexity_density: 0.1,
        total_cyclomatic: 4,
        total_cognitive: 3,
        crap_max: 6,
        lines: 20,
      },
    ],
    hotspots: [{ path: 'a.ts', score: 9, commits: 2, trend: 'stable' }],
  },
}

let bin: string
let root: string
let bare: string
let path: string | undefined

/** The arguments of the last non-`config` run, as the stub recorded them. */
const argsOf = (): string[] =>
  readFileSync(join(bin, 'args'), 'utf8').trim().split(' ')

/**
 * Writes a `fallow` on the PATH that answers `run` for an analysis run and
 * `config` for the config probe, recording the arguments it was given.
 */
function stubFallow(options: {
  stdout: string
  run: number
  config: number
}): void {
  const script = [
    '#!/bin/sh',
    `if [ "$1" = "config" ]; then exit ${options.config}; fi`,
    `printf '%s' "$*" > "${join(bin, 'args')}"`,
    `cat <<'JSON'\n${options.stdout}\nJSON`,
    `exit ${options.run}`,
  ].join('\n')
  const at = join(bin, 'fallow')
  writeFileSync(at, `${script}\n`)
  chmodSync(at, 0o755)
}

beforeEach(() => {
  bin = mkdtempSync(join(tmpdir(), 'code-art-fallow-bin-'))
  root = mkdtempSync(join(tmpdir(), 'code-art-fallow-root-'))
  bare = mkdtempSync(join(tmpdir(), 'code-art-fallow-bare-'))
  execFileSync('git', ['init', '-q'], { cwd: root, stdio: 'ignore' })
  execFileSync('git', ['config', 'user.email', 'f@example.com'], { cwd: root })
  execFileSync('git', ['config', 'user.name', 'Fixture'], { cwd: root })
  writeFileSync(join(root, 'a.ts'), 'export const a = 1\n')
  execFileSync('git', ['add', '-A'], { cwd: root, stdio: 'ignore' })
  execFileSync('git', ['commit', '-qm', 'first'], { cwd: root })
  // The stub takes precedence over any real fallow, and git stays reachable.
  path = process.env.PATH
  process.env.PATH = `${bin}:${path ?? ''}`
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  process.env.PATH = path
  vi.restoreAllMocks()
  for (const one of [bin, root, bare])
    rmSync(one, { recursive: true, force: true })
})

describe('readFallow', () => {
  it('trims the report and hands fallow the frame’s own churn', () => {
    // Exit 1: fallow found issues, which is the ordinary case, not a failure.
    stubFallow({ stdout: JSON.stringify(REPORT), run: 1, config: 0 })
    const reading = readFallow(root)
    expect(reading?.deadCode).toBe(true)
    expect(reading?.report.check.unused_files).toEqual([{ path: 'a.ts' }])
    expect(reading?.report.health.hotspots?.[0]?.commits).toBe(2)
    const args = argsOf()
    expect(args).toContain('--churn-file')
    expect(args.slice(-2)).toEqual(['--root', root])
  })

  it('reads no dead code when the repo has no fallow config', () => {
    // `config --path` exits 3 when it finds none.
    stubFallow({ stdout: JSON.stringify(REPORT), run: 0, config: 3 })
    expect(readFallow(root)?.deadCode).toBe(false)
  })

  it('goes on without churn when the root is not a checkout', () => {
    stubFallow({ stdout: JSON.stringify(REPORT), run: 0, config: 0 })
    expect(readFallow(bare)).not.toBeNull()
    expect(argsOf()).not.toContain('--churn-file')
  })

  it('warns and reads nothing when fallow fails', () => {
    stubFallow({ stdout: 'fallow: broken', run: 2, config: 0 })
    expect(readFallow(root)).toBeNull()
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('exited 2'),
    )
  })

  it('warns and reads nothing when fallow is not installed', () => {
    // Nothing on the PATH at all: `spawnSync` answers with an error, not a status.
    process.env.PATH = bin
    expect(readFallow(root)).toBeNull()
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('not run'),
    )
  })

  it('leaves no scratch directory behind', () => {
    stubFallow({ stdout: JSON.stringify(REPORT), run: 0, config: 0 })
    readFallow(root)
    const churn = argsOf()[argsOf().indexOf('--churn-file') + 1]
    expect(churn).toBeDefined()
    expect(existsSync(churn!)).toBe(false)
  })
})
