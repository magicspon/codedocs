/**
 * `docs draft` through the CLI binding: where the Markdown goes, and what
 * codedocs refuses to do with it.
 *
 * ADR 0013 lands a draft beside the code it is about — `docs/<file>.<symbol>.md`
 * next to the file the subject is declared in — so `--out` is an override and
 * `--out -` is the way to a pipe. The refusal to overwrite is the other half,
 * and it still hands the draft over, so a caller who has to move a file out of
 * the way does not pay for the answer twice.
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

import { derivedDraftPath } from '../src/draft-out.ts'
import { run } from '../src/main.ts'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = join(here, '..', '..', 'core', 'test', 'fixtures', 'basic')
let root: string
let out: string
/** Where a draft of `checkout` goes when nobody said where. */
let derived: string

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'codedocs-draft-cli-'))
  cpSync(fixture, root, { recursive: true })
  cpSync(join(here, 'package.fixture.json'), join(root, 'package.json'))
  out = join(root, 'notes.md')
  derived = join(root, 'src', 'docs', 'checkout.checkout.md')
})

afterEach(() => {
  rmSync(out, { force: true })
  rmSync(join(root, 'src', 'docs'), { recursive: true, force: true })
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

const invoke = (...args: string[]): ReturnType<typeof run> =>
  run([...args, '--cwd', root, '--no-color'])

describe('where the draft goes', () => {
  it('writes it beside the code, in a `docs` folder it creates', () => {
    const result = invoke('docs', 'draft', 'checkout')
    expect(result.code).toBe(0)
    expect(result.stdout).toContain(derived)
    expect(readFileSync(derived, 'utf8')).toContain('## checkout')
  })

  it('drops the symbol part for a subject that names a file', () => {
    const result = invoke('docs', 'draft', 'src/checkout.ts')
    expect(result.code).toBe(0)
    const path = join(root, 'src', 'docs', 'checkout.md')
    expect(readFileSync(path, 'utf8')).toContain('## src/checkout.ts')
  })

  it('writes the file `--out` names instead, and says where it went', () => {
    const result = invoke('docs', 'draft', 'checkout', '--out', out)
    expect(result.code).toBe(0)
    expect(result.stdout).toContain(out)
    expect(readFileSync(out, 'utf8')).toContain('## checkout')
    expect(existsSync(derived)).toBe(false)
  })

  it('puts the Markdown on stdout and its note on stderr for `--out -`', () => {
    const result = invoke('docs', 'draft', 'checkout', '--out', '-')
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('## checkout')
    expect(result.stdout).toContain('<!-- codedocs?:')
    // Nothing about the run leaks into the bytes somebody is redirecting.
    expect(result.stdout).not.toContain('candidate claim')
    expect(result.stderr).toContain('candidate claim')
    expect(existsSync(derived)).toBe(false)
  })

  it('carries the Markdown in the envelope under `--json`', () => {
    const parsed: unknown = JSON.parse(
      invoke('docs', 'draft', 'checkout', '--json', '--out', '-').stdout,
    )
    expect(parsed).toMatchObject({
      operation: 'docs draft',
      result: { sections: [{ heading: 'checkout' }] },
    })
  })
})

describe('what it refuses', () => {
  it('will not overwrite the file it derived, and hands the draft over anyway', () => {
    invoke('docs', 'draft', 'checkout')
    writeFileSync(derived, '# mine\n')
    const result = invoke('docs', 'draft', 'checkout')
    expect(result.code).toBe(2)
    // Named as the repository spells it, which is where codedocs put it.
    expect(result.stderr).toContain(
      'src/docs/checkout.checkout.md already exists',
    )
    expect(result.stdout).toContain('## checkout')
    expect(readFileSync(derived, 'utf8')).toBe('# mine\n')
  })

  it('will not overwrite the file `--out` names either', () => {
    writeFileSync(out, '# mine\n')
    const result = invoke('docs', 'draft', 'checkout', '--out', out)
    expect(result.code).toBe(2)
    expect(result.stderr).toContain('already exists')
    expect(result.stdout).toContain('## checkout')
    expect(readFileSync(out, 'utf8')).toBe('# mine\n')
  })

  it('writes nothing for a subject that matched nothing', () => {
    // The file would say only that nothing matched, and the note says that
    // already. Creating it is the one write nobody asked for — and there is no
    // subject to derive a path from in the first place.
    const result = invoke('docs', 'draft', 'NoSuchThing')
    expect(result.code).toBe(0)
    expect(result.stderr).toContain('matched no symbol')
    expect(existsSync(join(root, 'src', 'docs'))).toBe(false)
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
    invoke('docs', 'draft', 'checkout')
    const checked = invoke('docs', 'check')
    expect(checked.code).toBe(0)
    expect(checked.stdout).not.toContain('checkout.checkout.md')
  })

  it('becomes one when a `?` is deleted', () => {
    invoke('docs', 'draft', 'checkout')
    writeFileSync(
      derived,
      readFileSync(derived, 'utf8').replace(
        '<!-- codedocs?:',
        '<!-- codedocs:',
      ),
    )
    expect(invoke('docs', 'check').stdout).toContain('checkout.checkout.md')
  })
})

describe('the path a draft derives', () => {
  const derive = (subject: string): string | null =>
    derivedDraftPath([{ heading: subject, subject, candidates: [] }], '/repo')

  it('names the file and the symbol, beside the file', () => {
    expect(derive('src/checkout/service.ts#CheckoutService.charge')).toBe(
      join(
        '/repo',
        'src',
        'checkout',
        'docs',
        'service.CheckoutService.charge.md',
      ),
    )
  })

  it('drops the symbol part for a file', () => {
    expect(derive('src/checkout/service.ts')).toBe(
      join('/repo', 'src', 'checkout', 'docs', 'service.md'),
    )
  })

  it('keeps a file at the repository root at the root', () => {
    expect(derive('index.ts')).toBe(join('/repo', 'docs', 'index.md'))
  })

  it('will not turn a separator in a descriptor into a directory', () => {
    // An object-literal key is a [[Descriptor path]] segment and can be a
    // string, so the name it contributes is not a path segment until it is made
    // one — otherwise codedocs derives a directory out of somebody's literal.
    expect(derive('src/routes.ts#routes.a/b')).toBe(
      join('/repo', 'src', 'docs', 'routes.routes.a-b.md'),
    )
  })

  it('has no path for a draft with no section', () => {
    expect(derivedDraftPath([], '/repo')).toBeNull()
  })
})
