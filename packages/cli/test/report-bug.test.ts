/**
 * `report-bug`, held to the rule that makes it safe rather than to a happy path.
 *
 * ADR 0011's promise is one sentence — a fact about codedocs or the machine is
 * in the default report, and a fact that names the user's code is behind
 * `--with-repository` — and it is worth nothing unless something checks it
 * against the bytes that actually land in the file. So the default shape is
 * asserted by searching the file for the repository it was produced from, not by
 * listing the keys someone remembered to leave out.
 */

import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { run } from '../src/main.ts'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = join(here, '..', '..', 'core', 'test', 'fixtures', 'basic')
let root: string
let out: string

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'codedocs-report-'))
  cpSync(fixture, root, { recursive: true })
  cpSync(join(here, 'package.fixture.json'), join(root, 'package.json'))
  out = join(root, 'report.json')
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

/**
 * Reproduce one command, always to a named file.
 *
 * `--out` on every call on purpose: the default path is the directory the test
 * process is standing in, which is this repository, and a test that writes into
 * it would be doing the one thing ADR 0011 says codedocs never does elsewhere.
 */
const reproduce = (...argv: string[]): ReturnType<typeof run> =>
  run(['report-bug', '--no-color', '--out', out, '--', ...argv, '--cwd', root])

/** The report as written, which is the artefact that travels. */
const written = (): Record<string, unknown> =>
  JSON.parse(readFileSync(out, 'utf8')) as Record<string, unknown>

