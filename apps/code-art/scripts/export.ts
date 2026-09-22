/**
 * Turns one codedocs index into the JSON the art is drawn from.
 *
 *     pnpm --filter @codedocs/code-art export <repo-or-index.db> [name] [--no-fallow]
 *
 * With fallow on the PATH, each file also gets its health readings.
 */

import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fromCaller } from './caller.ts'
import { readNames } from './read-names.ts'
import { snapshot } from './snapshot.ts'

const args = process.argv.slice(2)
const useFallow = !args.includes('--no-fallow')
const [given, nameArg] = args.filter((a) => a !== '--no-fallow')
if (given === undefined) {
  console.error('usage: export <repo-root | index.db> [name] [--no-fallow]')
  process.exit(1)
}
const target = fromCaller(given)

const dbPath = statSync(target).isDirectory()
  ? join(target, '.codedocs', 'index.db')
  : target
if (!existsSync(dbPath)) {
  console.error(`no index at ${dbPath} — run \`codedocs\` in that repo first`)
  process.exit(1)
}

// The repo root is two levels above `.codedocs/index.db`.
const root = resolve(dirname(dbPath), '..')
const name = nameArg ?? basename(root)
const atlas = snapshot(dbPath, { name, fallow: useFallow })
const scored = atlas.files.filter((f) => f.health?.score).length

const outDir = join(import.meta.dirname, '..', 'src', 'data')
mkdirSync(outDir, { recursive: true })
const out = join(outDir, `${name}.json`)
writeFileSync(out, JSON.stringify(atlas))
// The names ride separately, so the viewer reads them only when a file is picked.
writeFileSync(
  join(outDir, `${name}.symbols.json`),
  JSON.stringify(readNames(dbPath)),
)
console.log(
  `${name}: ${atlas.files.length} files, ${atlas.calls.length} call links, ${atlas.imports.length} imports, ${scored} scored by fallow → ${out}`,
)
