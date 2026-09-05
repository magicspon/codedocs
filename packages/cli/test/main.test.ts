/**
 * The CLI binding, exercised end to end.
 *
 * `run` returns rather than prints, so these are the same assertions an MCP
 * binding will need: the envelope carries the honesty fields whatever the
 * operation, and the exit code says "answered" or "could not answer" without a
 * caller having to parse the text.
 */

import {
  appendFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

// cspell:ignore exlucde — a deliberate typo; refusing it is the point

import { run } from '../src/main.ts'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = join(here, '..', '..', 'core', 'test', 'fixtures', 'basic')
let root: string

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'codedocs-cli-'))
  cpSync(fixture, root, { recursive: true })
  cpSync(join(here, 'package.fixture.json'), join(root, 'package.json'))
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

const invoke = (...args: string[]): ReturnType<typeof run> =>
  run([...args, '--cwd', root, '--no-color'])

describe('argument handling', () => {
  it('prints usage and cannot answer when given nothing', () => {
    const result = run([])
    expect(result.code).toBe(2)
    expect(result.stderr).toContain('Usage:')
  })

  it('rejects an unknown operation rather than guessing', () => {
    expect(run(['explain', 'X']).code).toBe(2)
  })

  it('rejects a subject-less callers', () => {
    expect(run(['callers']).stderr).toContain('needs a subject')
  })

  it('rejects a limit that is not a non-negative integer', () => {
    expect(invoke('symbol', '*', '--limit', 'lots').code).toBe(2)
  })

  it('refuses `--depth` on an operation that has no depth', () => {
    // Ignoring it would let `callers --depth 2` read as a bounded walk.
    const result = invoke('callers', 'charge', '--depth', '2')
    expect(result.code).toBe(2)
    expect(result.stderr).toContain('--depth applies to `trace`')
  })
})

/** One entry of a batched envelope's `result`, which every test here expects. */
interface BatchEntry {
  readonly subject: string
  readonly resolved: readonly string[]
  readonly budget: { truncated: boolean; returned: number; available: number }
  readonly excluded: number
  readonly blindSpots: readonly unknown[]
  readonly result: unknown
}

const entryOf = (stdout: string): BatchEntry => {
  const envelope = JSON.parse(stdout) as { result: BatchEntry[] }
  const found = envelope.result[0]
  if (found === undefined) throw new Error('answered with no entry')
  return found
}

describe('the machine renderer', () => {
  it('answers with the envelope every operation owes', () => {
    // `trace` is one of the nine operations ADR 0014 leaves untouched: the flat
    // shape, budget and blind spots at the top.
    const flat = invoke('trace', 'charge', '--json')
    expect(flat.code).toBe(0)
    const flatEnvelope = JSON.parse(flat.stdout) as Record<string, unknown>
    for (const field of [
      'operation',
      'schemaVersion',
      'request',
      'snapshot',
      'conditions',
      'blindSpots',
      'budget',
      'result',
    ]) {
      expect(flatEnvelope).toHaveProperty(field)
    }

    // `callers` is one of ADR 0014's six batched operations: `result` is an
    // array keyed by subject, and `budget`/`blindSpots` live on that entry.
    const batched = invoke('callers', 'charge', '--json')
    expect(batched.code).toBe(0)
    const batchedEnvelope = JSON.parse(batched.stdout) as Record<
      string,
      unknown
    >
    for (const field of [
      'operation',
      'schemaVersion',
      'request',
      'snapshot',
      'conditions',
      'result',
    ]) {
      expect(batchedEnvelope).toHaveProperty(field)
    }
    expect(batchedEnvelope).not.toHaveProperty('blindSpots')
    expect(batchedEnvelope).not.toHaveProperty('budget')
    const entry = entryOf(batched.stdout)
    for (const field of ['subject', 'resolved', 'budget', 'blindSpots']) {
      expect(entry).toHaveProperty(field)
    }
  })

  it('echoes the resolved subject, so an answer can be fed back in', () => {
    const entry = entryOf(invoke('callers', 'charge', '--json').stdout)
    // The `SymbolId` itself, which is ADR 0006's third input form: the package
    // is the fixture's own, and the version is the fixed placeholder ADR 0002
    // normalises a workspace version to.
    expect(entry.resolved).toEqual([
      'codedocs npm codedocs-cli-fixture . `src/payments.ts`/charge().',
    ])

    // The resolved id round-trips: passing it back gives the same answer.
    const again = entryOf(
      invoke('callers', entry.resolved[0] ?? '', '--json').stdout,
    )
    expect(again.resolved).toEqual(entry.resolved)
  })

  it('is unbounded by default, so an agent is never handed a silent cap', () => {
    const entry = entryOf(invoke('symbol', '*', '--json').stdout)
    expect(entry.budget.truncated).toBe(false)
    expect(entry.budget.returned).toBe(entry.budget.available)
  })

  it('carries the schema version the error shape belongs to', () => {
    const envelope = JSON.parse(invoke('symbol', '*', '--json').stdout) as {
      schemaVersion: number
    }
    expect(envelope.schemaVersion).toBe(5)
  })

  it('is byte-identical when the same question is asked twice', () => {
    expect(invoke('symbol', '*', '--json').stdout).toBe(
      invoke('symbol', '*', '--json').stdout,
    )
  })

  it('takes several subjects at once, one entry per subject', () => {
    const envelope = JSON.parse(
      invoke('callers', 'charge', 'checkout', '--json').stdout,
    ) as { request: { subjects: string[] }; result: BatchEntry[] }
    expect(envelope.request.subjects).toEqual(['charge', 'checkout'])
    expect(envelope.result.map((entry) => entry.subject)).toEqual([
      'charge',
      'checkout',
    ])
  })
})

