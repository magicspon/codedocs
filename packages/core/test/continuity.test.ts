/**
 * The git probes, and the subject matching ADR 0007 builds on them.
 *
 * Both halves are asserted against a planted repository rather than a mocked
 * git, because what is being pinned is what git actually reports: `R100` is
 * byte-identity, a directory rewrite moves siblings together, and a probe over a
 * checkout that is not a repository answers `null` instead of throwing. A mock
 * would only restate the expectations.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { CANDIDATE_LIMIT, continuationOf } from '../src/continuity/index.ts'
import {
  changedPaths,
  commitDate,
  commitsBetween,
  defaultBranch,
  distance,
  isAncestor,
  isCleanTree,
  lastCommitTouching,
  mergeBase,
  renamesIn,
  resolveRef,
} from '../src/git.ts'
import { openSession } from '../src/session/index.ts'
import type { Store } from '../src/store/index.ts'

let root: string
/** A directory that is not a repository, which every probe has to survive. */
let bare: string

const git = (...args: string[]): void => {
  execFileSync('git', args, { cwd: root, stdio: 'ignore' })
}

const write = (path: string, content: string): void => {
  mkdirSync(join(root, path, '..'), { recursive: true })
  writeFileSync(join(root, path), content)
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'codedocs-continuity-'))
  bare = mkdtempSync(join(tmpdir(), 'codedocs-not-a-repo-'))
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
  write(
    'src/old/alpha.ts',
    'export function alpha(): number {\n  return 1\n}\n',
  )
  write('src/old/beta.ts', 'export function beta(): number {\n  return 2\n}\n')
  write(
    'src/old/gamma.ts',
    'export function gamma(): number {\n  return 3\n}\n',
  )
  write('src/solo.ts', SOLO)
  git('init', '-q')
  git('config', 'user.email', 'fixture@example.com')
  git('config', 'user.name', 'Fixture')
  git('add', '-A')
  git('commit', '-qm', 'first')
})

afterEach(() => {
  for (const one of [root, bare]) rmSync(one, { recursive: true, force: true })
})

/** Long enough that git scores an edit to it below 100 rather than at it. */
const SOLO = `export function solo(): number {
  const a = 1
  const b = 2
  const c = 3
  const d = 4
  const e = 5
  return a + b + c + d + e
}
`

/** Move the whole directory in one commit, which is a prefix rewrite. */
function sweep(): void {
  git('mv', 'src/old', 'src/new')
  git('commit', '-qm', 'sweep')
}

/** Open a session over the fixture and hand its store to `run`. */
function withStore<T>(run: (store: Store) => T): T {
  const session = openSession({ cwd: root, noUpdate: false })
  try {
    return run(session.store)
  } finally {
    session.close()
  }
}

describe('the git probes', () => {
  it('answers `null` rather than throwing outside a repository', () => {
    expect(resolveRef(bare, 'HEAD')).toBeNull()
    expect(isCleanTree(bare)).toBe(false)
    expect(isAncestor(bare, 'HEAD', 'HEAD')).toBe(false)
    expect(commitDate(bare, 'HEAD')).toBeNull()
    expect(mergeBase(bare, 'HEAD')).toBeNull()
    expect(distance(bare, 'HEAD', 'HEAD')).toBeNull()
    expect(commitsBetween(bare, 'HEAD', 'HEAD')).toBeNull()
    expect(defaultBranch(bare)).toBeNull()
    expect(lastCommitTouching(bare, 'src/solo.ts')).toBeNull()
    expect(renamesIn(bare, 'HEAD')).toEqual([])
    expect(changedPaths(bare, null)).toEqual([])
  })

  it('counts commits, and says nothing where a ref names none', () => {
    sweep()
    expect(distance(root, 'HEAD~1', 'HEAD')).toBe(1)
    expect(distance(root, 'HEAD', 'HEAD')).toBe(0)
    expect(distance(root, 'HEAD', 'no-such-ref')).toBeNull()
  })

  it('signs the distance, so a substitute older than the request reads as one', () => {
    sweep()
    expect(commitsBetween(root, 'HEAD~1', 'HEAD')).toBe(1)
    expect(commitsBetween(root, 'HEAD', 'HEAD~1')).toBe(-1)
    // Zero has no direction; the sign only means anything either side of it.
    expect(Math.abs(commitsBetween(root, 'HEAD', 'HEAD') ?? NaN)).toBe(0)
  })

  it('reads the default a clone recorded, and falls back to a local branch', () => {
    // No remote yet, so `origin/HEAD` answers nothing and the branch git
    // initialised the fixture with is what is left.
    const local = defaultBranch(root)
    expect(['main', 'master', null]).toContain(local)

    git('branch', '-M', 'main')
    git('remote', 'add', 'origin', root)
    git('update-ref', 'refs/remotes/origin/main', 'HEAD')
    git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main')
    expect(defaultBranch(root)).toBe('refs/remotes/origin/main')
  })

  it('reports the commit that removed a path, and nothing for a path git never held', () => {
    sweep()
    const commit = lastCommitTouching(root, 'src/old/alpha.ts')
    expect(commit).not.toBeNull()
    expect(lastCommitTouching(root, 'src/never-existed.ts')).toBeNull()
  })

  it('reads git’s own similarity off each rename in one commit', () => {
    sweep()
    const commit = lastCommitTouching(root, 'src/old/alpha.ts') ?? 'HEAD'
    const renames = renamesIn(root, commit)
    expect(renames).toHaveLength(3)
    expect(renames.every((one) => one.similarity === 100)).toBe(true)
    expect(renames.map((one) => one.to).sort()).toEqual([
      'src/new/alpha.ts',
      'src/new/beta.ts',
      'src/new/gamma.ts',
    ])
    // A commit that renamed nothing reports nothing, rather than failing.
    expect(renamesIn(root, 'HEAD~1')).toEqual([])
  })

  it('reports a rename that also changed the file below 100', () => {
    git('mv', 'src/solo.ts', 'src/solo-renamed.ts')
    write(
      'src/solo-renamed.ts',
      SOLO.replace('return a + b + c + d + e', 'return 0'),
    )
    git('add', '-A')
    git('commit', '-qm', 'move and edit')
    const [rename] = renamesIn(root, 'HEAD')
    expect(rename?.to).toBe('src/solo-renamed.ts')
    expect(rename?.similarity).toBeLessThan(100)
  })

  it('names both paths of a rename, and everything uncommitted on top', () => {
    sweep()
    const changed = changedPaths(root, 'HEAD~1')
    expect(changed).toContain('src/old/alpha.ts')
    expect(changed).toContain('src/new/alpha.ts')

    write('src/untracked.ts', 'export const untracked = 1\n')
    expect(changedPaths(root, null)).toContain('src/untracked.ts')
    expect(isCleanTree(root)).toBe(false)
  })
})

