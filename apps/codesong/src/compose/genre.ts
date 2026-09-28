/**
 * Genres: ways of playing the same code-derived material. The code still
 * decides the key, chords, melodies and form; a genre decides the tempo,
 * scale, swing, how the drums and bass place their notes, how slowly the
 * melodies move and which parts sit out of which sections.
 */

import type {
  Form,
  GenreName,
  MusicalRole,
  ScaleName,
  Swing,
} from '../model.ts'
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
  /** A ride cymbal's ding, ding-a ding, over a feathered kick and comping snare. */
  | 'ride'
  /** Four-bar phrases in odd groups of sixteenths, ending on a stop: see `odd.ts`. */
  | 'odd'

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
  /** A note a beat, climbing or falling through the chord to the next root. */
  | 'walking'
  /** Locked to the odd drums' groups, pulling across them into each next root. */
  | 'locked'

/** How the pad plays each chord. */
export type PadStyle =
  /** Held for the whole bar. */
  | 'held'
  /** Struck, then struck again on the and-of-three: a lazy keyboard. */
  | 'push'
  /** Short stabs, three-three-two across the bar. */
  | 'stab'
  /** A pianist's comping: the Charleston, on one and the and-of-two. */
  | 'comp'

/** How the arpeggio plays a cycle's figure. */
export type ArpStyle =
  /** Slow eighths over two octaves, each note ringing into the next. */
  | 'drift'
  /** Eighths in the order the files come, with gaps. */
  | 'broken'
  /** Sixteenths, the lowest note between each of the others. */
  | 'pedal'
  /** Sixteenths rising over two octaves. */
  | 'roll'
  /** Eighth-note triplets up and down the chord. */
  | 'triplet'
  /** Low and high hands in turn, an odd length that crosses the bar line. */
  | 'tapped'

/** Everything a genre changes. */
export interface Genre {
  readonly name: GenreName
  /** For people: what the genre is called on the site and in the CLI. */
  readonly label: string
  readonly tempo: number
  readonly scale: ScaleName
  readonly swing: Swing
  /**
   * Multiplies every section's length. A fast genre plays longer sections,
   * so it lasts about as long as a slow one.
   */
  readonly length: number
  /** Whether chords add the seventh (and ninth) always, not only in dense code. */
  readonly sevenths: boolean
  readonly drums: DrumStyle
  readonly bass: BassStyle
  /** How the pad plays in verses and chorus; elsewhere it holds its chords. */
  readonly pad: PadStyle
  /** How the arpeggio plays the region's dependency cycles. */
  readonly arp: ArpStyle
  /** Multiplies the time of lead and counter melodies: 2 is half speed. */
  readonly melody: number
  /** Roles that sit out a kind of section. */
  readonly rests: Partial<Record<Form, readonly MusicalRole[]>>
}

/** No swing: every note where the score puts it. */
const STRAIGHT: Swing = { unit: 0.25, late: 0 }

export const GENRES: Readonly<Record<GenreName, Genre>> = {
  ambient: {
    name: 'ambient',
    label: 'Ambient',
    tempo: 70,
    scale: 'major',
    swing: STRAIGHT,
    length: 1,
    sevenths: false,
    drums: 'hush',
    bass: 'held',
    pad: 'held',
    arp: 'drift',
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
    swing: { unit: 0.25, late: 0.08 },
    length: 1,
    sevenths: false,
    drums: 'boombap',
    bass: 'pulse',
    pad: 'push',
    arp: 'broken',
    melody: 1,
    rests: {},
  },
  techno: {
    name: 'techno',
    label: 'Techno',
    tempo: 126,
    scale: 'minor',
    swing: STRAIGHT,
    length: 1.5,
    sevenths: false,
    drums: 'four',
    bass: 'offbeat',
    pad: 'stab',
    arp: 'pedal',
    melody: 1,
    // Techno builds from the beat: the intro is the kick under the pad.
    rests: { intro: ['lead', 'arp'] },
  },
  dnb: {
    name: 'dnb',
    label: 'Drum and bass',
    tempo: 172,
    scale: 'minor',
    swing: STRAIGHT,
    length: 2,
    sevenths: false,
    drums: 'breaks',
    bass: 'sub',
    pad: 'held',
    arp: 'roll',
    // Melodies float at half time over the breaks.
    melody: 2,
    rests: {},
  },
  jazz: {
    name: 'jazz',
    label: 'Jazz',
    tempo: 132,
    scale: 'dorian',
    // Eighths played as triplets: the and of each beat lands on its last third.
    swing: { unit: 0.5, late: 0.5 / 3 },
    length: 1.5,
    sevenths: true,
    drums: 'ride',
    bass: 'walking',
    pad: 'comp',
    arp: 'triplet',
    melody: 1,
    // Horn and piano alone for the intro; the drums come in with the verse.
    rests: { intro: ['percussion', 'arp'] },
  },
  mathrock: {
    name: 'mathrock',
    label: 'Math rock',
    tempo: 144,
    // Bright and a little strange: the raised fourth.
    scale: 'lydian',
    swing: STRAIGHT,
    length: 1.5,
    // Clean guitar chords: major sevenths and add-nines.
    sevenths: true,
    drums: 'odd',
    bass: 'locked',
    pad: 'stab',
    arp: 'tapped',
    melody: 1,
    // Held chords, then the tapped guitar; the band comes in with the verse.
    rests: { intro: ['percussion', 'lead'] },
  },
}

/** Every genre, in the order the site lists them. */
export const GENRE_NAMES: readonly GenreName[] = [
  'ambient',
  'lofi',
  'techno',
  'dnb',
  'jazz',
  'mathrock',
]

/**
 * Where the suggestion splits. Chosen so real repositories spread across all
 * the genres rather than bunching in one.
 */
export const BUSY = 2.5
export const TANGLED = 0.15
/** Past this, so much of the code answers itself in loops that it plays jazz. */
export const KNOTTED = 0.35

/** Why the code suggested the genre it did. */
export interface Suggestion {
  readonly genre: GenreName
  /** Mean dependencies per file inside each subsystem, weighted by its size. */
  readonly energy: number
  /** Share of files caught in a dependency cycle. */
  readonly tangle: number
}

/** The genre for code this busy and this tangled. */
function pick(energy: number, tangle: number): GenreName {
  if (tangle >= KNOTTED) return 'jazz'
  if (energy >= BUSY) return tangle >= TANGLED ? 'dnb' : 'techno'
  return tangle >= TANGLED ? 'lofi' : 'ambient'
}

/**
 * The genre the code suggests. Busy code (files leaning on many neighbours)
 * plays fast; tangled code (files in cycles) plays a broken or swung beat.
 * Calm and orderly is ambient, calm and tangled lo-fi, busy and orderly
 * techno, busy and tangled drum and bass. Code knotted into loops through
 * and through, busy or calm, is jazz: every part answering another.
 */
export function suggest({ structure, regions }: Analysis): Suggestion {
  const energy = regions.reduce((sum, r) => sum + r.density * r.share, 0)
  const cycled = regions.reduce(
    (sum, r) => sum + r.cycles.reduce((n, c) => n + c.length, 0),
    0,
  )
  const tangle = cycled / Math.max(1, structure.nodes.length)
  return { genre: pick(energy, tangle), energy, tangle }
}
