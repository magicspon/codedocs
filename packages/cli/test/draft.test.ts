/**
 * `docs draft` through the CLI binding: where the Markdown goes, and what
 * codedocs refuses to do with it.
 *
 * ADR 0013 puts the draft on stdout and the note beside it on stderr, for the
 * reason `report-bug --out -` does: the payload is what somebody is piping, and
 * a disclosure inside it is a disclosure inside their file. The refusal to
 * overwrite is the other half — and it still hands the draft over, so a caller
 * who has to move a file out of the way does not pay for the answer twice.
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
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { run } from '../src/main.ts'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = join(here, '..', '..', 'core', 'test', 'fixtures', 'basic')
let root: string
let out: string

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'codedocs-draft-cli-'))
  cpSync(fixture, root, { recursive: true })
  cpSync(join(here, 'package.fixture.json'), join(root, 'package.json'))
  out = join(root, 'notes.md')
})

afterEach(() => {
  rmSync(out, { force: true })
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

const invoke = (...args: string[]): ReturnType<typeof run> =>
  run([...args, '--cwd', root, '--no-color'])

describe('where the draft goes', () => {
  it('puts the Markdown on stdout and its note on stderr', () => {
    const result = invoke('docs', 'draft', 'checkout')
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('## checkout')
    expect(result.stdout).toContain('<!-- codedocs?:')
    // Nothing about the run leaks into the bytes somebody is redirecting.
    expect(result.stdout).not.toContain('candidate claim')
    expect(result.stderr).toContain('candidate claim')
    expect(result.stderr).toContain('pass --out')
  })

  it('writes the file `--out` names, and says where it went', () => {
    const result = invoke('docs', 'draft', 'checkout', '--out', out)
    expect(result.code).toBe(0)
    expect(result.stdout).toContain(out)
    expect(readFileSync(out, 'utf8')).toContain('## checkout')
  })

  it('carries the Markdown in the envelope under `--json`', () => {
    const parsed: unknown = JSON.parse(
      invoke('docs', 'draft', 'checkout', '--json').stdout,
    )
    expect(parsed).toMatchObject({
      operation: 'docs draft',
      result: { sections: [{ heading: 'checkout' }] },
    })
  })
})

describe('what it refuses', () => {
  it('will not overwrite an existing file, and hands the draft over anyway', () => {
    writeFileSync(out, '# mine\n')
    const result = invoke('docs', 'draft', 'checkout', '--out', out)
    expect(result.code).toBe(2)
    expect(result.stderr).toContain('already exists')
    expect(result.stdout).toContain('## checkout')
    expect(readFileSync(out, 'utf8')).toBe('# mine\n')
  })

  it('writes nothing for a subject that matched nothing', () => {
    // The file would say only that nothing matched, and the note says that
    // already. Creating it is the one write nobody asked for.
    const result = invoke('docs', 'draft', 'NoSuchThing', '--out', out)
    expect(result.code).toBe(0)
    expect(result.stderr).toContain('matched no symbol')
    expect(existsSync(out)).toBe(false)
  })

  it('refuses `--out` on an operation that does not take it', () => {
    expect(invoke('symbol', '*', '--out', out).stderr).toContain('not `symbol`')
  })

  it('refuses `--depth`, which a draft has no walk to bound', () => {
    expect(invoke('docs', 'draft', 'checkout', '--depth', '2').code).toBe(2)
  })
})

describe('what a drafted file is not', () => {
  it('is not a document `docs check` reads', () => {
    invoke('docs', 'draft', 'checkout', '--out', out)
    const checked = invoke('docs', 'check')
    expect(checked.code).toBe(0)
    expect(checked.stdout).not.toContain('notes.md')
  })

  it('becomes one when a `?` is deleted', () => {
    invoke('docs', 'draft', 'checkout', '--out', out)
    writeFileSync(
      out,
      readFileSync(out, 'utf8').replace('<!-- codedocs?:', '<!-- codedocs:'),
    )
    expect(invoke('docs', 'check').stdout).toContain('notes.md')
  })
})
