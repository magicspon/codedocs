/**
 * Where the repository root lands, which decides both the project set and where
 * `.codedocs/index.db` is written.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { findRepositoryRoot } from '../src/discovery.ts'

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
