/**
 * Genres: ways of playing the same code-derived material. The code still
 * decides the key, chords, melodies and form; a genre decides the tempo,
 * scale, swing, how the drums and bass place their notes, how slowly the
 * melodies move and which parts sit out of which sections.
 */

import type { Form, GenreName, MusicalRole, ScaleName } from '../model.ts'
import type { Analysis } from '../regions.ts'

/** How the drums place the hits the code asks for. */
export type DrumStyle =
  /** Quiet hats only: the pulse without the push. */
  | 'hush'
  /** The code's kicks under a backbeat, as the composer always played them. */
  | 'boombap'
  /** A kick on every beat and an open hat between. */
  | 'four'
  /** Kick on one and the and-of-three, snare on two and four: a two-step. */
  | 'breaks'

/** How the bass plays each chord root. */
export type BassStyle =
  /** One note a bar. */
  | 'held'
  /** As fast as the chord's file depends on things. */
  | 'pulse'
  /** Eighths between the beats, rooted and octaved. */
  | 'offbeat'
  /** Two long notes a bar, deep. */
  | 'sub'

/** Everything a genre changes. */
export interface Genre {
  readonly name: GenreName
  /** For people: what the genre is called on the site and in the CLI. */
  readonly label: string
  readonly tempo: number
  readonly scale: ScaleName
  /** Beats every off-beat sixteenth is played late. */
  readonly swing: number
  readonly drums: DrumStyle
  readonly bass: BassStyle
  /** Multiplies the time of lead and counter melodies: 2 is half speed. */
  readonly melody: number
  /** Roles that sit out a kind of section. */
  readonly rests: Partial<Record<Form, readonly MusicalRole[]>>
}

export const GENRES: Readonly<Record<GenreName, Genre>> = {
  ambient: {
    name: 'ambient',
    label: 'Ambient',
    tempo: 70,
    scale: 'major',
    swing: 0,
    drums: 'hush',
    bass: 'held',
    melody: 2,
    // Nothing ticks until the first verse.
    rests: { intro: ['percussion'] },
  },
  lofi: {
    name: 'lofi',
    label: 'Lo-fi hip hop',
    tempo: 82,
    scale: 'dorian',
    // A sixteenth pushed a third of the way to the next: a lazy, triplet lean.
    swing: 0.08,
    drums: 'boombap',
    bass: 'pulse',
    melody: 1,
    rests: {},
  },
  techno: {
    name: 'techno',
    label: 'Techno',
    tempo: 126,
    scale: 'minor',
    swing: 0,
    drums: 'four',
    bass: 'offbeat',
    melody: 1,
    // Techno builds from the beat: the intro is the kick under the pad.
    rests: { intro: ['lead', 'arp'] },
  },
  dnb: {
    name: 'dnb',
    label: 'Drum and bass',
    tempo: 172,
    scale: 'minor',
    swing: 0,
    drums: 'breaks',
    bass: 'sub',
    // Melodies float at half time over the breaks.
    melody: 2,
    rests: {},
  },
}

/** Every genre, in the order the site lists them. */
export const GENRE_NAMES: readonly GenreName[] = [
  'ambient',
  'lofi',
  'techno',
  'dnb',
]

/**
 * Where the suggestion splits. Chosen so real repositories spread across all
 * four genres rather than bunching in one.
 */
export const BUSY = 2.5
export const TANGLED = 0.15

/** Why the code suggested the genre it did. */
export interface Suggestion {
  readonly genre: GenreName
  /** Mean dependencies per file inside each subsystem, weighted by its size. */
  readonly energy: number
  /** Share of files caught in a dependency cycle. */
  readonly tangle: number
}

/**
 * The genre the code suggests. Busy code (files leaning on many neighbours)
 * plays fast; tangled code (files in cycles) plays a broken or swung beat.
 * Calm and orderly is ambient, calm and tangled lo-fi, busy and orderly
 * techno, busy and tangled drum and bass.
 */
export function suggest({ structure, regions }: Analysis): Suggestion {
  const energy = regions.reduce((sum, r) => sum + r.density * r.share, 0)
  const cycled = regions.reduce(
    (sum, r) => sum + r.cycles.reduce((n, c) => n + c.length, 0),
    0,
  )
  const tangle = cycled / Math.max(1, structure.nodes.length)
  const busy = energy >= BUSY
  const tangled = tangle >= TANGLED
  const genre: GenreName = busy
    ? tangled
      ? 'dnb'
      : 'techno'
    : tangled
      ? 'lofi'
      : 'ambient'
  return { genre, energy, tangle }
}
