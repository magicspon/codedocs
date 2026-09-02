/**
 * The `SymbolId` scheme itself: the exact strings it produces, what it refuses
 * to let change one, and the shorthand it projects.
 *
 * ADR 0002 makes identity a normalised SCIP string, and both normalisations are
 * pinned here rather than described: a workspace `version` bump must change no
 * id, and a local is named by its descriptor path. The exact strings are pinned
 * too — a scheme nobody can read off a test is a scheme that drifts.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { analyse } from '../src/adapter/ts7/index.ts'
import type { SymbolNode } from '../src/model.ts'
import { openSession } from '../src/session/index.ts'
import { openStore, STORE_SCHEMA_VERSION } from '../src/store/index.ts'
import { resolveSubject } from '../src/operations/subject.ts'
import {
  ABSENT_PACKAGE,
  classOfKind,
  coarseClassOf,
  descriptor,
  dottedOf,
  fileOf,
  isSymbolId,
  NPM,
  parseSymbolId,
  shorthandOf,
  splitShorthand,
  symbolId,
  WORKSPACE_VERSION,
} from '../src/symbol-id.ts'

let root: string

const write = (path: string, content: string): void =>
  writeFileSync(join(root, path), content)

/** A manifest with a version, which is the field the scheme normalises away. */
const manifest = (name: string, version: string): string =>
  JSON.stringify({ name, version, private: true })

const SOURCE = `export class Calendar {
  url = 'https://example.test'
  read(): string {
    return this.url
  }
}

export function renderPage(): string {
  const t = 'title'
  return t
}

export namespace formats {
  export const iso = 'iso'
}
`

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'codedocs-symbol-id-'))
  mkdirSync(join(root, 'src'), { recursive: true })
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
  write('package.json', manifest('@fixture/pages', '1.4.2'))
  write('src/page.ts', SOURCE)
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

/** Every symbol the fixture yields, by the shorthand it projects to. */
function sweep(): Map<string, SymbolNode> {
  const result = analyse(root, ['tsconfig.json'])
  return new Map(result.symbols.map((node) => [shorthandOf(node.id), node]))
}

const idOf = (shorthand: string): string | undefined =>
  sweep().get(shorthand)?.id

describe('the scheme', () => {
  it('names a symbol in a workspace package', () => {
    expect(idOf('src/page.ts#Calendar.read')).toBe(
      'codedocs npm @fixture/pages . `src/page.ts`/Calendar#read().',
    )
  })

  it('names a local by its descriptor path, never by an ordinal', () => {
    // ADR 0002's own example. Nothing above `t` can disturb this name, which is
    // the whole reason `local 3` was refused.
    expect(idOf('src/page.ts#renderPage.t')).toBe(
      'codedocs npm @fixture/pages . `src/page.ts`/renderPage().t.',
    )
    expect(sweep().get('src/page.ts#renderPage.t')?.durable).toBe(false)
  })

  it('names a third-party symbol with its real version', () => {
    // The one place a version carries information: a third-party package's
    // symbols really do differ between versions, and nothing in this repository
    // renames them.
    expect(
      symbolId(
        { manager: 'npm', name: 'zod', version: '3.22.4' },
        'lib/types.d.ts',
        'ZodString#parse().',
      ),
    ).toBe('codedocs npm zod 3.22.4 `lib/types.d.ts`/ZodString#parse().')
  })

  it('gives a file with no manifest above it the absent-value placeholder', () => {
    rmSync(join(root, 'package.json'))
    expect(idOf('src/page.ts#Calendar')).toBe(
      'codedocs npm . . `src/page.ts`/Calendar#',
    )
  })
})

