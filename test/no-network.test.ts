/**
 * The invariant of ADR 0011: no codedocs package reaches the network.
 *
 * Two halves are tested, because the check has two halves. The dependency
 * closure is `scripts/no-network.ts`, tested here directly. First-party source
 * is oxlint's `no-restricted-imports` and `no-restricted-globals`, tested by
 * running the repository's own config over a planted file — a lint rule that is
 * configured but not loaded fails silently, which is the failure mode a "no
 * network" promise can least afford.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import {
  audit,
  findNetworkUses,
  isAllowed,
  report,
  scanPackage,
  type NetworkAudit,
} from '../scripts/no-network.ts'

const root = resolve(import.meta.dirname, '..')

describe('the dependency closure', () => {
  it('reaches the network nowhere', () => {
    const result = audit(root)

    // Named, not counted: a failure should say which dependency and where.
    expect(report(result).split('\n')[0]).toBe(
      'No codedocs package reaches the network.',
    )
    expect(result.reach).toEqual([])
  })
})

describe('findNetworkUses', () => {
  // Each shape a dependency can arrive at the network by. A check that has
  // never failed is indistinguishable from one that cannot.
  it.each([
    ['a static import', `import { get } from 'node:https'`],
    ['a bare specifier', `import net from 'net'`],
    ['a side-effect import', `import 'node:dgram'`],
    ['a require', `const dns = require("dns")`],
    ['a dynamic import', `const { createServer } = await import("node:http2")`],
    ['a re-export', `export { connect } from 'node:tls'`],
    ['fetch', `const r = await fetch(url)`],
    ['fetch off the global object', `globalThis.fetch(url)`],
    ['a socket', `const s = new WebSocket(url)`],
    ['a beacon', `navigator.sendBeacon(url, body)`],
  ])('sees %s', (_shape, source) => {
    expect(findNetworkUses(source, 'a.js')).not.toEqual([])
  })

  it('reports the line, so a bundle can be judged rather than only failed', () => {
    const source = ['const a = 1', '', 'const b = require("node:net")'].join(
      '\n',
    )

    expect(findNetworkUses(source, 'a.js')).toEqual([
      { file: 'a.js', line: 3, evidence: 'require("node:net"' },
    ])
  })

  it.each([
    ["a method of somebody else's client", `client.fetch(query)`],
    ['a longer module name', `import x from 'network-thing'`],
  ])('does not see %s', (_shape, source) => {
    expect(findNetworkUses(source, 'a.js')).toEqual([])
  })
})

describe('isAllowed', () => {
  const use = { file: 'a.js', line: 1, evidence: 'require("node:net")' }

  it('allows the socket typescript opens to its own compiler', () => {
    expect(isAllowed('typescript', use)).toBe(true)
  })

  it('allows it to that package only', () => {
    expect(isAllowed('some-other-package', use)).toBe(false)
  })

  it('allows that module only, never the package outright', () => {
    expect(isAllowed('typescript', { ...use, evidence: 'fetch(' })).toBe(false)
  })
})

describe('the lint half', () => {
  const directory = mkdtempSync(join(tmpdir(), 'codedocs-no-network-'))

  afterAll(() => {
    rmSync(directory, { recursive: true, force: true })
  })

  /** Lints one file with the repository's own config, and returns the output. */
  function lint(source: string): string {
    const file = join(directory, 'planted.ts')
    writeFileSync(file, source)

    try {
      execFileSync(
        join(root, 'node_modules/.bin/oxlint'),
        ['-c', '.oxlintrc.json', file],
        {
          cwd: root,
          encoding: 'utf8',
        },
      )
      return ''
    } catch (error) {
      // oxlint exits 1 on a finding; the report is on stdout either way.
      return (error as { stdout: string }).stdout
    }
  }

  it('refuses a network import in first-party source', () => {
    expect(
      lint(`import { get } from 'node:https'\nexport const x = get\n`),
    ).toContain('no-restricted-imports')
  })

  it('refuses fetch in first-party source', () => {
    expect(
      lint(`export const x = (): Promise<Response> => fetch('/a')\n`),
    ).toContain('no-restricted-globals')
  })

  it('allows a module name that only appears in a comment', () => {
    expect(lint(`// never node:http\nexport const x = 1\n`)).toBe('')
  })
})

describe('scanPackage', () => {
  const directory = mkdtempSync(join(tmpdir(), 'codedocs-scan-'))

  afterAll(() => {
    rmSync(directory, { recursive: true, force: true })
  })

  it('reads a package’s own code and nothing it merely ships beside it', () => {
    writeFileSync(join(directory, 'index.js'), "const net = require('net')\n")
    writeFileSync(
      join(directory, 'index.d.ts'),
      'export declare const x: number\n',
    )
    writeFileSync(join(directory, 'README.md'), '`require("node:http")`\n')
    mkdirSync(join(directory, 'lib'), { recursive: true })
    writeFileSync(join(directory, 'lib', 'deep.mjs'), 'await fetch(url)\n')
    // A package nested inside another is that package's to answer for, and the
    // closure walk reaches it on its own.
    mkdirSync(join(directory, 'node_modules', 'nested'), { recursive: true })
    writeFileSync(
      join(directory, 'node_modules', 'nested', 'index.js'),
      "require('node:dgram')\n",
    )

    const uses = scanPackage(directory)
    expect(uses.map((use) => use.file).sort()).toEqual([
      'index.js',
      'lib/deep.mjs',
    ])
  })
})

describe('the report', () => {
  const use = (line: number) => ({
    file: 'index.js',
    line,
    evidence: `require("node:net") // ${line}`,
  })

  const audited = (result: Partial<NetworkAudit>): string =>
    report({ reach: [], unread: [], ...result })

  it('says plainly that nothing reaches the network', () => {
    expect(audited({})).toBe('No codedocs package reaches the network.')
  })

  it('names the dependency, the chain that pulled it in, and where', () => {
    const text = audited({
      reach: [
        {
          dependency: 'chatty@1.0.0',
          path: '/somewhere/chatty',
          chain: ['@codedocs/core', 'chatty'],
          uses: [use(3)],
        },
      ],
    })
    expect(text).toContain('1 runtime dependency reaches the network:')
    expect(text).toContain('chatty@1.0.0  via @codedocs/core → chatty')
    expect(text).toContain('index.js:3')
    // The refusal names the ADR, so the fix is a decision rather than a patch.
    expect(text).toContain('ADR 0011')
  })

  it('counts the evidence it did not print, rather than filling a terminal', () => {
    // A minified bundle can match hundreds of times, and the hundredth match
    // tells a reader nothing the first did not.
    const text = audited({
      reach: [
        {
          dependency: 'chatty@1.0.0',
          path: '/somewhere/chatty',
          chain: ['chatty'],
          uses: Array.from({ length: 8 }, (_, at) => use(at + 1)),
        },
        {
          dependency: 'also@2.0.0',
          path: '/somewhere/also',
          chain: ['also'],
          uses: [use(1)],
        },
      ],
    })
    expect(text).toContain('2 runtime dependencies reach the network:')
    expect(text).toContain('…and 3 more')
  })

  it('names what this platform could not read, so a pass is not read as a proof', () => {
    const text = audited({
      unread: ['@esbuild/win32-x64@0.1.0', '@esbuild/linux-arm@0.1.0'],
    })
    expect(text).toContain('Not read: 2 optional packages')
    expect(text).toContain('@esbuild/win32-x64@0.1.0')
  })
})
