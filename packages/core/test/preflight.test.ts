/**
 * The environment under a repository, and what moves when it changes.
 *
 * ADR 0001 required the fingerprint for one failure in particular: analyse a
 * fresh clone, install, and every answer afterwards is served from facts
 * extracted with no types at all — confidently wrong by caching, with nothing in
 * the tree changed to give it away. These pin that case, and the two edges
 * either side of it: what must *not* trigger a re-analysis, and what a caller is
 * told when it does.
 */

import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { walkSourceFiles } from '../src/drift.ts'
import { preflightProjects } from '../src/preflight/index.ts'
import { readConfig } from '../src/preflight/tsconfig.ts'
import { openSession } from '../src/session/index.ts'

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'basic',
)
let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'codedocs-preflight-'))
  cpSync(fixture, root, { recursive: true })
  writeFileSync(
    join(root, 'package.json'),
    '{"name":"fixture","private":true,"scripts":{"postinstall":"generate"}}\n',
  )
  writeFileSync(join(root, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n")
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

/** Open a session, take what the test needs from it, and close it. */
function session<T>(read: (open: ReturnType<typeof openSession>) => T): T {
  const open = openSession({ cwd: root, noUpdate: false })
  try {
    return read(open)
  } finally {
    open.close()
  }
}

/** Install, as far as anything below this module can tell one apart. */
function install(): void {
  mkdirSync(join(root, 'node_modules', 'left-pad'), { recursive: true })
  writeFileSync(
    join(root, 'node_modules', 'left-pad', 'index.d.ts'),
    'export {}\n',
  )
}

describe('an install after a cold analysis', () => {
  it('re-analyses the project, and says so, rather than serving the cached fidelity', () => {
    const before = session((open) => open.context.conditions)
    expect(before).toEqual([
      {
        project: 'tsconfig.json',
        fidelity: 'syntactic',
        analysedAt: expect.any(String),
        cause: 'unprepared',
        postinstall: true,
      },
    ])

    install()

    const after = session((open) => ({
      conditions: open.context.conditions,
      repair: open.repair,
    }))
    expect(after.conditions[0]?.fidelity).toBe('typed')
    expect(after.conditions[0]?.cause).toBeNull()
    // Reported as its own event: no file changed, so a caller reading only the
    // file count would see a re-extraction it could not account for.
    expect(after.repair?.environment).toEqual(['tsconfig.json'])
    expect(after.repair?.files).toBeGreaterThan(0)
  })

  it('leaves the index alone on the next question', () => {
    session((open) => open.context)
    install()
    session((open) => open.repair)

    expect(session((open) => open.repair)).toBeNull()
  })
})

describe('what does not move the fingerprint', () => {
  it('a hand-modified node_modules under an unchanged lockfile', () => {
    install()
    session((open) => open.context)

    // The accepted blind spot ADR 0009 names: the fingerprint hashes the
    // lockfile, not the tree it produced, so editing that tree is invisible.
    // `doctor --measure` is the escape hatch, and it is not built yet.
    writeFileSync(
      join(root, 'node_modules', 'left-pad', 'index.d.ts'),
      'export const pad: number\n',
    )
    expect(session((open) => open.repair)).toBeNull()
  })

  it('an ordinary source file appearing, which the wave repairs file by file', () => {
    session((open) => open.context)

    writeFileSync(join(root, 'src', 'extra.ts'), 'export const extra = 1\n')

    const repair = session((open) => open.repair)
    expect(repair?.environment).toEqual([])
    expect(repair?.files).toBe(1)
  })
})

describe('what does move it', () => {
  it('a declaration file appearing, which retypes files that never import it', () => {
    session((open) => open.context)

    writeFileSync(join(root, 'src', 'generated.d.ts'), 'declare const gen: 1\n')

    const repair = session((open) => open.repair)
    expect(repair?.environment).toEqual(['tsconfig.json'])
  })

  it('a change to the project’s compilerOptions', () => {
    session((open) => open.context)

    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { target: 'ES2015', jsx: 'react-jsx', strict: true },
        include: ['src'],
      }),
    )

    expect(session((open) => open.repair)?.environment).toEqual([
      'tsconfig.json',
    ])
  })

  it('a change to the lockfile', () => {
    install()
    session((open) => open.context)

    writeFileSync(
      join(root, 'pnpm-lock.yaml'),
      "lockfileVersion: '9.0'\n# more\n",
    )

    expect(session((open) => open.repair)?.environment).toEqual([
      'tsconfig.json',
    ])
  })
})

describe('--no-update over a moved environment', () => {
  it('answers anyway, and names the project rather than going silent', () => {
    session((open) => open.context)
    install()

    const open = openSession({ cwd: root, noUpdate: true })
    try {
      expect(open.context.blindSpots).toEqual([
        {
          subject: 'tsconfig.json',
          reason: expect.stringContaining('environment changed'),
        },
      ])
      // The stored fidelity is still what the facts were extracted under, which
      // is the point of storing it rather than measuring it per question.
      expect(open.context.conditions[0]?.fidelity).toBe('syntactic')
    } finally {
      open.close()
    }
  })
})

describe('the fingerprint itself', () => {
  it('is stable over an unchanged tree', () => {
    const of = (): string =>
      preflightProjects(root, ['tsconfig.json'], walkSourceFiles(root)).get(
        'tsconfig.json',
      )!.fingerprint
    expect(of()).toBe(of())
  })

  it('follows a relative `extends` and ignores a bare one', () => {
    // A bare specifier resolves inside `node_modules`, which nothing in
    // preflight may walk — and a change to it is a change to the lockfile the
    // fingerprint already hashes.
    // `extends` without a `.json` suffix, which TypeScript adds for you.
    writeFileSync(
      join(root, 'tsconfig.base.json'),
      JSON.stringify({ compilerOptions: { strict: true } }),
    )
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({ extends: './tsconfig.base', include: ['src'] }),
    )
    expect(
      readConfig(join(root, 'tsconfig.json')).compilerOptions['strict'],
    ).toBe(true)

    // A bare specifier is not followed at all, so nothing is inherited.
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({ extends: '@tsconfig/node24', include: ['src'] }),
    )
    expect(
      readConfig(join(root, 'tsconfig.json')).compilerOptions['strict'],
    ).toBeUndefined()
  })

  it('stops on a cyclic `extends`, which is the repository’s bug and not ours', () => {
    writeFileSync(
      join(root, 'tsconfig.a.json'),
      JSON.stringify({ extends: './tsconfig.b.json' }),
    )
    writeFileSync(
      join(root, 'tsconfig.b.json'),
      JSON.stringify({
        extends: './tsconfig.a.json',
        compilerOptions: { strict: true },
      }),
    )
    expect(
      readConfig(join(root, 'tsconfig.a.json')).compilerOptions['strict'],
    ).toBe(true)
  })

  it('reads a config the project does not glob, so a shared base counts', () => {
    writeFileSync(
      join(root, 'tsconfig.base.json'),
      JSON.stringify({ compilerOptions: { strict: true } }),
    )
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({ extends: './tsconfig.base.json', include: ['src'] }),
    )
    const of = (): string =>
      preflightProjects(root, ['tsconfig.json'], walkSourceFiles(root)).get(
        'tsconfig.json',
      )!.fingerprint
    const before = of()

    writeFileSync(
      join(root, 'tsconfig.base.json'),
      JSON.stringify({ compilerOptions: { strict: false } }),
    )
    expect(of()).not.toBe(before)
  })
})