describe('trace', () => {
  it('answers with paths, unbounded until the caller says otherwise', () => {
    const envelope = JSON.parse(
      invoke('trace', 'checkout', '--json').stdout,
    ) as {
      request: { depth: number | null }
      result: { root: string; steps: unknown[]; terminus: string }[]
    }
    expect(envelope.request.depth).toBeNull()
    expect(envelope.result[0]?.root).toBe(
      'codedocs npm codedocs-cli-fixture . `src/checkout.ts`/checkout().',
    )
    expect(envelope.result[0]?.steps.length).toBeGreaterThan(0)
  })

  it('echoes the bound the caller set', () => {
    const envelope = JSON.parse(
      invoke('trace', 'checkout', '--depth', '1', '--json').stdout,
    ) as { request: { depth: number | null } }
    expect(envelope.request.depth).toBe(1)
  })

  it('collapses the prefix two paths share, rather than repeating it', () => {
    const lines = invoke('trace', 'checkout').stdout.split('\n')
    // Both paths run through `charge`; it is printed once.
    expect(lines.filter((line) => line.includes('#charge'))).toHaveLength(1)
  })

  it('says where a walk closed a loop', () => {
    expect(invoke('trace', 'ping').stdout).toContain('cycle')
  })

  it('is byte-identical across two walks of the same index', () => {
    // The walk itself is in graph order; only the sort makes the answer stable.
    expect(invoke('trace', 'checkout', '--json').stdout).toBe(
      invoke('trace', 'checkout', '--json').stdout,
    )
  })

  it('says there is more beyond the bound the caller set', () => {
    expect(invoke('trace', 'checkout', '--depth', '1').stdout).toContain(
      'beyond depth 1',
    )
  })
})

describe('evidence', () => {
  it('assembles every kind under its own heading and its own count', () => {
    const text = invoke('evidence', 'charge').stdout
    // Headed even when empty: "no callers" is a fact about the subject, and
    // silence would read as a kind that was dropped.
    for (const kind of [
      'symbols',
      'files',
      'callers',
      'callees',
      'references',
      'labels',
    ]) {
      expect(text).toContain(`  ${kind} (`)
    }
    expect(text).toContain('src/payments.ts#charge')
  })

  it('bounds each kind separately, so one cap cannot evict another kind', () => {
    const envelope = JSON.parse(
      invoke('evidence', 'charge', '--limit', '1', '--json').stdout,
    ) as {
      result: {
        result: Record<
          string,
          { items: unknown[]; budget: { returned: number } }
        >
      }[]
    }
    const report = envelope.result[0]?.result
    const { claims: _claims, ...kinds } = report ?? {}
    for (const kind of Object.values(kinds)) {
      expect(kind.budget.returned).toBeLessThanOrEqual(1)
    }
    // Every kind still answered, which a shared pool of one could not do.
    expect(report?.['symbols']?.items).toHaveLength(1)
    expect(report?.['files']?.items).toHaveLength(1)
    expect(report?.['callers']?.items).toHaveLength(1)
  })

  it('emits claim expressions in the machine renderer alone', () => {
    const envelope = JSON.parse(
      invoke('evidence', 'charge', '--claims', '--json').stdout,
    ) as { result: { result: { claims: string[] } }[] }
    expect(envelope.result[0]?.result.claims).toContain(
      'exists(src/payments.ts#charge)',
    )

    // Absent unasked, rather than always sent: a claim restates a fact the
    // payload already carries.
    const plain = JSON.parse(invoke('evidence', 'charge', '--json').stdout) as {
      result: { result: { claims: string[] | null } }[]
    }
    expect(plain.result[0]?.result.claims).toBeNull()
  })

  it('refuses `--claims` without `--json` rather than dropping it', () => {
    const result = invoke('evidence', 'charge', '--claims')
    expect(result.code).toBe(2)
    expect(result.stderr).toContain('--claims needs --json')
    // And the human answer never carries one, asked for or not.
    expect(invoke('evidence', 'charge').stdout).not.toContain('exists(')
  })

  it('refuses `--claims` on an operation that produces none', () => {
    const result = invoke('callers', 'charge', '--claims', '--json')
    expect(result.code).toBe(2)
    expect(result.stderr).toContain('--claims applies to `evidence`')
  })
})