describe('the operation', () => {
  it('writes a report and exits 0, whatever the reproduction did', () => {
    // The re-run's exit code is a field. Propagating it would make `report-bug`
    // return 1 exactly when the bug reproduced.
    const result = reproduce('symbol', 'nope', '--limit', 'lots')
    expect(result.code).toBe(0)

    const report = written() as unknown as {
      reproduction: { exitCode: number; error: { code: string } }
    }
    expect(report.reproduction.exitCode).toBe(2)
    expect(report.reproduction.error.code).toBe('limit-invalid')
  })

  it('reports the index the failing command ran against', () => {
    reproduce('symbol', '*')
    const report = written() as unknown as {
      index: { projects: number; symbols: number }
    }
    expect(report.index.projects).toBe(1)
    expect(report.index.symbols).toBeGreaterThan(0)
  })

  it('carries the machine, which is why it is exempt from byte-identical output', () => {
    // ADR 0006's reproducibility rule is conditioned on one machine and one
    // fingerprint. This payload holds a Node version, an OS and a duration by
    // design, so the fixtures test must not assert it.
    reproduce('symbol', '*')
    const report = written() as unknown as {
      machine: { node: string; platform: string }
      reproduction: { durationMs: number }
    }
    expect(report.machine.node).toBe(process.version)
    expect(report.machine.platform).toBe(process.platform)
    expect(report.reproduction.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('overwrites the file rather than accumulating reports', () => {
    reproduce('symbol', '*')
    const first = readFileSync(out, 'utf8')
    reproduce('callers', 'charge')
    expect(readFileSync(out, 'utf8')).not.toBe(first)
    // One document, not two appended.
    expect(() => JSON.parse(readFileSync(out, 'utf8'))).not.toThrow()
  })

  it('writes to ./codedocs-report.json when told nowhere else', () => {
    const standing = process.cwd()
    process.chdir(root)
    try {
      const result = run(['report-bug', '--no-color', '--', 'symbol', '*'])
      expect(result.code).toBe(0)
      expect(existsSync(join(root, 'codedocs-report.json'))).toBe(true)
      // Never inside `.codedocs/`, which is invisible to `git status` and
      // documented as safe to delete — both fatal for a file meant to be found.
      expect(existsSync(join(root, '.codedocs', 'codedocs-report.json'))).toBe(
        false,
      )
      expect(result.stdout).toContain('codedocs-report.json')
    } finally {
      process.chdir(standing)
    }
  })

  it('cannot answer when it cannot write, and never reaches 1', () => {
    const result = run([
      'report-bug',
      '--no-color',
      '--out',
      join(root, 'no-such-directory', 'report.json'),
      '--',
      'symbol',
      '*',
      '--cwd',
      root,
    ])
    expect(result.code).toBe(2)
    expect(result.stderr).toContain('report-unwritable')
  })

  it('refuses to reproduce itself, rather than writing two reports over one path', () => {
    const result = run([
      'report-bug',
      '--no-color',
      '--out',
      out,
      '--',
      'report-bug',
      '--',
      'symbol',
      '*',
    ])
    expect(result.code).toBe(2)
    expect(result.stderr).toContain('cannot reproduce itself')
  })

  it('needs its command after `--`, and says where', () => {
    expect(run(['report-bug', 'symbol']).stderr).toContain(
      'its command goes after `--`',
    )
    expect(run(['report-bug']).stderr).toContain('after `--`')
  })
})

describe('the default shape', () => {
  it('names nothing in the repository it was produced from', () => {
    reproduce('trace', 'checkout')
    const text = readFileSync(out, 'utf8')

    // The three things a pasted report must not carry: where the repository is,
    // what its files are called, and what its symbols are called.
    expect(text).not.toContain(root)
    expect(text).not.toContain('src/checkout.ts')
    expect(text).not.toContain('#checkout')
    expect(written()['carries']).toEqual({
      blindSpotReasons: 0,
      paths: 0,
      symbolNames: 0,
      moduleSpecifiers: 0,
    })
  })

  it('leaves the repository fields out rather than emptying them', () => {
    // An absent key cannot be written by accident; a key holding `null` is one
    // refactor away from holding the fact again.
    reproduce('trace', 'checkout')
    const report = written() as unknown as {
      repositoryFacts: string
      reproduction: Record<string, unknown>
      index: Record<string, unknown>
      config: Record<string, unknown>
      dependencies?: unknown
    }
    expect(report.repositoryFacts).toBe('excluded')
    for (const key of ['command', 'resolved', 'commit', 'conditions']) {
      expect(report.reproduction).not.toHaveProperty(key)
    }
    expect(report.index).not.toHaveProperty('specifiers')
    expect(report.index).not.toHaveProperty('environment')
    expect(report.config).not.toHaveProperty('values')
    expect(report).not.toHaveProperty('dependencies')
  })

  it('keeps the error code and drops its parameters', () => {
    // The code is the classification; the parameters are the half that
    // interpolates whatever the user typed.
    reproduce('symbol', '*', '--depth', '2')
    const error = (
      written() as unknown as {
        reproduction: { error: Record<string, unknown> }
      }
    ).reproduction.error
    expect(error['code']).toBe('depth-unsupported')
    expect(error).not.toHaveProperty('params')
  })

  it('says which config keys are set without saying what they are set to', () => {
    const config = join(root, 'codedocs.jsonc')
    try {
      // Wrong on purpose: a config that will not parse is one of the likelier
      // things a bug report is about, and the report has to survive it.
      cpSync(join(here, 'package.fixture.json'), config)
      reproduce('symbol', '*')
      const report = written() as unknown as {
        config: { present: boolean; keys: string[] }
      }
      expect(report.config.present).toBe(true)
      expect(report.config.keys).toEqual(['name', 'private'])
      expect(readFileSync(out, 'utf8')).not.toContain('codedocs-cli-fixture')
    } finally {
      rmSync(config, { force: true })
    }
  })

  it('tells the user, in the file and on the terminal, what it did not include', () => {
    const result = reproduce('symbol', '*')
    expect(result.stdout).toContain(out)
    expect(result.stdout).toContain('excluded repository facts')
    expect(result.stdout).toContain('0 paths')
    // One line naming the flag, and no prompt: the default is already the safe
    // shape, and a prompt over a safe default teaches people to dismiss prompts.
    expect(result.stdout).toContain('--with-repository')
    expect(written()['contains']).toContain('no file paths')
  })
})

describe('--with-repository', () => {
  const withRepository = (...argv: string[]): ReturnType<typeof run> =>
    run([
      'report-bug',
      '--no-color',
      '--with-repository',
      '--out',
      out,
      '--',
      ...argv,
      '--cwd',
      root,
    ])

  it('adds the facts that name the code, and says so', () => {
    const result = withRepository('trace', 'checkout')
    const report = written() as unknown as {
      repositoryFacts: string
      reproduction: {
        command: string[]
        resolved: string[]
        conditions: { project: string }[]
      }
      index: { environment: { project: string }[] }
      dependencies: Record<string, string>
    }
    expect(report.repositoryFacts).toBe('included')
    expect(report.reproduction.command).toContain('checkout')
    expect(report.reproduction.resolved).toEqual(['src/checkout.ts#checkout'])
    expect(report.reproduction.conditions[0]?.project).toBe('tsconfig.json')
    expect(report.index.environment[0]?.project).toBe('tsconfig.json')
    expect(report).toHaveProperty('dependencies')
    // The terminal says the shape changed, and stops offering the flag.
    expect(result.stdout).toContain('included repository facts')
    expect(result.stdout).not.toContain('--with-repository adds')
  })

  it('keeps the error parameters, for the reader who has the repository open', () => {
    withRepository('symbol', '*', '--limit', 'lots')
    const error = (
      written() as unknown as {
        reproduction: { error: { code: string; params: { value: string } } }
      }
    ).reproduction.error
    expect(error.code).toBe('limit-invalid')
    expect(error.params.value).toBe('lots')
  })
})

describe('--out -', () => {
  it('puts the report on stdout and writes no file', () => {
    const before = readFileSync(out, 'utf8')
    const result = run([
      'report-bug',
      '--no-color',
      '--out',
      '-',
      '--',
      'symbol',
      '*',
      '--cwd',
      root,
    ])
    expect(result.code).toBe(0)
    expect(
      (JSON.parse(result.stdout) as { repositoryFacts: string })
        .repositoryFacts,
    ).toBe('excluded')
    // The disclosure moves to stderr rather than into the bytes being piped.
    expect(result.stderr).toContain('wrote the report to stdout')
    expect(readFileSync(out, 'utf8')).toBe(before)
  })

  it('answers with the envelope under --json, report and all', () => {
    const result = run([
      'report-bug',
      '--json',
      '--out',
      '-',
      '--',
      'symbol',
      '*',
      '--cwd',
      root,
    ])
    const envelope = JSON.parse(result.stdout) as {
      operation: string
      schemaVersion: number
      budget: { returned: number }
      snapshot: { commit: string | null }
      conditions: unknown[]
      result: { repositoryFacts: string }
    }
    expect(envelope.operation).toBe('report-bug')
    expect(envelope.schemaVersion).toBe(3)
    expect(envelope.result.repositoryFacts).toBe('excluded')
    // Its own envelope says nothing about the repository either: this answer is
    // a file, and every honesty field it could fill is a fact the report has
    // already sorted by the rule.
    expect(envelope.snapshot.commit).toBeNull()
    expect(envelope.conditions).toEqual([])
    expect(envelope.budget.returned).toBe(1)
    expect(result.stderr).toBe('')
  })
})

describe('the flags it adds', () => {
  it('are refused on every other operation', () => {
    expect(run(['symbol', '*', '--out', out, '--cwd', root]).stderr).toContain(
      '--out applies to `report-bug`',
    )
    expect(
      run(['callers', 'charge', '--with-repository', '--cwd', root]).stderr,
    ).toContain('--with-repository applies to `report-bug`')
  })

  it('refuses `--limit`, which has no result unit to count here', () => {
    // A report is one object. A flag silently dropped reads as a flag applied.
    const result = run(['report-bug', '--limit', '3', '--', 'symbol', '*'])
    expect(result.code).toBe(2)
    expect(result.stderr).toContain('--limit does not apply')
  })
})
