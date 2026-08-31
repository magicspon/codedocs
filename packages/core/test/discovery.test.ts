/**
 * Where the repository root lands, which decides both the project set and where
 * `.codedocs/index.db` is written.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_CONFIG, parseConfig } from '../src/config.ts'
import { discoverProjects, findRepositoryRoot } from '../src/discovery.ts'

let root: string

/** A directory, plus any of the markers that decide the root. */
function tree(
  path: string,
  markers: { git?: boolean; packageJson?: boolean } = {},
): string {
  mkdirSync(path, { recursive: true })
  if (markers.git) mkdirSync(join(path, '.git'))
  if (markers.packageJson) {
    writeFileSync(join(path, 'package.json'), '{"private":true}\n')
  }
  return path
}

beforeEach(() => {
  // The enclosing temp directory has no `.git` above it, so each case sees only
  // the markers it writes.
  root = mkdtempSync(join(tmpdir(), 'codedocs-discovery-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('findRepositoryRoot', () => {
  it('takes the enclosing `.git` over a nearer `package.json`', () => {
    const repository = tree(join(root, 'repo'), {
      git: true,
      packageJson: true,
    })
    const workspacePackage = tree(join(repository, 'packages', 'emails'), {
      packageJson: true,
    })

    expect(findRepositoryRoot(workspacePackage)).toBe(repository)
  })

  it('takes the `.git` even where no `package.json` sits beside it', () => {
    const repository = tree(join(root, 'repo'), { git: true })
    const workspacePackage = tree(join(repository, 'packages', 'emails'), {
      packageJson: true,
    })

    expect(findRepositoryRoot(workspacePackage)).toBe(repository)
  })

  it('reads a `.git` file, as a worktree or submodule has', () => {
    const repository = tree(join(root, 'repo'))
    writeFileSync(
      join(repository, '.git'),
      'gitdir: /elsewhere/.git/worktrees/w\n',
    )
    const workspacePackage = tree(join(repository, 'packages', 'emails'), {
      packageJson: true,
    })

    expect(findRepositoryRoot(workspacePackage)).toBe(repository)
  })

  it('falls back to the nearest `package.json` outside a repository', () => {
    const checkout = tree(join(root, 'checkout'), { packageJson: true })
    const nested = tree(join(checkout, 'src', 'deep'))

    expect(findRepositoryRoot(nested)).toBe(checkout)
  })

  it('prefers the nearest `package.json` of several, still outside a repository', () => {
    const checkout = tree(join(root, 'checkout'), { packageJson: true })
    const workspacePackage = tree(join(checkout, 'packages', 'emails'), {
      packageJson: true,
    })

    expect(findRepositoryRoot(workspacePackage)).toBe(workspacePackage)
  })

  it('falls back to where it started when neither marker exists', () => {
    const bare = tree(join(root, 'bare', 'src'))

    expect(findRepositoryRoot(bare)).toBe(bare)
  })
})

describe('discoverProjects', () => {
  /** A tree with a tsconfig in three places, one of them behind `repos/`. */
  function repository(): string {
    const path = tree(join(root, 'repo'), { git: true })
    for (const directory of [
      '',
      join('packages', 'core'),
      join('repos', 'cal.com'),
      join('repos', 'cal.com', 'packages', 'ui'),
    ]) {
      mkdirSync(join(path, directory), { recursive: true })
      writeFileSync(join(path, directory, 'tsconfig.json'), '{}\n')
    }
    writeFileSync(join(path, 'packages', 'core', 'tsconfig.build.json'), '{}\n')
    return path
  }

  it('finds every `tsconfig.json`, foreign checkouts included', () => {
    expect(discoverProjects(repository(), DEFAULT_CONFIG)).toEqual([
      'packages/core/tsconfig.json',
      'repos/cal.com/packages/ui/tsconfig.json',
      'repos/cal.com/tsconfig.json',
      'tsconfig.json',
    ])
  })

  it('`discover.skip` adds to the walk’s floor', () => {
    const config = parseConfig('{"discover":{"skip":["repos"]}}')

    expect(discoverProjects(repository(), config)).toEqual([
      'packages/core/tsconfig.json',
      'tsconfig.json',
    ])
  })

  it('cannot remove `node_modules` from the floor', () => {
    const path = repository()
    mkdirSync(join(path, 'node_modules', 'dep'), { recursive: true })
    writeFileSync(join(path, 'node_modules', 'dep', 'tsconfig.json'), '{}\n')
    // `skip` is additive, so naming nothing does not empty it.
    const config = parseConfig('{"discover":{"skip":[]}}')

    expect(discoverProjects(path, config)).not.toContain(
      'node_modules/dep/tsconfig.json',
    )
  })

  it('`discover.projects` unions with the walk rather than replacing it', () => {
    const config = parseConfig(
      '{"discover":{"projects":["packages/*/tsconfig.build.json"]}}',
    )

    expect(discoverProjects(repository(), config)).toEqual([
      'packages/core/tsconfig.build.json',
      'packages/core/tsconfig.json',
      'repos/cal.com/packages/ui/tsconfig.json',
      'repos/cal.com/tsconfig.json',
      'tsconfig.json',
    ])
  })

  it('keeps a literal `discover.projects` path the walk already found, once', () => {
    const config = parseConfig('{"discover":{"projects":["tsconfig.json"]}}')

    expect(
      discoverProjects(repository(), config).filter(
        (path) => path === 'tsconfig.json',
      ),
    ).toHaveLength(1)
  })

  it('refuses a second `codedocs.jsonc` below the root, naming both', () => {
    const path = repository()
    writeFileSync(join(path, 'packages', 'core', 'codedocs.jsonc'), '{}\n')

    expect(() => discoverProjects(path, DEFAULT_CONFIG)).toThrowError(
      /packages\/core\/codedocs\.jsonc is below the repository root/,
    )
  })

  it('allows the one at the root', () => {
    const path = repository()
    writeFileSync(join(path, 'codedocs.jsonc'), '{}\n')

    expect(() => discoverProjects(path, DEFAULT_CONFIG)).not.toThrow()
  })
})
