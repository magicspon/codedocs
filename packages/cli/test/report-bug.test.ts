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

import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
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
    expect(report.reproduction.resolved).toEqual([
      'codedocs npm codedocs-cli-fixture . `src/checkout.ts`/checkout().',
    ])
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

describe('a repository with specifiers it could not resolve', () => {
  let messy: string
  let messyOut: string

  beforeAll(() => {
    messy = mkdtempSync(join(tmpdir(), 'codedocs-report-messy-'))
    cpSync(fixture, messy, { recursive: true })
    messyOut = join(messy, 'report.json')
    writeFileSync(
      join(messy, 'package.json'),
      JSON.stringify({
        name: 'messy-fixture',
        private: true,
        dependencies: { 'left-pad': '^1.0.0' },
        // A range that is not a string is not a declared version, and a
        // manifest is somebody else's file: it is read, never trusted.
        devDependencies: { typescript: '^7.0.0', broken: 12 },
      }),
    )
    // Two sites of one specifier, and a second specifier with another cause —
    // which is what makes the per-specifier fold worth having.
    writeFileSync(
      join(messy, 'src', 'one.ts'),
      "import 'left-pad'\nimport './nowhere.ts'\nexport const one = 1\n",
    )
    writeFileSync(
      join(messy, 'src', 'two.ts'),
      "import 'left-pad'\nexport const two = 2\n",
    )
  })

  afterAll(() => {
    rmSync(messy, { recursive: true, force: true })
  })

  const reportOn = (...flags: string[]): Record<string, unknown> => {
    run([
      'report-bug',
      '--no-color',
      ...flags,
      '--out',
      messyOut,
      '--',
      'symbol',
      '*',
      '--cwd',
      messy,
    ])
    return JSON.parse(readFileSync(messyOut, 'utf8')) as Record<string, unknown>
  }

  it('reports one row per distinct specifier, with the sites it stands for', () => {
    const report = reportOn('--with-repository') as unknown as {
      index: { specifiers: { specifier: string; sites: number }[] }
      dependencies: Record<string, string>
    }
    const rows = report.index.specifiers
    expect(rows.map((one) => one.specifier)).toEqual([
      './nowhere.ts',
      'left-pad',
    ])
    expect(rows.find((one) => one.specifier === 'left-pad')?.sites).toBe(2)

    // Both dependency blocks are read, and a range that is not a string is not
    // a declared version.
    expect(report.dependencies).toEqual({
      'left-pad': '^1.0.0',
      typescript: '^7.0.0',
    })
  })

  it('counts what it carries, and counts nothing in the default shape', () => {
    type Carried = {
      carries: {
        moduleSpecifiers: number
        paths: number
        symbolNames: number
        blindSpotReasons: number
      }
    }
    const included = reportOn('--with-repository') as unknown as Carried
    expect(included.carries.moduleSpecifiers).toBeGreaterThan(0)
    expect(included.carries.paths).toBeGreaterThan(0)
    expect(included.carries.blindSpotReasons).toBeGreaterThan(0)

    const excluded = reportOn() as unknown as Carried
    // The reasons are codedocs' own words and stay; everything that names the
    // repository is counted at zero because none of it is there.
    expect(excluded.carries.blindSpotReasons).toBe(
      included.carries.blindSpotReasons,
    )
    expect(excluded.carries.moduleSpecifiers).toBe(0)
    expect(excluded.carries.paths).toBe(0)
    expect(excluded.carries.symbolNames).toBe(0)
  })
})

describe('a repository whose manifest cannot be read', () => {
  it('reports no package manager and no dependencies, rather than failing', () => {
    const bare = mkdtempSync(join(tmpdir(), 'codedocs-report-bare-'))
    const bareOut = join(bare, 'report.json')
    try {
      cpSync(fixture, bare, { recursive: true })
      // No `package.json` at all.
      run([
        'report-bug',
        '--no-color',
        '--with-repository',
        '--out',
        bareOut,
        '--',
        'symbol',
        '*',
        '--cwd',
        bare,
      ])
      const absent = JSON.parse(readFileSync(bareOut, 'utf8')) as unknown as {
        machine: { packageManager: { name: string | null } }
        dependencies: Record<string, string>
      }
      expect(absent.machine.packageManager.name).toBeNull()
      expect(absent.dependencies).toEqual({})

      // And one that is there and is not JSON.
      writeFileSync(join(bare, 'package.json'), '{ not json\n')
      run([
        'report-bug',
        '--no-color',
        '--with-repository',
        '--out',
        bareOut,
        '--',
        'symbol',
        '*',
        '--cwd',
        bare,
      ])
      const unreadable = JSON.parse(
        readFileSync(bareOut, 'utf8'),
      ) as unknown as { dependencies: Record<string, string> }
      expect(unreadable.dependencies).toEqual({})
    } finally {
      rmSync(bare, { recursive: true, force: true })
    }
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
    expect(envelope.schemaVersion).toBe(4)
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
    // `--out` is shared with `docs draft` (ADR 0013), so the sentence names
    // every operation that takes it — the point is that `symbol` is not one.
    const refused = run(['symbol', '*', '--out', out, '--cwd', root]).stderr
    expect(refused).toContain('`report-bug`')
    expect(refused).toContain('not `symbol`')
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
