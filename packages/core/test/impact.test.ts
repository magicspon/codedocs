/**
 * Baselines, and the one operation that composes.
 *
 * ADR 0008's three rules are what these pin. A baseline is **recorded by normal
 * use** — so a clean-tree `analyse` leaves one and a dirty one does not.
 * Retention is a **count**, evicting non-ancestors before oldest. And a missing
 * baseline **degrades an answer rather than blocking one**, which is the
 * difference between a blind spot at exit 0 and a failure.
 */

import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { listBaselines } from '../src/baseline/index.ts'
import { DEFAULT_CONFIG, parseConfig } from '../src/config/index.ts'
import { UNSCOPED } from '../src/labels/index.ts'
import { analyse } from '../src/operations/analyse.ts'
import { impact } from '../src/operations/impact.ts'
import { openSession } from '../src/session/index.ts'

let root: string

/** Run git in the fixture, with output discarded. */
function git(...args: string[]): void {
  execFileSync('git', args, { cwd: root, stdio: 'ignore' })
}

/** Put a file on disk. */
const write = (path: string, content: string): void =>
  writeFileSync(join(root, path), content)

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'codedocs-impact-'))
  mkdirSync(join(root, 'src'), { recursive: true })
  mkdirSync(join(root, 'node_modules'), { recursive: true })
  write(
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        noEmit: true,
      },
      include: ['src'],
    }),
  )
  write('package.json', '{"name":"fixture","private":true}')
  write('src/core.ts', 'export const core = (): number => 1\n')
  write(
    'src/uses.ts',
    "import { core } from './core.ts'\nexport const uses = (): number => core() + 1\n",
  )
  write(
    'src/outer.ts',
    "import { uses } from './uses.ts'\nexport const outer = (): number => uses()\n",
  )
  git('init', '-q')
  git('config', 'user.email', 'fixture@example.com')
  git('config', 'user.name', 'Fixture')
  git('add', '-A')
  git('commit', '-qm', 'first')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

/** Run `analyse`, which is the only thing that captures a baseline. */
function runAnalyse(config = DEFAULT_CONFIG) {
  const session = openSession({ cwd: root, noUpdate: false })
  try {
    return analyse(
      session.store,
      session.context,
      null,
      UNSCOPED,
      session.repair,
      session.labelPass,
      { root, cap: config.baselines },
    )
  } finally {
    session.close()
  }
}

/** Run `impact` over a real session, as the binding does. */
function runImpact(base: string | null = null, depth: number | null = null) {
  const session = openSession({ cwd: root, noUpdate: false })
  try {
    return impact(session.store, session.context, null, depth, {
      root,
      base,
      scoping: { scope: UNSCOPED.scope, labels: session.labels() },
    })
  } finally {
    session.close()
  }
}

const head = (): string =>
  execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim()

describe('capture', () => {
  it('leaves a baseline for the commit a clean tree is at', () => {
    const taken = runAnalyse().capture
    expect(taken?.commit).toBe(head())
    expect(listBaselines(root).map((one) => one.commit)).toEqual([head()])
  })

  it('captures nothing over a tree that is not clean', () => {
    write('src/core.ts', 'export const core = (): number => 2\n')
    const taken = runAnalyse().capture

    // A snapshot is a commit plus whatever is uncommitted on top of it; a
    // baseline is an index for a commit, so there is nothing here to name.
    expect(taken?.commit).toBeNull()
    expect(taken?.declined).toContain('not clean')
    expect(listBaselines(root)).toEqual([])
  })

  it('names the commit git is at, not the one the index last recorded', () => {
    // Committing changes no file, so nothing drifts and no repair runs. Taking
    // the commit from the index header would name this baseline after its
    // parent.
    runAnalyse()
    write('src/extra.ts', 'export const extra = (): number => 3\n')
    runAnalyse() // Dirty: captures nothing.
    git('add', '-A')
    git('commit', '-qm', 'second')

    expect(runAnalyse().capture?.commit).toBe(head())
  })

  it('is disabled entirely by `baselines: 0`', () => {
    const taken = runAnalyse(parseConfig('{"baselines": 0}')).capture
    expect(taken?.commit).toBeNull()
    expect(taken?.declined).toContain('disabled')
    expect(listBaselines(root)).toEqual([])
  })
})

describe('retention', () => {
  /** Commit one more file and analyse, which captures. */
  function advance(name: string): void {
    write(`src/${name}.ts`, `export const ${name} = (): number => 1\n`)
    git('add', '-A')
    git('commit', '-qm', name)
    runAnalyse()
  }

  it('holds the cap, evicting the oldest', () => {
    runAnalyse()
    for (const name of ['two', 'three', 'four', 'five']) advance(name)

    const held = listBaselines(root)
    expect(held).toHaveLength(3)
    // Newest first, and every one an ancestor of HEAD.
    expect(held[0]?.commit).toBe(head())
    expect(held.every((one) => one.ancestor)).toBe(true)
  })

  it('evicts a baseline that is an ancestor of nothing first', () => {
    runAnalyse()
    git('checkout', '-q', '-b', 'side')
    advance('side-one')
    const abandoned = head()

    // Back to the first commit, where the side branch's baseline is an
    // ancestor of nothing — which is the whole branch-switching story.
    git('checkout', '-q', '-')
    advance('two')
    advance('three')

    expect(listBaselines(root).map((one) => one.commit)).not.toContain(
      abandoned,
    )
  })
})

