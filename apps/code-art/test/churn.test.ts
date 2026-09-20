import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { churnAt, notShallow, parseLog } from '../scripts/churn.ts'

describe('parseLog', () => {
  // Two commits as `git log --numstat --format=format:%at|%ae` prints them.
  const log = [
    '1000|ana@example.com',
    '3\t1\tsrc/a.ts',
    '-\t-\tlogo.png',
    '',
    '900|ben@example.com',
    '10\t0\tsrc/a.ts',
    '2\t2\tsrc/b.ts',
  ].join('\n')

  it('makes one event per file per commit, moved forward by the shift', () => {
    expect(parseLog(log, 50)).toEqual([
      {
        path: 'src/a.ts',
        timestamp: 1050,
        added: 3,
        deleted: 1,
        author: 'ana@example.com',
      },
      {
        path: 'logo.png',
        timestamp: 1050,
        added: 0,
        deleted: 0,
        author: 'ana@example.com',
      },
      {
        path: 'src/a.ts',
        timestamp: 950,
        added: 10,
        deleted: 0,
        author: 'ben@example.com',
      },
      {
        path: 'src/b.ts',
        timestamp: 950,
        added: 2,
        deleted: 2,
        author: 'ben@example.com',
      },
    ])
  })

  it('drops a path git still quotes, which fallow would reject', () => {
    const quoted = '5|x\n1\t0\t"odd\\tname.ts"\n2\t0\tsrc/ok.ts'
    expect(parseLog(quoted, 0).map((e) => e.path)).toEqual(['src/ok.ts'])
  })

  it('keeps a pipe inside a path', () => {
    expect(parseLog('5|x\n1\t0\tsrc/a|b.ts', 0)[0]?.path).toBe('src/a|b.ts')
  })
})

describe('notShallow', () => {
  it('excludes each boundary commit and ignores anything else', () => {
    const sha = 'a'.repeat(40)
    expect(notShallow(`${sha}\n\nnot-a-sha\n`)).toEqual([`^${sha}`])
    expect(notShallow('')).toEqual([])
  })
})

/**
 * Against a planted repository rather than a mocked git: what is pinned is what
 * git actually reports — the `--numstat` shape, and a shallow clone showing its
 * boundary commit as adding every file, which is the whole reason for the
 * exclusion.
 */
describe('churnAt', () => {
  let root: string
  let clone: string

  const git = (at: string, ...args: string[]): void => {
    execFileSync('git', args, { cwd: at, stdio: 'ignore' })
  }

  /** The commit date of `at`'s HEAD, in unix seconds. */
  const headTime = (at: string): number =>
    Number(
      execFileSync('git', ['log', '-1', '--format=%ct'], {
        cwd: at,
        encoding: 'utf8',
      }).trim(),
    )

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'code-art-churn-'))
    clone = mkdtempSync(join(tmpdir(), 'code-art-churn-clone-'))
    git(root, 'init', '-q')
    git(root, 'config', 'user.email', 'fixture@example.com')
    git(root, 'config', 'user.name', 'Fixture')
    writeFileSync(join(root, 'a.ts'), 'export const a = 1\n')
    git(root, 'add', '-A')
    git(root, 'commit', '-qm', 'first')
    writeFileSync(join(root, 'a.ts'), 'export const a = 2\n')
    writeFileSync(join(root, 'b.ts'), 'export const b = 1\n')
    git(root, 'add', '-A')
    git(root, 'commit', '-qm', 'second')
  })

  afterEach(() => {
    for (const one of [root, clone])
      rmSync(one, { recursive: true, force: true })
  })

  it('reads one event per file per commit in fallow’s contract', () => {
    const churn = churnAt(root, 0)
    expect(churn.schema).toBe('fallow-churn/v1')
    expect(churn.events.map((e) => e.path)).toEqual(['a.ts', 'b.ts', 'a.ts'])
    expect(churn.events[0]).toMatchObject({
      added: 1,
      deleted: 1,
      author: 'fixture@example.com',
      // `now` at 0 is before HEAD, so the shift floors at 0 and the timestamps
      // are the commit dates themselves.
      timestamp: headTime(root),
    })
  })

  it('moves every timestamp forward so HEAD reads as `now`', () => {
    const head = headTime(root)
    const events = churnAt(root, head + 1000).events
    expect(events[0]?.timestamp).toBe(head + 1000)
    // The older commit keeps its distance from HEAD.
    expect(events.at(-1)?.timestamp).toBeLessThanOrEqual(head + 1000)
  })

  it('leaves a shallow clone’s boundary commit out', () => {
    // `file://` rather than a path: git only makes a shallow clone over a URL.
    execFileSync(
      'git',
      ['clone', '-q', '--depth', '1', `file://${root}`, clone],
      { stdio: 'ignore' },
    )
    // The one commit the clone holds is its boundary, so nothing is left to count.
    expect(churnAt(clone, 0).events).toEqual([])
  })
})
