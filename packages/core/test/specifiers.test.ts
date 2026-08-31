/**
 * Signal 4: the specifiers that resolved to nothing, and what a caller is told
 * about them.
 *
 * ADR 0009 turned the fourth signal from a ratio into per-specifier facts, on
 * one measurement: 306 of cal.com `apps/web`'s 576 are the single specifier
 * `@calcom/prisma/enums`. So the two things worth pinning are the cause each
 * specifier is given — a working repository must not be accused of defects it
 * does not have — and that the report is one fact with a count rather than 306
 * lines.
 */

import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { PreconditionCause } from '../src/model.ts'
import { symbol } from '../src/operations/symbol.ts'
import { classifySpecifiers } from '../src/preflight.ts'
import { openSession } from '../src/session.ts'

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'basic',
)
let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'codedocs-specifiers-'))
  cpSync(fixture, root, { recursive: true })
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'fixture',
      private: true,
      dependencies: { 'left-pad': '^1.0.0' },
    }),
  )
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

/** Put a file on disk, making its directory first. */
function write(path: string, content = 'export {}\n'): void {
  mkdirSync(join(root, dirname(path)), { recursive: true })
  writeFileSync(join(root, path), content)
}

/** The cause one specifier written in `src/app.ts` is given. */
function causeOf(specifier: string): PreconditionCause {
  const [found] = classifySpecifiers(
    root,
    [{ file: 'src/app.ts', specifier, line: 1 }],
    new Map([['src/app.ts', 'tsconfig.json']]),
  )
  return found!.cause
}

describe('why a specifier resolved to nothing', () => {
  it('is `unprepared` for a dependency that is declared and not installed', () => {
    expect(causeOf('left-pad')).toBe('unprepared')
  })

  it('is `missing-generated` for a subpath of a package that is on disk', () => {
    // cal.com's `@calcom/prisma/enums`, 306 sites behind one absent artefact.
    write('node_modules/@scope/pkg/package.json', '{"name":"@scope/pkg"}\n')
    expect(causeOf('@scope/pkg/enums')).toBe('missing-generated')
  })

  it('is `unmapped` for a package that is installed and carries no types', () => {
    // Installed, so nothing is missing; untyped, so the command that would fix
    // it is a guess. ADR 0009 keeps causes without a command out of `broken`.
    write('node_modules/untyped/index.js', 'module.exports = {}\n')
    expect(causeOf('untyped')).toBe('unmapped')
  })

  it('is `missing-generated` where the config maps it somewhere nothing wrote', () => {
    // Redwood's `types/graphql`: `paths` names `./types/*` and `yarn rw g types`
    // has not run.
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { baseUrl: '.', paths: { 'types/*': ['./types/*'] } },
        include: ['src'],
      }),
    )
    expect(causeOf('types/graphql')).toBe('missing-generated')
  })

  it('is `unmapped` for a first segment that is a real directory', () => {
    // cal.com's `app/…` imports, which only Next's own resolver finds. Filing
    // them as `broken` would accuse a working repository of 227 defects.
    write('app/page.tsx')
    expect(causeOf('app/_utils')).toBe('unmapped')
  })

  it('is `unmapped` for a relative target that is there but is not TypeScript', () => {
    write('src/styles.css', '.a { color: red }\n')
    expect(causeOf('./styles.css')).toBe('unmapped')
  })

  it('is `broken` only when nothing on disk matches at all', () => {
    expect(causeOf('./nowhere.ts')).toBe('broken')
    expect(causeOf('never-heard-of-it')).toBe('broken')
  })
})

describe('what an answer says about them', () => {
  it('reports one distinct specifier once, with the count of its sites', () => {
    write(
      'src/one.ts',
      "import 'left-pad'\nexport const one = (): number => 1\n",
    )
    write(
      'src/two.ts',
      "import 'left-pad'\nexport const two = (): number => 2\n",
    )

    const session = openSession({ cwd: root, noUpdate: false })
    try {
      // `*`, so the answer's files are every file in the fixture: `symbol`
      // takes a glob, and the two importers are what carry the specifier.
      const envelope = symbol(session.store, session.context, '*', null)
      const spots = envelope.blindSpots.filter(
        (spot) => spot.subject === 'left-pad',
      )
      expect(spots).toHaveLength(1)
      expect(spots[0]?.reason).toContain('2 site(s)')
      expect(spots[0]?.reason).toContain('install')
    } finally {
      session.close()
    }
  })

  it('does not carry a specifier from a file the answer never touched', () => {
    write(
      'src/elsewhere.ts',
      "import 'left-pad'\nexport const elsewhere = (): number => 3\n",
    )

    const session = openSession({ cwd: root, noUpdate: false })
    try {
      const envelope = symbol(session.store, session.context, 'charge', null)
      expect(envelope.blindSpots).toEqual([])
    } finally {
      session.close()
    }
  })
})
