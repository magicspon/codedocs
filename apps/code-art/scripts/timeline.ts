/**
 * Builds a timeline into `src/data` for the dev viewer.
 *
 *     pnpm --filter @codedocs/code-art timeline <repo> [--frames 16] [--name x] [--no-fallow]
 *
 * `codedocs art --frames` does the same for a published install; this runs
 * the workspace build of the CLI, so it needs `pnpm build` first.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { fromCaller } from './caller.ts'
import { buildTimeline } from './history.ts'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    frames: { type: 'string', default: '16' },
    name: { type: 'string' },
    'no-fallow': { type: 'boolean', default: false },
  },
})
const repo = fromCaller(positionals[0] ?? '.')
const name = values.name ?? basename(repo)
const here = import.meta.dirname
const cli = resolve(here, '../../../packages/cli/dist/bin.js')
if (!existsSync(cli)) {
  console.error(
    `no codedocs build at ${cli} — run \`pnpm build\` at the repo root first`,
  )
  process.exit(1)
}

const timeline = buildTimeline({
  repo,
  name,
  frames: Number(values.frames),
  fallow: !values['no-fallow'],
  cacheDir: join(here, '..', '.cache', name),
  analyse: (dir) =>
    execFileSync('node', [cli, 'analyse', '--cwd', dir], { stdio: 'ignore' }),
  log: (line) => console.log(line),
})

const out = join(here, '..', 'src', 'data', `${name}.timeline.json`)
writeFileSync(out, JSON.stringify(timeline))
console.log(`${name}: ${timeline.frames.length} frames → ${out}`)