describe('docs', () => {
  beforeAll(() => {
    writeFileSync(
      join(root, 'verified.md'),
      [
        '# Checkout',
        '',
        'Checkout charges through the payments module.',
        '',
        '<!-- codedocs: calls(src/checkout.ts#checkout,',
        '                     src/payments.ts#charge) -->',
        '',
        '## Uncovered',
        '',
        'Prose with nothing checkable in it.',
      ].join('\n'),
    )
    // A broken prose link is "a contradiction with no inference in it", and the
    // one that does not depend on the fixture's fidelity: this project has no
    // `node_modules`, so a missing *edge* would honestly read as unverifiable.
    writeFileSync(
      join(root, 'wrong.md'),
      [
        '# Wrong',
        '',
        'See [the gateway](src/gone.ts).',
        '',
        '<!-- codedocs: exists(src/payments.ts#charge) -->',
      ].join('\n'),
    )
  })

  it('takes a two-word operation name as one operation', () => {
    const envelope = JSON.parse(invoke('docs', 'check', '--json').stdout) as {
      operation: string
    }
    expect(envelope.operation).toBe('docs check')
  })

  it('exits 1 for a contradicted document', () => {
    expect(invoke('docs', 'check').code).toBe(1)

    const envelope = JSON.parse(invoke('docs', 'check', '--json').stdout) as {
      result: {
        path: string
        verdict: string
        sections: { claims: { verdict: string }[] }[]
      }[]
    }
    const found = new Map(envelope.result.map((one) => [one.path, one]))
    expect(found.get('wrong.md')?.verdict).toBe('contradicted')
    // A present fact decides its claim whatever the fidelity, so the verified
    // half is verified even in a project analysed without types.
    expect(
      found
        .get('verified.md')
        ?.sections.flatMap((one) => one.claims)
        .map((claim) => claim.verdict),
    ).toEqual(['verified'])
  })

  it('never renders a verdict without its coverage', () => {
    // Without coverage, `verified` silently means "the checkable part is true".
    expect(invoke('docs', 'check').stdout).toContain('of 2 sections covered')
  })

  it('refuses a `--fail-on` that is not a verdict', () => {
    const result = invoke('docs', 'check', '--fail-on', 'nonsense')
    expect(result.code).toBe(2)
    expect(result.stderr).toContain('--fail-on takes a verdict')
  })

  it('refuses `--fail-on` on an operation that has no verdicts', () => {
    expect(invoke('callers', 'charge', '--fail-on', 'contradicted').code).toBe(
      2,
    )
  })

  it('never exits 1 for reaching a document', () => {
    // `docs affected` reports reach, and reaching a document is not a finding.
    expect(invoke('docs', 'affected').code).toBe(0)
  })

  it('reports what the marker scan cost, so the measurement stays visible', () => {
    expect(invoke('docs', 'check').stdout).toMatch(
      /scanned \d+ Markdown files? in \d+ ms/,
    )
  })

  describe('--fail-on', () => {
    // Its own checkout: the shared root holds a contradicted document, and this
    // is about the exit code a repository reaches when nothing is contradicted.
    let stale: string

    beforeAll(() => {
      stale = mkdtempSync(join(tmpdir(), 'codedocs-stale-'))
      cpSync(fixture, stale, { recursive: true })
      cpSync(join(here, 'package.fixture.json'), join(stale, 'package.json'))
      writeFileSync(
        join(stale, 'stale.md'),
        [
          '# Payments',
          '',
          'Charging is where the money moves.',
          '',
          '<!-- codedocs: exists(src/payments.ts#charge) -->',
        ].join('\n'),
      )
      // Build the index first, so the edit below reads as drift rather than as
      // the cold build every file of a new checkout would be.
      run(['analyse', '--cwd', stale, '--no-color'])
    })

    afterAll(() => {
      rmSync(stale, { recursive: true, force: true })
    })

    /**
     * Ask, having just changed a file the document touches.
     *
     * The touch has to happen before every run: each session repairs the drift
     * it found, so the second run of a pair would otherwise see a clean tree.
     */
    const askAfterTouching = (...args: string[]): ReturnType<typeof run> => {
      appendFileSync(join(stale, 'src', 'payments.ts'), '\n// touched\n')
      return run([...args, '--cwd', stale, '--no-color'])
    }

    it('leaves a potentially stale document at exit 0 by default', () => {
      const result = askAfterTouching('docs', 'check', '--json')
      const envelope = JSON.parse(result.stdout) as {
        result: { path: string; verdict: string }[]
      }
      expect(
        envelope.result.find((one) => one.path === 'stale.md')?.verdict,
      ).toBe('potentially-stale')
      // ADR 0005 measured pointer signals of this character at 59–77% false
      // alarms; wiring that to a red build is what gets `docs check` removed
      // from CI within a month.
      expect(result.code).toBe(0)
    })

    it('raises the exit code when asked to fail on it', () => {
      expect(
        askAfterTouching('docs', 'check', '--fail-on', 'potentially-stale')
          .code,
      ).toBe(1)
    })
  })
})

