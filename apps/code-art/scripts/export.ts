/**
 * Turns one codedocs index into the JSON the art is drawn from.
 *
 *     pnpm --filter @codedocs/code-art export <repo-or-index.db> [name]
 */

import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { readAtlas } from './read-index.ts'

const [target, nameArg] = process.argv.slice(2)
if (target === undefined) {
  console.error('usage: export <repo-root | index.db> [name]')
  process.exit(1)
}

const dbPath = statSync(target).isDirectory()
  ? join(target, '.codedocs', 'index.db')
  : target
if (!existsSync(dbPath)) {
  console.error(`no index at ${dbPath} — run \`codedocs\` in that repo first`)
  process.exit(1)
}

// The repo root is two levels above `.codedocs/index.db`.
const name = nameArg ?? basename(resolve(dirname(dbPath), '..'))
const atlas = readAtlas(dbPath, name)

const outDir = join(import.meta.dirname, '..', 'src', 'data')
mkdirSync(outDir, { recursive: true })
const out = join(outDir, `${name}.json`)
writeFileSync(out, JSON.stringify(atlas))
console.log(
  `${name}: ${atlas.files.length} files, ${atlas.calls.length} call links, ${atlas.imports.length} imports → ${out}`,
)
