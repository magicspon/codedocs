/**
 * Structure in, composition out. The only randomness comes from a generator
 * seeded by the repository's name and the caller's seed, so the same code and
 * options always compose the same piece.
 */

import { hash, rng } from '@codedocs/code-art/rng'
import {
  COMPOSER_VERSION,
  type ComposeOptions,
  type Composition,
  type MusicalRole,
  type Register,
  type Track,
} from '../model.ts'
import { dependencyPaths } from '../paths.ts'
import type { Structure } from '../structure.ts'
import { leadParts, sections, span } from './arrangement.ts'
import { bassMotif, centralFiles, padMotif } from './harmony.ts'
import { pathMotif } from './melody.ts'
import { grooves } from './rhythm.ts'

/** Which roles survive a smaller track budget: the last is dropped first. */
const ROLE_ORDER: readonly MusicalRole[] = ['lead', 'bass', 'pad', 'percussion']

const REGISTER: Readonly<Record<MusicalRole, Register>> = {
  lead: 'high',
  bass: 'low',
  pad: 'mid',
  percussion: 'mid',
}

/** What `codesong` composes with when the caller says nothing. */
export const DEFAULT_OPTIONS: ComposeOptions = {
  seed: 0,
  tempo: 96,
  bars: 32,
  scale: 'minor',
  tracks: 4,
  maxMotifs: 6,
}

function track(role: MusicalRole, parts: Track['parts']): Track {
  return { id: role, name: role, role, register: REGISTER[role], parts }
}

/**
 * Composes one piece from `structure`.
 *
 * Throws when the structure has no source files or no dependency path long
 * enough for a motif: the piece would be invented, not derived, and the
 * design says to report that rather than fill the gap.
 */
export function compose(
  structure: Structure,
  options: ComposeOptions,
): Composition {
  if (options.bars < 8)
    throw new Error(`need at least 8 bars, got ${options.bars}`)
  if (structure.nodes.length === 0) {
    throw new Error(
      `${structure.name}: no hand-written source files to compose from`,
    )
  }
  const random = rng(hash(structure.name) ^ options.seed)
  const key = Math.floor(random() * 12)

  const paths = dependencyPaths(structure, options.maxMotifs)
  if (paths.length === 0) {
    throw new Error(
      `${structure.name}: no dependency path of three or more files`,
    )
  }
  const lead = paths.map((path, i) =>
    pathMotif(structure, path, `path-${i + 1}`),
  )
  const central = centralFiles(structure).map((i) => structure.nodes[i]!)
  const pad = padMotif(structure, central)
  const bass = bassMotif(central)
  const [groove, grooveFull] = grooves(structure, random)

  const form = sections(options.bars)
  // The pad alone plays the intro; the outro adds only the lead's closing motif.
  const [, theme, development, reprise] = form
  const built: Record<MusicalRole, Track> = {
    lead: track('lead', leadParts(lead, form, random)),
    bass: track(
      'bass',
      [theme!, development!, reprise!].map((s) => span(bass.id, s)),
    ),
    pad: track(
      'pad',
      form.map((s) => span(pad.id, s)),
    ),
    percussion: track('percussion', [
      span(groove!.id, theme!),
      span(grooveFull!.id, development!),
      span(grooveFull!.id, reprise!),
    ]),
  }

  const roles = ROLE_ORDER.slice(0, Math.min(4, Math.max(1, options.tracks)))
  const tracks = roles.map((role) => built[role])
  const used = new Set(tracks.flatMap((t) => t.parts.map((p) => p.motif)))
  return {
    composerVersion: COMPOSER_VERSION,
    origin: { repository: structure.name, commit: structure.commit, options },
    tempo: options.tempo,
    key,
    scale: options.scale,
    beatsPerBar: 4,
    tracks,
    motifs: [...lead, pad, bass, groove!, grooveFull!].filter((m) =>
      used.has(m.id),
    ),
    sections: form,
  }
}
