#!/usr/bin/env node
/**
 * Publish every package to the local yalc store, as npm would publish them.
 *
 * `yalc publish` copies the working-tree `package.json` verbatim. That is wrong
 * here twice over, and both failures are silent:
 *
 * - `exports` points at `./src/*.ts` during development and is swapped for
 *   `./dist/*.js` by `publishConfig.exports` at publish time. yalc does not
 *   apply `publishConfig`, and `files` ships only `dist` — so a plain
 *   `yalc publish` produces a package whose every entry point resolves to a
 *   file that is not in it.
 * - Both adapters depend on `@homelync/mocker` as `workspace:^`. npm has no
 *   idea what that means, so `npm install` in the consumer dies.
 *
 * `pnpm pack` performs exactly the two transforms that publishing performs, so
 * we pack, unpack, and hand yalc the result. What lands in the store is then
 * byte-for-byte what a consumer would get from the registry — which is the only
 * version of "works locally" worth having.
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const PACKAGES = [
  'packages/mocker',
  'packages/mocker-next',
  'packages/mocker-storybook',
  'packages/mocker-playwright',
  'packages/mocker-cli',
]

/** Also push the new version into every project that has yalc-added it. */
const push = process.argv.includes('--push')

const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'inherit'],
  }).toString()

for (const pkgDir of PACKAGES) {
  const stage = mkdtempSync(join(tmpdir(), 'yalc-'))

  try {
    run(
      'pnpm',
      ['--dir', join(ROOT, pkgDir), 'pack', '--pack-destination', stage],
      ROOT,
    )

    const tarball = readdirSync(stage).find((f) => f.endsWith('.tgz'))
    if (tarball === undefined)
      throw new Error(`pnpm pack produced no tarball for ${pkgDir}`)

    // Tarballs unpack into a directory literally named `package`.
    run('tar', ['-xzf', tarball], stage)
    const unpacked = join(stage, 'package')

    // `--no-scripts`: the staged copy still carries a `build` script it has no
    // toolchain to run, and there is nothing left to build in any case.
    process.stdout.write(
      run(
        'yalc',
        push
          ? ['publish', '--push', '--no-scripts']
          : ['publish', '--no-scripts'],
        unpacked,
      ),
    )
  } finally {
    rmSync(stage, { recursive: true, force: true })
  }
}