describe('the human renderer', () => {
  it('caps by default and says how many it withheld', () => {
    const result = invoke('symbol', '*', '--limit', '2')
    expect(result.stdout).toContain('showing 2 of')
  })

  it('distinguishes an empty answer from a subject that matched nothing', () => {
    expect(invoke('callers', 'NoSuchSymbol').stdout).toContain(
      '`NoSuchSymbol` matched no symbol',
    )
    // `twice` resolves and simply has no callers.
    expect(invoke('callers', 'twice').stdout).toContain('no call edges')
  })

  it('marks an edge the adapter inferred rather than observed', () => {
    // The JSX call is produced by the adapter's own rule, so it must never read
    // as a checked one.
    expect(invoke('callers', 'Badge').stdout).toContain('jsx-element-rule')
  })

  it('marks a call credited to the variable it initialises', () => {
    expect(invoke('callers', 'checkout').stdout).toContain('(variable)')
  })

  it('prints the shorthand, never the `SymbolId` it projects from', () => {
    // ADR 0005 rejected the SCIP string as something anyone reads or types, and
    // ADR 0006 makes whatever is printed an accepted subject — so the printed
    // form has to be the shorthand, on every operation that names a symbol.
    for (const printed of [
      invoke('symbol', 'charge').stdout,
      invoke('callers', 'charge').stdout,
      invoke('references', 'Gateway').stdout,
      invoke('trace', 'checkout').stdout,
      invoke('evidence', 'charge').stdout,
    ]) {
      expect(printed).toMatch(/src\/[a-z]+\.ts#/)
      expect(printed).not.toContain('codedocs npm')
    }
  })
})

describe('references', () => {
  it('answers with the envelope, and names both ends of each edge', () => {
    const envelope = JSON.parse(
      invoke('references', 'Gateway', '--json').stdout,
    ) as {
      operation: string
      result: { result: { from: string; to: string; kind: string }[] }[]
    }
    expect(envelope.operation).toBe('references')
    // Both ends as `SymbolId`s: `--json` is what an agent feeds back in, and
    // ADR 0005's shorthand is what the human renderer prints instead.
    const pkg = 'codedocs npm codedocs-cli-fixture .'
    expect(envelope.result[0]?.result[0]).toMatchObject({
      from: `${pkg} \`src/payments.ts\`/StripeGateway#`,
      to: `${pkg} \`src/payments.ts\`/Gateway#`,
      kind: 'implements',
    })
  })

  it('reports a relationship the call operations cannot', () => {
    // `Gateway` is implemented and never called: the two halves of the
    // relationship set, kept apart.
    expect(invoke('callers', 'Gateway').stdout).toContain('no call edges')
    expect(invoke('references', 'Gateway').stdout).toContain('implements')
  })

  it('is byte-identical when the same question is asked twice', () => {
    expect(invoke('references', 'Gateway', '--json').stdout).toBe(
      invoke('references', 'Gateway', '--json').stdout,
    )
  })
})

describe('file', () => {
  it('reports one file’s projects, symbols, imports and importers', () => {
    const envelope = JSON.parse(
      invoke('file', 'src/checkout.ts', '--json').stdout,
    ) as {
      result: {
        result: {
          path: string
          projects: string[]
          canonicalProject: string
          symbols: unknown[]
          imports: unknown[]
          importers: string[]
        }[]
      }[]
    }
    const report = envelope.result[0]?.result[0]
    expect(report?.path).toBe('src/checkout.ts')
    expect(report?.projects).toEqual(['tsconfig.json'])
    expect(report?.canonicalProject).toBe('tsconfig.json')
    expect(report?.symbols.length).toBeGreaterThan(0)
    expect(report?.imports.length).toBeGreaterThan(0)
  })

  it('accepts the tail of a path, as it prints one', () => {
    expect(invoke('file', 'checkout.ts').stdout).toContain('src/checkout.ts')
  })

  it('says plainly when the index holds no such file', () => {
    const result = invoke('file', 'src/nowhere.ts')
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('`src/nowhere.ts` matched no file')
  })
})

describe('impact', () => {
  it('answers without a baseline, at exit 0, naming the absence', () => {
    // The CLI fixture is not a git repository and has no baseline: a missing
    // one degrades an answer rather than blocking it.
    const result = invoke('impact')
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('baseline')
  })

  it('carries the comparison in the envelope', () => {
    const envelope = JSON.parse(invoke('impact', '--json').stdout) as {
      operation: string
      baseline: { commit: string | null; absent: string | null }
      changes: unknown[]
    }
    expect(envelope.operation).toBe('impact')
    expect(envelope.baseline.commit).toBeNull()
    expect(envelope.baseline.absent).toContain('no baseline')
  })

  it('takes `--base`, and `--depth`, and refuses `--base` elsewhere', () => {
    expect(invoke('impact', '--base', 'HEAD', '--depth', '2').code).toBe(0)
    const refused = invoke('symbol', '*', '--base', 'HEAD')
    expect(refused.code).toBe(2)
    // Derived from the manifest, so the sentence names every operation that
    // takes it rather than the one this test is about.
    expect(refused.stderr).toContain('`impact`')
    expect(refused.stderr).toContain('not `symbol`')
  })
})

describe('the scope channel', () => {
  it('echoes the scope it applied on every answer', () => {
    const envelope = JSON.parse(invoke('symbol', '*', '--json').stdout) as {
      request: {
        scope: {
          include: { axis: string; value: string }[]
          exclude: unknown[]
          excluded: number
        }
      }
    }
    expect(envelope.request.scope.include).toEqual([
      { axis: 'authorship', value: 'authored' },
    ])
    expect(envelope.request.scope.exclude).toEqual([])
  })

  it('filters by label, and reports the count rather than a blind spot', () => {
    const entry = entryOf(
      invoke('symbol', '*', '--exclude-label', 'role=test', '--json').stdout,
    )
    expect(entry.excluded).toBeGreaterThanOrEqual(0)
    expect(entry.blindSpots).toEqual([])
  })

  it('refuses a filter it does not know rather than matching nothing', () => {
    const result = invoke('symbol', '*', '--label', 'role=nope')
    expect(result.code).toBe(2)
    expect(result.stderr).toContain('--label takes `axis=value`')
  })

  it('takes one flag per axis, because the axes are orthogonal', () => {
    const envelope = JSON.parse(
      invoke(
        'symbol',
        '*',
        '--label',
        'role=source',
        '--label',
        'authorship=authored',
        '--json',
      ).stdout,
    ) as { request: { scope: { include: { axis: string }[] } } }
    expect(envelope.request.scope.include.map((one) => one.axis)).toEqual([
      'role',
      'authorship',
    ])
  })
})

describe('doctor', () => {
  it('exits 1 for a cause a command would clear', () => {
    // The fixture has no `node_modules`, which is signal 1 and remediable.
    const result = invoke('doctor')

    expect(result.code).toBe(1)
    expect(result.stdout).toContain('tsconfig.json')
    expect(result.stdout).toContain('unprepared')
  })

  it('reports what the label layer decided', () => {
    const envelope = JSON.parse(invoke('doctor', '--json').stdout) as {
      classification: {
        counts: { role: string; authorship: string; files: number }[]
      }
    }
    expect(envelope.classification.counts.length).toBeGreaterThan(0)
    expect(invoke('doctor').stdout).toContain('classification')
  })

  it('carries the header and the whole set in the envelope', () => {
    const envelope = JSON.parse(invoke('doctor', '--json').stdout) as {
      operation: string
      header: { toolVersion: string; projects: number }
      remediable: number
      measured: unknown
      result: { project: string; cause: string }[]
    }

    expect(envelope.operation).toBe('doctor')
    expect(envelope.header.projects).toBe(1)
    expect(envelope.remediable).toBe(1)
    // Absent unless it was asked for: a diagnostic is never a hidden cost.
    expect(envelope.measured).toBeNull()
    expect(envelope.result[0]?.cause).toBe('unprepared')
  })

  it('names where the working tree disagrees with the index, when asked', () => {
    expect(invoke('doctor', '--measure').stdout).toContain('working tree')
  })

  it('refuses `--measure` on an operation that does not take it', () => {
    const result = invoke('symbol', '*', '--measure')

    expect(result.code).toBe(2)
    expect(result.stderr).toContain('--measure applies to `doctor`')
  })

  it('is byte-identical when the same question is asked twice', () => {
    expect(invoke('doctor', '--json').stdout).toBe(
      invoke('doctor', '--json').stdout,
    )
  })
})

describe('doctor over a repository with nothing to clear', () => {
  let prepared: string

  beforeAll(() => {
    prepared = mkdtempSync(join(tmpdir(), 'codedocs-doctor-'))
    cpSync(fixture, prepared, { recursive: true })
    cpSync(join(here, 'package.fixture.json'), join(prepared, 'package.json'))
    // Installed, so signal 1 is met; the only finding left is an import that
    // names nothing, which no command would fix.
    mkdirSync(join(prepared, 'node_modules', 'left-pad'), { recursive: true })
    writeFileSync(
      join(prepared, 'node_modules', 'left-pad', 'index.d.ts'),
      'export {}\n',
    )
    writeFileSync(
      join(prepared, 'src', 'app.ts'),
      "import './nowhere'\nexport const app = (): number => 1\n",
    )
  })

  afterAll(() => {
    rmSync(prepared, { recursive: true, force: true })
  })

  it('exits 0, because a red build that cannot be cleared is noise', () => {
    const result = run(['doctor', '--cwd', prepared, '--no-color'])

    expect(result.code).toBe(0)
    // Reported all the same: exit 0 is not silence.
    expect(result.stdout).toContain('broken')
  })
})

describe('codedocs.jsonc', () => {
  const config = () => join(root, 'codedocs.jsonc')

  afterEach(() => {
    rmSync(config(), { force: true })
  })

  it('is absent by default, and nothing is said about it', () => {
    const result = invoke('symbol', '*', '--json')

    expect(result.code).toBe(0)
    expect(result.stderr).toBe('')
  })

  it('cannot answer when the file exists and is wrong', () => {
    writeFileSync(config(), '{"baselines": "three"}\n')
    const result = invoke('symbol', '*')

    expect(result.code).toBe(2)
    expect(result.stderr).toContain(
      'config-invalid: codedocs.jsonc: `baselines` must be a non-negative integer',
    )
  })

  it('carries the refusal in the envelope, so `--json` still parses', () => {
    writeFileSync(config(), '{"exlucde": []}\n')
    const result = invoke('symbol', '*', '--json')

    expect(result.code).toBe(2)
    const envelope = JSON.parse(result.stdout) as {
      error: {
        code: string
        params: { key: string; expectation: string }
        message?: string
      }
      result?: unknown
    }
    expect(envelope.error.code).toBe('config-invalid')
    // ADR 0011: the key is a typed parameter, not a word inside a sentence.
    expect(envelope.error.params.key).toBe('exlucde')
    expect(envelope.error.message).toBeUndefined()
    // ADR 0006: `error` is carried instead of `result`, never beside it.
    expect(envelope.result).toBeUndefined()
  })

  it('prints the same sentence it always did, from the code and parameters', () => {
    writeFileSync(config(), '{"exlucde": []}\n')

    expect(invoke('symbol', '*').stderr).toContain(
      'config-invalid: codedocs.jsonc: `exlucde` is not a key codedocs knows',
    )
  })

  it('does not fall back to the defaults on a file it refused', () => {
    writeFileSync(config(), '{"baselines": -1}\n')

    expect(invoke('symbol', '*').stdout).toBe('')
  })
})
