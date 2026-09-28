/**
 * Analysis in, composition out. The only randomness comes from a generator
 * seeded by the repository's name and the caller's seed, so the same code and
 * options always compose the same piece. The key comes from the code alone,
 * so a new seed varies the piece without moving it to a new key. The genre
 * comes from the code too, unless the caller names one.
 */

import { hash, rng } from '@codedocs/code-art/rng'
import {
  COMPOSER_VERSION,
  type ComposeOptions,
  type Composition,
  type Motif,
  type MusicalRole,
  type Part,
  type Register,
  type Section,
  type Track,
} from '../model.ts'
import { dependencyPaths } from '../paths.ts'
import type { Analysis, Region } from '../regions.ts'
import type { Structure } from '../structure.ts'
import { arrange, type Material } from './arrangement.ts'
import { arpMotifs } from './arp.ts'
import { plan, sections } from './form.ts'
import { GENRES, suggest, type Genre } from './genre.ts'
import { bassMotifs, chordSource } from './harmony.ts'
import { pathMotif } from './melody.ts'
import { pads } from './pad.ts'
import { fill, groove } from './rhythm.ts'

/** Which roles survive a smaller track budget: the last is dropped first. */
const ROLE_ORDER: readonly MusicalRole[] = [
  'lead',
  'bass',
  'pad',
  'percussion',
  'counter',
  'arp',
]

const REGISTER: Readonly<Record<MusicalRole, Register>> = {
  lead: 'high',
  counter: 'mid',
  bass: 'low',
  pad: 'mid',
  arp: 'high',
  percussion: 'mid',
}

/** What `codesong` composes with when the caller says nothing. */
export const DEFAULT_OPTIONS: ComposeOptions = {
  seed: 0,
  genre: 'auto',
  bars: 'auto',
  tracks: 6,
  maxMotifs: 16,
}

/**
 * The tonic, from how tightly the files are coupled. Every two dependencies
 * per file move the key three steps round the circle of fifths from C, so a
 * loosely coupled codebase plays near C and a tangled one in the remote keys.
 * Clamped rather than wrapped, so the most tangled never lands back on C.
 */
export function tonic(structure: Structure): number {
  return (fifths(structure) * 7) % 12
}

/** Steps round the circle of fifths from C that `tonic` takes. */
export function fifths(structure: Structure): number {
  return Math.min(11, Math.round(structure.meanFanOut * 1.5))
}

/** A subsystem's harmony and phrases, which every section built from it shares. */
type RegionMaterial = Omit<Material, 'groove' | 'fill'>

function regionMaterial(
  structure: Structure,
  region: Region,
  phrases: number,
  genre: Genre,
  taken: Set<string>,
): RegionMaterial {
  const chords = chordSource(structure, region, taken)
  const within = new Set(region.files)
  const { played, held } = pads(structure, region, chords, genre)
  return {
    pad: played,
    held,
    bass: bassMotifs(region, chords, genre.bass),
    arp: arpMotifs(structure, region, chords, genre),
    phrases: dependencyPaths(structure, phrases, within).map((path, i) =>
      pathMotif(structure, path, `phrase:${region.path}:${i + 1}`, region.path),
    ),
  }
}

/** The dependency path through the whole codebase that every section recalls. */
function theme(structure: Structure): Motif {
  const [path] = dependencyPaths(structure, 1)
  if (path === undefined) {
    throw new Error(
      `${structure.name}: no dependency path of three or more files`,
    )
  }
  return pathMotif(structure, path, 'theme')
}

/** Adds each section's parts to its role's track, noting which motifs they play. */
function collect(
  parts: Map<MusicalRole, Part[]>,
  used: Map<string, Motif>,
  byRole: Partial<Record<MusicalRole, Part[]>>,
  motifs: readonly Motif[],
): void {
  const byId = new Map(motifs.map((m) => [m.id, m]))
  for (const role of ROLE_ORDER) {
    for (const p of byRole[role] ?? []) {
      parts.get(role)!.push(p)
      const motif = byId.get(p.motif)
      if (motif) used.set(motif.id, motif)
    }
  }
}

/**
 * Composes one piece from `analysis`.
 *
 * Throws when there are no source files or no dependency path long enough
 * for a theme: the piece would be invented, not derived, and the design says
 * to report that rather than fill the gap.
 */
export function compose(
  analysis: Analysis,
  options: ComposeOptions,
): Composition {
  const { structure, regions } = analysis
  if (structure.nodes.length === 0 || regions.length === 0) {
    throw new Error(
      `${structure.name}: no hand-written source files to compose from`,
    )
  }
  if (options.bars !== 'auto' && options.bars < 16) {
    throw new Error(`need at least 16 bars, got ${options.bars}`)
  }
  const random = rng(hash(structure.name) ^ options.seed)
  const genre =
    GENRES[options.genre === 'auto' ? suggest(analysis).genre : options.genre]
  const key = tonic(structure)
  const motto = theme(structure)

  const perRegion = Math.max(
    1,
    Math.floor((options.maxMotifs - 1) / regions.length),
  )
  // Progressions the piece already plays, so each subsystem gets its own.
  const taken = new Set<string>()
  const materials = new Map(
    regions.map((r) => [
      r,
      regionMaterial(structure, r, perRegion, genre, taken),
    ]),
  )
  const planned = plan(regions)
  const form: Section[] = sections(planned, options.bars, genre.length)

  const parts = new Map<MusicalRole, Part[]>(
    ROLE_ORDER.map((role) => [role, []]),
  )
  const used = new Map<string, Motif>([[motto.id, motto]])
  form.forEach((section, i) => {
    const { region } = planned[i]!
    const base = materials.get(region)!
    const material: Material = {
      ...base,
      groove: groove(structure, region, section.form, random, genre.drums),
      fill: fill(
        structure,
        region,
        section.form,
        section.intensity,
        genre.drums,
      ),
    }
    const offset = Math.floor(random() * Math.max(1, base.phrases.length))
    const { groove: beat, fill: link, pad, held, bass, arp, phrases } = material
    collect(parts, used, arrange(section, material, motto, offset, genre), [
      ...pad,
      ...held,
      ...bass,
      beat,
      link,
      ...phrases,
      ...arp,
    ])
  })

  const roles = ROLE_ORDER.slice(
    0,
    Math.min(ROLE_ORDER.length, Math.max(1, options.tracks)),
  )
  const tracks: Track[] = roles.map((role) => ({
    id: role,
    name: role,
    role,
    register: REGISTER[role],
    parts: parts.get(role)!,
  }))
  const heard = new Set(tracks.flatMap((t) => t.parts.map((p) => p.motif)))
  return {
    composerVersion: COMPOSER_VERSION,
    origin: { repository: structure.name, commit: structure.commit, options },
    tempo: options.tempo ?? genre.tempo,
    genre: genre.name,
    swing: genre.swing,
    key,
    scale: options.scale ?? genre.scale,
    beatsPerBar: 4,
    tracks,
    motifs: [...used.values()].filter((m) => heard.has(m.id)),
    sections: form,
  }
}