describe('where a vanished subject went', () => {
  it('names the destination of a swept directory, with every signal that fired', () => {
    sweep()
    const found = withStore((store) =>
      continuationOf(root, store, 'src/old/alpha.ts#alpha'),
    )
    const candidate = found.candidates[0]
    expect(candidate?.id).toBe('src/new/alpha.ts#alpha')
    // Byte-identity, corroborated by two siblings making the same rewrite, on
    // top of git having called it a rename at all.
    expect(candidate?.derivations).toEqual([
      'content-hash',
      'path-prefix-rewrite',
      'git-rename',
      'name-in-head',
    ])
    expect(candidate?.similarity).toBe(100)
    expect(candidate?.commit).not.toBeNull()
    expect(found.withheld).toBe(0)
  })

  it('claims no prefix rewrite for a rename that stayed in its directory', () => {
    git('mv', 'src/solo.ts', 'src/solo-renamed.ts')
    git('commit', '-qm', 'rename in place')
    const found = withStore((store) =>
      continuationOf(root, store, 'src/solo.ts#solo'),
    )
    expect(found.candidates[0]?.derivations).not.toContain(
      'path-prefix-rewrite',
    )
    expect(found.candidates[0]?.derivations).toContain('content-hash')
  })

  it('claims no byte-identity for a rename git scored below 100', () => {
    git('mv', 'src/solo.ts', 'src/solo-renamed.ts')
    write(
      'src/solo-renamed.ts',
      SOLO.replace('return a + b + c + d + e', 'return 0'),
    )
    git('add', '-A')
    git('commit', '-qm', 'move and edit')
    const found = withStore((store) =>
      continuationOf(root, store, 'src/solo.ts#solo'),
    )
    // git-rename is evidence; the arithmetic that would make it byte-identity
    // did not hold, so `content-hash` must not claim it did.
    expect(found.candidates[0]?.derivations).not.toContain('content-hash')
    expect(found.candidates[0]?.derivations).toContain('git-rename')
    expect(found.candidates[0]?.similarity).toBeLessThan(100)
  })

  it('answers a bare name by the current index alone, with no git probe at all', () => {
    const found = withStore((store) => continuationOf(root, store, 'alpha'))
    expect(found.candidates.map((one) => one.id)).toEqual([
      'src/old/alpha.ts#alpha',
    ])
    expect(found.candidates[0]?.derivations).toEqual(['name-in-head'])
    expect(found.candidates[0]?.commit).toBeNull()
  })

  it('answers with nothing rather than guessing, and never says "deleted"', () => {
    const found = withStore((store) =>
      continuationOf(root, store, 'src/gone.ts#neverExisted'),
    )
    expect(found.candidates).toEqual([])
    expect(found.withheld).toBe(0)
  })

  it('answers with nothing for a subject that has no name to match', () => {
    expect(
      withStore((store) => continuationOf(root, store, '')).candidates,
    ).toEqual([])
  })

  it('ranks a corroborated rename above a bare name match', () => {
    // A second file at `HEAD` declares the same name, so the swept file's
    // destination and this one are both candidates — and only one of them has
    // git behind it.
    write(
      'src/other.ts',
      'export function alpha(): string {\n  return "other"\n}\n',
    )
    git('add', '-A')
    git('commit', '-qm', 'a second alpha')
    sweep()
    const found = withStore((store) =>
      continuationOf(root, store, 'src/old/alpha.ts#alpha'),
    )
    expect(found.candidates.map((one) => one.id)).toEqual([
      'src/new/alpha.ts#alpha',
      'src/other.ts#alpha',
    ])
  })

  it('caps the list and counts what it withheld, rather than suppressing it', () => {
    for (let at = 0; at < CANDIDATE_LIMIT + 3; at += 1) {
      write(
        `src/many${at}.ts`,
        `export function common(): number {\n  return ${at}\n}\n`,
      )
    }
    git('add', '-A')
    git('commit', '-qm', 'many')
    const found = withStore((store) => continuationOf(root, store, 'common'))
    expect(found.candidates).toHaveLength(CANDIDATE_LIMIT)
    expect(found.withheld).toBe(3)
  })

  it('never offers a local symbol as a candidate', () => {
    write(
      'src/local.ts',
      'export function outer(): number {\n' +
        '  const hidden = (): number => 1\n' +
        '  return hidden()\n' +
        '}\n',
    )
    git('add', '-A')
    git('commit', '-qm', 'a local')
    const found = withStore((store) => continuationOf(root, store, 'hidden'))
    expect(found.candidates).toEqual([])
  })
})
