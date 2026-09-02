/**
 * Signal 3, on its own: which files a `tsconfig` globs.
 *
 * ADR 0009 needs this to be a **deterministic function of the working tree**
 * rather than the TypeScript server's file list — the server's list costs an
 * open program, which is the 3.7 s per project a diagnostic must not spend. So
 * the glob vocabulary is codedocs' own reading, and it is worth pinning against
 * the patterns real repositories write.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import { globbedFiles } from '../src/preflight/glob.ts'
import { readJsonc, upward } from '../src/preflight/fs.ts'
import type { ProjectConfig } from '../src/preflight/tsconfig.ts'

/** A config with only the keys one case is about. */
const config = (overrides: Partial<ProjectConfig> = {}): ProjectConfig => ({
  compilerOptions: {},
  files: undefined,
  include: undefined,
  exclude: undefined,
  ...overrides,
})

const TREE = [
  'src/app.ts',
  'src/deep/inner.ts',
  'src/styles.css',
  'types/next-auth.d.ts',
  'dist/app.js',
  'node_modules/left-pad/index.js',
  'apps/web/src/page.tsx',
  'apps/web/tsconfig.json',
]

const globbed = (
  configPath: string,
  one: Partial<ProjectConfig> = {},
): string[] => globbedFiles('/repo', configPath, config(one), TREE)

describe('what a config globs', () => {
  it('globs everything beneath itself where it names neither `files` nor `include`', () => {
    const found = globbed('tsconfig.json')
    expect(found).toContain('src/app.ts')
    expect(found).toContain('apps/web/src/page.tsx')
    // TypeScript's own default excludes apply without being written down.
    expect(found).not.toContain('node_modules/left-pad/index.js')
  })

  it('globs nothing but the files it names, where it names only `files`', () => {
    expect(globbed('tsconfig.json', { files: ['src/app.ts'] })).toEqual([
      'src/app.ts',
    ])
  })

  it('takes `files` alongside `include`, rather than instead of it', () => {
    const found = globbed('tsconfig.json', {
      include: ['src'],
      files: ['types/next-auth.d.ts'],
    })
    expect(found).toContain('src/app.ts')
    expect(found).toContain('types/next-auth.d.ts')
  })

  it('reads a bare directory as everything beneath it', () => {
    const found = globbed('tsconfig.json', { include: ['src'] })
    expect(found).toEqual(['src/app.ts', 'src/deep/inner.ts', 'src/styles.css'])
  })

  it('stops `*` at a separator and lets `**` cross one', () => {
    expect(globbed('tsconfig.json', { include: ['src/*.ts'] })).toEqual([
      'src/app.ts',
    ])
    expect(globbed('tsconfig.json', { include: ['src/**/*.ts'] })).toEqual([
      'src/app.ts',
      'src/deep/inner.ts',
    ])
  })

  it('matches one character with `?`', () => {
    expect(globbed('tsconfig.json', { include: ['src/ap?.ts'] })).toEqual([
      'src/app.ts',
    ])
  })

  it('resolves a pattern against the config’s own directory', () => {
    // cal.com writes both `"."` and `"../types/…"`, and neither is a path until
    // it is joined to the config that wrote it.
    expect(globbed('apps/web/tsconfig.json', { include: ['.'] })).toEqual([
      'apps/web/src/page.tsx',
      'apps/web/tsconfig.json',
    ])
    expect(
      globbed('apps/web/tsconfig.json', { include: ['../../types'] }),
    ).toEqual(['types/next-auth.d.ts'])
  })

  it('reads a leading slash as relative to the config, not to the machine', () => {
    expect(globbed('tsconfig.json', { include: ['/src/*.ts'] })).toEqual([
      'src/app.ts',
    ])
  })

  it('excludes the build output a config names, without being told to', () => {
    const found = globbed('tsconfig.json', {
      include: ['**/*'],
      compilerOptions: { outDir: 'dist' },
    })
    expect(found).not.toContain('dist/app.js')
    // Naming `exclude` replaces the defaults, which is TypeScript's own rule.
    expect(
      globbed('tsconfig.json', { include: ['**/*'], exclude: ['src'] }),
    ).toContain('node_modules/left-pad/index.js')
  })
})

describe('the filesystem primitives underneath it', () => {
  it('stops walking upward at the repository root', () => {
    expect(upward('/repo', '/repo/apps/web', () => undefined)).toBeUndefined()
    expect(upward('/repo', '/repo/apps/web', (at) => at)).toBe('/repo/apps/web')
    // A `from` outside the root walks to the filesystem root and stops there,
    // rather than looping.
    expect(upward('/repo', '/elsewhere/deep', () => undefined)).toBeUndefined()
  })

  it('has no answer for a file that is absent or is not JSON', () => {
    expect(readJsonc('/definitely/not/a/file.json')).toBeUndefined()
  })

  describe('readJsonc', () => {
    const directory = mkdtempSync(join(tmpdir(), 'codedocs-jsonc-'))

    afterAll(() => {
      rmSync(directory, { recursive: true, force: true })
    })

    /** Write one file and read it back through the parser. */
    const parsed = (text: string): Record<string, unknown> | undefined => {
      const path = join(directory, 'tsconfig.json')
      writeFileSync(path, text)
      return readJsonc(path)
    }

    it('reads the comments and trailing commas a `tsconfig` is allowed', () => {
      expect(
        parsed(
          [
            '{',
            '  // a line comment',
            '  /* and a block one */',
            '  "compilerOptions": { "strict": true },',
            '}',
          ].join('\n'),
        ),
      ).toEqual({ compilerOptions: { strict: true } })
    })

    it('leaves a comment marker inside a string alone', () => {
      expect(parsed('{"include": ["a//b", "c/*d", "e\\"f"]}')).toEqual({
        include: ['a//b', 'c/*d', 'e"f'],
      })
    })

    it('reads a comment that runs to the end of the file', () => {
      expect(parsed('{"strict": true}\n// trailing')).toEqual({ strict: true })
      expect(parsed('{"strict": true}\n/* never closed')).toEqual({
        strict: true,
      })
    })

    it('has no answer for a config it cannot parse, rather than refusing to answer', () => {
      // A config codedocs cannot parse fingerprints as an empty one, so an edit
      // that makes it parse again re-analyses the project.
      expect(parsed('{ nope }')).toBeUndefined()
      // An unterminated string runs to the end of the file and still fails.
      expect(parsed('{"include": ["a')).toBeUndefined()
    })

    it('reads a file that parses to something other than an object as empty', () => {
      expect(parsed('[1, 2]')).toEqual({})
    })
  })
})