describe('the package a file is in', () => {
  it('reads a file at the repository root, which has no directory above it', () => {
    write(
      'root-level.ts',
      'export function atRoot(): number {\n  return 1\n}\n',
    )
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { target: 'ES2022', module: 'ESNext', noEmit: true },
        include: ['.'],
      }),
    )
    expect(idOf('root-level.ts#atRoot')).toContain('`root-level.ts`/')
  })

  it('stops at a manifest that declares no name, rather than borrowing one above it', () => {
    // A manifest is a package boundary whether or not it is a published one:
    // borrowing the name above would put the file in a package that does not
    // hold it.
    mkdirSync(join(root, 'src', 'nested'), { recursive: true })
    write(
      'src/nested/thing.ts',
      'export function nested(): number {\n  return 1\n}\n',
    )
    write('src/nested/package.json', '{"private":true}')
    expect(idOf('src/nested/thing.ts#nested')).toContain(
      `codedocs ${NPM} ${ABSENT_PACKAGE} `,
    )
  })
})

describe("ADR 0002's version normalisation", () => {
  it('leaves every id alone when a workspace version is bumped', () => {
    const before = [...sweep().values()].map((node) => node.id).sort()
    write('package.json', manifest('@fixture/pages', '2.0.0'))
    const after = [...sweep().values()].map((node) => node.id).sort()
    expect(after).toEqual(before)
    expect(after[0]).toContain(` ${WORKSPACE_VERSION} `)
  })

  it('does move an id when the package itself is renamed', () => {
    // The counter-case, so the test above cannot pass by the package field
    // being ignored altogether.
    const before = idOf('src/page.ts#Calendar')
    write('package.json', manifest('@fixture/renamed', '1.4.2'))
    expect(idOf('src/page.ts#Calendar')).not.toBe(before)
  })
})

describe('the coarse class', () => {
  it('is derived from the descriptor suffix', () => {
    const found = sweep()
    const classOf = (shorthand: string): string | undefined =>
      coarseClassOf(found.get(shorthand)?.id ?? '')

    expect(classOf('src/page.ts#Calendar')).toBe('type')
    expect(classOf('src/page.ts#Calendar.read')).toBe('method')
    expect(classOf('src/page.ts#Calendar.url')).toBe('term')
    expect(classOf('src/page.ts#formats')).toBe('namespace')
  })

  it('agrees with the fine kind it was written from', () => {
    for (const node of sweep().values()) {
      expect(coarseClassOf(node.id)).toBe(classOfKind(node.kind))
    }
  })

  it('is stored nowhere: the row holds the fine kind alone', () => {
    const store = openStore(root)
    try {
      const columns = (
        store.db.prepare('pragma table_info(symbol)').all() as {
          name: string
        }[]
      ).map((column) => column.name)
      expect(columns).toContain('kind')
      expect(columns).not.toContain('class')
    } finally {
      store.close()
    }
  })
})

describe("ADR 0006's three input forms", () => {
  it('all resolve to the same symbol, the full id included', () => {
    const session = openSession({ cwd: root, noUpdate: false })
    try {
      const id = resolveSubject(session.store, 'Calendar.read')[0]?.id
      expect(id).toBeDefined()
      const forms = [
        'Calendar.read', // A bare qualified name.
        'src/page.ts#Calendar.read', // ADR 0005's shorthand, with its path.
        id ?? '', // The `SymbolId` itself, pasted back from `--json`.
      ]
      for (const form of forms) {
        expect(
          resolveSubject(session.store, form).map((one) => one.id),
        ).toEqual([id])
      }
    } finally {
      session.close()
    }
  })
})

describe('a store from another schema version', () => {
  it('is discarded, and the rebuild says why', () => {
    execFileSync('git', ['init', '-q'], { cwd: root, stdio: 'ignore' })
    openSession({ cwd: root, noUpdate: false }).close()

    // Stamp the index as the previous schema, which is what an upgrade leaves
    // behind. ADR 0004 refuses to migrate it.
    const store = openStore(root)
    store.db.exec(`pragma user_version = ${STORE_SCHEMA_VERSION - 1}`)
    store.close()

    const session = openSession({ cwd: root, noUpdate: false })
    try {
      expect(session.repair?.reason).toContain(
        `store schema ${STORE_SCHEMA_VERSION - 1}`,
      )
      // Rebuilt rather than emptied: the answer is whole again.
      expect(resolveSubject(session.store, 'Calendar.read')).toHaveLength(1)
    } finally {
      session.close()
    }
  })
})

