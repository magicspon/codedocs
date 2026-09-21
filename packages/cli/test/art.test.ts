/**
 * `codedocs art`, end to end over the core fixture, with a stand-in viewer: the
 * real one is a build output, and what matters here is what goes into it.
 */

import { execFileSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { art, parseArt, writeArt, type ArtIo } from '../src/art.ts'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = join(here, '..', '..', 'core', 'test', 'fixtures', 'basic')
let root: string
let io: ArtIo & { lines: string[] }

/** A throwaway identity, so the commits below need no global git config. */
const git = (...args: string[]): string =>
  execFileSync(
    'git',
    ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args],
    { encoding: 'utf8' },
  )

/**
 * Installed, never committed: each worktree borrows it. `workspace` is linked
 * the way pnpm links a workspace package, into the checkout itself, so an old
 * frame must be pointed at its own copy or none.
 */
function install(): void {
  const modules = join(root, 'node_modules')
  mkdirSync(join(modules, 'dep'), { recursive: true })
  mkdirSync(join(modules, '@scope', 'pkg'), { recursive: true })
  writeFileSync(join(modules, 'dep', 'index.js'), '')
  writeFileSync(join(modules, '@scope', 'pkg', 'index.js'), '')
  symlinkSync(join(root, 'workspace'), join(modules, 'workspace'))
}

/** Three commits: one that will not analyse, the fixture, and one more file. */
function commitHistory(): void {
  git('init', '--quiet')
  writeFileSync(join(root, 'codedocs.jsonc'), 'not json')
  git('add', '.')
  git('commit', '--quiet', '-m', 'broken')
  rmSync(join(root, 'codedocs.jsonc'))
  cpSync(fixture, root, { recursive: true })
  cpSync(join(here, 'package.fixture.json'), join(root, 'package.json'))
  writeFileSync(join(root, '.gitignore'), 'node_modules\n')
  mkdirSync(join(root, 'workspace'))
  writeFileSync(join(root, 'workspace', 'package.json'), '{}')
  git('add', '.')
  git('commit', '--quiet', '-m', 'first')
  writeFileSync(join(root, 'src', 'later.ts'), 'export const later = 1\n')
  git('add', '.')
  git('commit', '--quiet', '-m', 'second')
}

beforeAll(() => {
  // Real, because a workspace link is told apart by where it really points,
  // and macOS's temporary directory sits behind a symlink.
  root = realpathSync(mkdtempSync(join(tmpdir(), 'codedocs-art-')))
  commitHistory()
  install()

  const viewer = join(root, 'viewer.html')
  writeFileSync(viewer, '<body>\n<!-- codedocs-art:data -->\n</body>')
  const lines: string[] = []
  io = { viewer, log: (line) => lines.push(line), lines }
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

/** Dataset names in a written page, in order. */
const datasetsIn = (page: string): string[] =>
  [...page.matchAll(/data-dataset="([^"]+)"/g)].map((m) => m[1]!)

describe('parseArt', () => {
  it('defaults to the snapshot alone, with fallow', () => {
    expect(parseArt([], '/r')).toEqual({
      options: { cwd: '/r', frames: null, fallow: true },
    })
  })

  it('reads every flag', () => {
    expect(parseArt(['--frames', '4', '--no-fallow', '--cwd', '/x'])).toEqual({
      options: { cwd: '/x', frames: 4, fallow: false },
    })
  })

  it.each(['1', '0', 'lots', '2.5'])('refuses --frames %s', (frames) => {
    expect(parseArt(['--frames', frames])).toHaveProperty('error')
  })

  it('refuses an unknown flag rather than ignoring it', () => {
    expect(parseArt(['--json'])).toHaveProperty('error')
  })

  it('answers --help with an empty error, which is not a failure', () => {
    expect(parseArt(['--help'])).toEqual({ error: '' })
  })
})

describe('writeArt', () => {
  it('writes the snapshot into .codedocs/art/index.html', () => {
    const page = writeArt({ cwd: root, frames: null, fallow: false }, io)
    expect(page).toBe(join(root, '.codedocs', 'art', 'index.html'))
    expect(datasetsIn(readFileSync(page, 'utf8'))).toEqual([basename(root)])
  })

  it('adds a timeline with --frames, and keeps it on a later run without', () => {
    const name = basename(root)
    writeArt({ cwd: root, frames: 3, fallow: false }, io)
    const page = writeArt({ cwd: root, frames: null, fallow: false }, io)
    expect(datasetsIn(readFileSync(page, 'utf8'))).toEqual([
      name,
      `${name}.timeline`,
    ])
    const timeline = JSON.parse(
      readFileSync(
        join(root, '.codedocs', 'art', 'data', `${name}.timeline.json`),
        'utf8',
      ),
    )
    expect(timeline.commits.map((c: { subject: string }) => c.subject)).toEqual(
      ['broken', 'first', 'second'],
    )
    // The broken commit is an empty frame, not a failed timeline; the later
    // commit added a file, so the history must show it arriving.
    const paths = (k: number): string[] =>
      timeline.frames[k].files.map((f: { path: string }) => f.path)
    expect(paths(0)).toEqual([])
    expect(paths(1)).not.toContain('src/later.ts')
    expect(paths(2)).toContain('src/later.ts')
  })

  it('reads a frame it has built before from the cache', () => {
    io.lines.length = 0
    writeArt({ cwd: root, frames: 3, fallow: false }, io)
    expect(io.lines.filter((line) => line.endsWith('; cached'))).toHaveLength(3)
  })

  // Deterministic either way: fallow is optional, so a machine without it
  // still gets the art, only without health readings.
  it('writes the art when fallow is asked for, installed or not', () => {
    const page = writeArt({ cwd: root, frames: 3, fallow: true }, io)
    expect(datasetsIn(readFileSync(page, 'utf8'))).toHaveLength(2)
  })

  it('leaves no worktree behind', () => {
    expect(git('worktree', 'list').trim().split('\n')).toHaveLength(1)
  })
})

describe('art', () => {
  it('answers --help on stdout, as a success', () => {
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    try {
      expect(art(['--help'], io)).toBe(0)
      expect(String(write.mock.calls[0]?.[0])).toContain('codedocs art')
    } finally {
      write.mockRestore()
    }
  })

  it('cannot answer without a viewer, and says why', () => {
    const lines: string[] = []
    const missing = {
      viewer: join(root, 'nope.html'),
      log: (l: string) => lines.push(l),
    }
    expect(art(['--cwd', root, '--no-fallow'], missing)).toBe(2)
    expect(lines.join('\n')).toContain('no viewer')
    expect(existsSync(join(root, 'nope.html'))).toBe(false)
  })

  it('cannot answer a bad command line, and prints the usage', () => {
    const lines: string[] = []
    expect(art(['--frames', '1'], { ...io, log: (l) => lines.push(l) })).toBe(2)
    expect(lines.join('\n')).toContain('codedocs art [--frames <n>]')
  })
})
