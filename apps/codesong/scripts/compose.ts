/**
 * Composes one repository.
 *
 *     pnpm --filter @codedocs/codesong compose <repo | index.db | atlas.json>
 *       [--seed n] [--bars n] [--tempo n] [--scale name] [--tracks n] [--out dir]
 *
 * Writes `<name>.composition.json`, `<name>.mid`, `<name>.live.json` (the
 * plan the Live extension builds from, `pnpm live`) and `<name>.song.json`,
 * the composition with its evidence, which the CodeSong site plays. A
 * repository or index is read through code-art's pipeline; an atlas JSON that
 * code-art already exported is read as it is.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import type { Atlas, SymbolNames } from '@codedocs/code-art/atlas'
import { snapshot } from '@codedocs/code-art/pipeline'
import { SCALES, NOTE_NAMES } from '../src/theory.ts'
import {
  analyse,
  compose,
  DEFAULT_OPTIONS,
  DEFAULT_PALETTE,
  evidence,
  findKit,
  livePlan,
  readStructure,
  realise,
  toMidi,
  type ComposeOptions,
  type ScaleName,
  type Song,
} from '../src/index.ts'

/** pnpm runs scripts from the package directory; paths mean the caller's. */
const fromCaller = (path: string): string =>
  resolve(process.env.INIT_CWD ?? process.cwd(), path)

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    seed: { type: 'string' },
    bars: { type: 'string' },
    tempo: { type: 'string' },
    scale: { type: 'string' },
    tracks: { type: 'string' },
    out: { type: 'string' },
  },
})

const given = positionals[0]
if (given === undefined) {
  console.error(
    'usage: compose <repo | index.db | atlas.json> [--seed n] [--bars n] [--out dir]',
  )
  process.exit(1)
}

function readAtlas(target: string): Atlas {
  if (target.endsWith('.json'))
    return JSON.parse(readFileSync(target, 'utf8')) as Atlas
  const dbPath = statSync(target).isDirectory()
    ? join(target, '.codedocs', 'index.db')
    : target
  if (!existsSync(dbPath)) {
    console.error(`no index at ${dbPath} — run \`codedocs\` in that repo first`)
    process.exit(1)
  }
  // The repo root is two levels above `.codedocs/index.db`.
  return snapshot(dbPath, {
    name: basename(resolve(dirname(dbPath), '..')),
    fallow: false,
  })
}

/**
 * The symbol names code-art exported beside an atlas JSON, as
 * `<name>.symbols.json`, if it did. They give the site's song names to show.
 */
function readNames(target: string): SymbolNames | undefined {
  const path = target.replace(/\.json$/, '.symbols.json')
  if (!target.endsWith('.json') || !existsSync(path)) return undefined
  return JSON.parse(readFileSync(path, 'utf8')) as SymbolNames
}

function number(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback
  const n = Number(value)
  if (!Number.isFinite(n)) throw new Error(`not a number: ${value}`)
  return n
}

const scale = values.scale ?? DEFAULT_OPTIONS.scale
if (!(scale in SCALES)) {
  console.error(
    `unknown scale ${scale}; one of ${Object.keys(SCALES).join(', ')}`,
  )
  process.exit(1)
}
const options: ComposeOptions = {
  ...DEFAULT_OPTIONS,
  seed: number(values.seed, DEFAULT_OPTIONS.seed),
  bars: values.bars === undefined ? 'auto' : number(values.bars, 0),
  tempo: number(values.tempo, DEFAULT_OPTIONS.tempo),
  tracks: number(values.tracks, DEFAULT_OPTIONS.tracks),
  scale: scale as ScaleName,
}

const atlas = readAtlas(fromCaller(given))
const structure = readStructure(atlas)
const analysis = analyse(structure)
const composition = compose(analysis, options)
const tracks = realise(composition)

const outDir = values.out
  ? fromCaller(values.out)
  : join(import.meta.dirname, '..', 'out')
mkdirSync(outDir, { recursive: true })
const json = join(outDir, `${atlas.name}.composition.json`)
const mid = join(outDir, `${atlas.name}.mid`)
const live = join(outDir, `${atlas.name}.live.json`)
const song = join(outDir, `${atlas.name}.song.json`)
const kit = findKit(DEFAULT_PALETTE)
writeFileSync(json, `${JSON.stringify(composition, null, 2)}\n`)
writeFileSync(mid, toMidi(composition, tracks))
writeFileSync(
  live,
  `${JSON.stringify(livePlan(composition, tracks, DEFAULT_PALETTE, kit), null, 2)}\n`,
)
const played: Song = {
  composition,
  evidence: evidence(analysis, composition, readNames(fromCaller(given))),
}
writeFileSync(song, `${JSON.stringify(played, null, 2)}\n`)
const missing = Object.keys(DEFAULT_PALETTE.kit).filter((v) => !(v in kit))

const beats = composition.sections.reduce((sum, s) => sum + s.length, 0)
const seconds = Math.round((beats * 60) / composition.tempo)
console.log(`${atlas.name}
  ${atlas.files.length} files, ${structure.nodes.length} composed from
  ${composition.motifs.length} motifs, ${composition.tracks.length} tracks, ${composition.sections.length} sections
  ${NOTE_NAMES[composition.key]} ${composition.scale}, ${composition.tempo} bpm, ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}
  ${tracks.reduce((n, t) => n + t.notes.length, 0)} notes
✓ ${json}
✓ ${mid}
✓ ${live}
✓ ${song}`)
if (missing.length > 0) {
  console.warn(
    `  no Ableton Live drum samples found for ${missing.join(', ')}; those pads stay empty`,
  )
}
