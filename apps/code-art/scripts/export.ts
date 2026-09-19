/**
 * Turns one codedocs index into the JSON the art is drawn from.
 *
 *     pnpm --filter @codedocs/code-art export <repo-or-index.db> [name] [--no-fallow]
 *
 * With fallow on the PATH, each file also gets its health readings.
 */

import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { withHealth } from './fallow-health.ts'
import { readAtlas } from './read-index.ts'
import { readFallow } from './read-fallow.ts'

const args = process.argv.slice(2)
const useFallow = !args.includes('--no-fallow')
const [target, nameArg] = args.filter((a) => a !== '--no-fallow')
if (target === undefined) {
  console.error('usage: export <repo-root | index.db> [name] [--no-fallow]')
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
const root = resolve(dirname(dbPath), '..')
const name = nameArg ?? basename(root)
const indexed = readAtlas(dbPath, name)
const reading = useFallow ? readFallow(root) : null
const atlas = reading
  ? withHealth(indexed, reading.report, reading.deadCode)
  : indexed
const scored = atlas.files.filter((f) => f.health?.score).length

const outDir = join(import.meta.dirname, '..', 'src', 'data')
mkdirSync(outDir, { recursive: true })
const out = join(outDir, `${name}.json`)
writeFileSync(out, JSON.stringify(atlas))
console.log(
  `${name}: ${atlas.files.length} files, ${atlas.calls.length} call links, ${atlas.imports.length} imports, ${scored} scored by fallow → ${out}`,
)