/**
 * Reading an id back, which ADR 0006 needs to be total over the scheme's own
 * output — a full id pasted back from `--json` has to find the symbol it names.
 *
 * Asserted on strings rather than through a session: the failure cases are the
 * point, and no repository can be planted that produces a malformed id.
 */
describe('reading an id back', () => {
  const workspace = {
    manager: NPM,
    name: '@app/web',
    version: WORKSPACE_VERSION,
  }

  it('splits an id into its package, its file and its descriptors', () => {
    const id = symbolId(workspace, 'src/pay.ts', 'charge().')
    expect(parseSymbolId(id)).toEqual({
      package: { manager: NPM, name: '@app/web', version: WORKSPACE_VERSION },
      file: 'src/pay.ts',
      descriptors: 'charge().',
    })
  })

  it('reads a space inside a field, which SCIP writes doubled', () => {
    const id = `codedocs ${NPM} a  name 1.0.0 \`src/pay.ts\`/charge().`
    expect(parseSymbolId(id)?.package.name).toBe('a name')
  })

  it('refuses anything that is not an id in this scheme', () => {
    expect(isSymbolId('src/pay.ts#charge')).toBe(false)
    expect(parseSymbolId('src/pay.ts#charge')).toBeUndefined()
    // Too few fields to be one.
    expect(parseSymbolId('codedocs npm @app/web')).toBeUndefined()
    // The first descriptor must be the file, and a file is a namespace.
    expect(parseSymbolId('codedocs npm . . charge().')).toBeUndefined()
    expect(parseSymbolId('codedocs npm . . 9')).toBeUndefined()
    // An unterminated escaped name is not a descriptor at all.
    expect(parseSymbolId('codedocs npm . . `src/pay.ts')).toBeUndefined()
  })

  it('answers for a file and for a symbol alike, which `CallSource` needs', () => {
    const id = symbolId(workspace, 'src/pay.ts', 'charge().')
    expect(fileOf(id)).toBe('src/pay.ts')
    // A `File` is its own path, so it answers as itself rather than as nothing.
    expect(fileOf('src/pay.ts')).toBe('src/pay.ts')
  })

  it('projects a shorthand, and passes a string that is not an id straight through', () => {
    const id = symbolId(workspace, 'src/pay.ts', 'Gateway#capture().')
    expect(shorthandOf(id)).toBe('src/pay.ts#Gateway.capture')
    // A file's id carries no descriptors, so its shorthand is the path alone.
    expect(shorthandOf(symbolId(workspace, 'src/pay.ts', ''))).toBe(
      'src/pay.ts',
    )
    expect(shorthandOf('src/pay.ts#charge')).toBe('src/pay.ts#charge')
  })

  it('projects nothing out of descriptors it cannot read', () => {
    expect(dottedOf('Gateway#capture().')).toBe('Gateway.capture')
    expect(dottedOf('not descriptors')).toBe('')
  })

  it('has no coarse class for a file, or for a string that is not an id', () => {
    expect(coarseClassOf(symbolId(workspace, 'src/pay.ts', ''))).toBeUndefined()
    expect(coarseClassOf('src/pay.ts')).toBeUndefined()
    expect(coarseClassOf('codedocs npm . . `src/pay.ts`/nope')).toBeUndefined()
  })

  it('escapes a name the grammar calls anything but simple, doubling a backtick', () => {
    expect(descriptor('charge', 'method')).toBe('charge().')
    expect(descriptor('with space', 'term')).toBe('`with space`.')
    expect(descriptor('back`tick', 'type')).toBe('`back``tick`#')
    // And reads it back, which is what makes the escape worth writing.
    const id = symbolId(
      { manager: NPM, name: ABSENT_PACKAGE, version: WORKSPACE_VERSION },
      'src/pay.ts',
      descriptor('back`tick', 'type'),
    )
    expect(shorthandOf(id)).toBe('src/pay.ts#back`tick')
  })

  it('splits a shorthand on its first `#`, and a bare name into no path at all', () => {
    expect(splitShorthand('src/pay.ts#Gateway.capture')).toEqual([
      'src/pay.ts',
      'Gateway.capture',
    ])
    expect(splitShorthand('charge')).toEqual(['charge', ''])
  })
})