describe('impact', () => {
  it('reaches what a change could reach, at the distance it reaches it', () => {
    runAnalyse()
    write('src/core.ts', 'export const core = (): number => 99\n')

    const found = runImpact().result ?? []
    expect(found.map((one) => `${one.depth} ${one.id}`)).toEqual([
      '0 src/core.ts#core',
      '1 src/uses.ts#uses',
      '2 src/outer.ts#outer',
    ])
    expect(found[1]?.through).toBe('calls')
  })

  it('bounds the walk where the caller bounds it', () => {
    runAnalyse()
    write('src/core.ts', 'export const core = (): number => 99\n')

    expect((runImpact(null, 1).result ?? []).map((one) => one.id)).toEqual([
      'src/core.ts#core',
      'src/uses.ts#uses',
    ])
  })

  it('answers with no baseline at all, naming the absence', () => {
    // A missing baseline degrades an answer rather than blocking one: the edits
    // still come from git, and the walk still runs.
    write('src/core.ts', 'export const core = (): number => 99\n')

    const envelope = runImpact()
    expect(envelope.baseline.commit).toBeNull()
    expect(envelope.blindSpots.map((spot) => spot.subject)).toContain(
      'baseline',
    )
    expect((envelope.result ?? []).map((one) => one.id)).toContain(
      'src/core.ts#core',
    )
  })

  it('names a substitution as part of the request, never as a blind spot', () => {
    runAnalyse()
    const first = head()
    write('src/extra.ts', 'export const extra = (): number => 3\n')
    git('add', '-A')
    git('commit', '-qm', 'second')
    runAnalyse()

    // The first commit has a baseline, so ask for one that does not: `HEAD`
    // itself is stored, and its parent is too, so drop a baseline instead.
    rmSync(join(root, '.codedocs', 'base', `${first}.db`), { force: true })
    const envelope = runImpact(first)

    expect(envelope.baseline.requested).toBe(first)
    expect(envelope.baseline.commit).not.toBe(first)
    expect(envelope.baseline.distance).toBe(1)
    expect(
      envelope.blindSpots.some((spot) => spot.subject === 'baseline'),
    ).toBe(false)
  })

  it('reports the files the comparison found different', () => {
    runAnalyse()
    write('src/core.ts', 'export const core = (): number => 99\n')
    write('src/new.ts', 'export const fresh = (): number => 4\n')

    const changes = runImpact().changes
    expect(changes.map((one) => `${one.kind} ${one.file}`)).toEqual([
      'changed src/core.ts',
      'added src/new.ts',
    ])
  })

  it('says plainly when nothing changed', () => {
    runAnalyse()
    const envelope = runImpact()
    expect(envelope.changes).toEqual([])
    expect(envelope.result).toEqual([])
  })
})

describe('a baseline built under other conditions', () => {
  it('leaves a file whose fidelity moved out of the comparison', () => {
    // Analysed with `node_modules` present, then without: the project drops to
    // `syntactic`, and every difference in it would be the analysis changing
    // rather than the code.
    runAnalyse()
    rmSync(join(root, 'node_modules'), { recursive: true, force: true })
    write('src/core.ts', 'export const core = (): number => 99\n')

    const envelope = runImpact()
    const excluded = envelope.changes.filter((one) => one.excluded !== null)
    expect(excluded.map((one) => one.file)).toContain('src/core.ts')
    expect(excluded[0]?.excluded).toContain('the analysis changing')
    // Named as a blind spot, and left out of the walk.
    expect(envelope.blindSpots.map((spot) => spot.subject)).toContain(
      'src/core.ts',
    )
    expect((envelope.result ?? []).map((one) => one.id)).not.toContain(
      'src/core.ts#core',
    )
  })
})

describe('affected tests', () => {
  it('are `impact --label role=test`, and not an operation of their own', () => {
    write(
      'src/core.test.ts',
      "import { core } from './core.ts'\nexport const spec = (): number => core()\n",
    )
    git('add', '-A')
    git('commit', '-qm', 'test')
    runAnalyse()
    write('src/core.ts', 'export const core = (): number => 99\n')

    const session = openSession({ cwd: root, noUpdate: false })
    try {
      const envelope = impact(session.store, session.context, null, null, {
        root,
        base: null,
        scoping: {
          scope: {
            include: [{ axis: 'role', value: 'test' }],
            exclude: [],
            excluded: 0,
          },
          labels: session.labels(),
        },
      })
      expect((envelope.result ?? []).map((one) => one.id)).toEqual([
        'src/core.test.ts#spec',
      ])
      expect(envelope.request.scope.excluded).toBeGreaterThan(0)
    } finally {
      session.close()
    }
  })
})

describe('the index directory', () => {
  it('keeps baselines beside the index, inside the ignored directory', () => {
    runAnalyse()
    expect(existsSync(join(root, '.codedocs', 'base'))).toBe(true)
    // `.codedocs/.gitignore` is `*`, so nothing here reaches `git status` —
    // which is what keeps capture from making the tree dirty for the next run.
    expect(
      execFileSync('git', ['status', '--porcelain'], {
        cwd: root,
        encoding: 'utf8',
      }).trim(),
    ).toBe('')
  })
})
