/**
 * The composition model: what the composer decides and every renderer reads.
 *
 * It says nothing about Ableton, MIDI channels or instruments. Pitches are
 * scale degrees, not MIDI numbers, so a renderer can re-key a piece without
 * the composer, and every motif keeps the files it came from so any note can
 * be traced back to the code that produced it.
 */

/** Bumped whenever the same inputs would compose a different piece. */
export const COMPOSER_VERSION = '0.1.0'

/** What a track does in the piece; the renderer turns a role into a sound. */
export type MusicalRole = 'bass' | 'lead' | 'pad' | 'percussion'

/** Scales the composer knows, by name. */
export type ScaleName =
  | 'major'
  | 'minor'
  | 'dorian'
  | 'phrygian'
  | 'lydian'
  | 'mixolydian'

/** What the caller controls. Everything else comes from the code and the seed. */
export interface ComposeOptions {
  /** Varies the piece without changing what it is derived from. */
  readonly seed: number
  /** Beats per minute. Phase 1 holds it fixed for the whole piece. */
  readonly tempo: number
  /** Length in 4/4 bars. The piece does not grow with the repository. */
  readonly bars: number
  readonly scale: ScaleName
  /** 1–4: roles are dropped from the end of `ROLE_ORDER` first. */
  readonly tracks: number
  /** Most motifs the lead may carry. */
  readonly maxMotifs: number
}

/**
 * The drum voices a percussion motif plays. On a percussion track a note's
 * `degree` indexes this list instead of a scale.
 */
export const DRUM_VOICES: readonly string[] = [
  'kick',
  'snare',
  'closed-hat',
  'open-hat',
]

/** One note of a motif, relative to the motif's start. */
export interface MotifNote {
  /**
   * Scale degree from the tonic; 7 is the tonic an octave up, negatives go
   * below. On a percussion track, an index into `DRUM_VOICES`.
   */
  readonly degree: number
  /** Beats from the start of the motif. */
  readonly start: number
  /** Beats. */
  readonly duration: number
  /** 1–127. */
  readonly velocity: number
}

/** Where a motif came from. Phase 1 reads a file-level graph, so files, not symbols. */
export interface Provenance {
  /** The tsconfig most of the files belong to, if any. */
  readonly project?: string
  /** Repository-relative paths, in the order the motif plays them. */
  readonly files: readonly string[]
  /** Why these files: the structure the motif was read from. */
  readonly structure: 'dependency-path' | 'central-files' | 'leaf-files'
}

/** A musical idea derived from one structural relationship. */
export interface Motif {
  readonly id: string
  readonly source: Provenance
  readonly notes: readonly MotifNote[]
  /** Beats the motif occupies, which may exceed its last note. */
  readonly length: number
}

/** How a part changes its motif when it plays it. */
export interface Transform {
  /** Scale degrees to shift by. */
  readonly transpose: number
  /** Mirror the degrees around the motif's first note. */
  readonly invert: boolean
  /** Octaves to shift by. */
  readonly octave: number
}

/** One placement of a motif on a track. */
export interface Part {
  readonly motif: string
  /** Beats from the start of the piece. */
  readonly start: number
  /**
   * Beats the part lasts. The motif loops to fill it and is cut where it ends,
   * so a four-bar progression can sit in a two-bar section.
   */
  readonly length: number
  readonly transform: Transform
}

/** Where a track sits, as the renderer's hint for octave and sound. */
export type Register = 'low' | 'mid' | 'high'

export interface Track {
  readonly id: string
  readonly name: string
  readonly role: MusicalRole
  readonly register: Register
  readonly parts: readonly Part[]
}

/** A named stretch of the piece. */
export interface Section {
  readonly name: string
  /** Beats from the start of the piece. */
  readonly start: number
  /** Beats. */
  readonly length: number
  /** 0–1: how much is happening, which the arrangement uses to choose tracks. */
  readonly intensity: number
}

/** The whole piece, before any renderer has touched it. */
export interface Composition {
  readonly composerVersion: string
  /** The repository's name and commit, and the options that shaped the piece. */
  readonly origin: {
    readonly repository: string
    readonly commit: string
    readonly options: ComposeOptions
  }
  readonly tempo: number
  /** Tonic as a pitch class, 0 (C) to 11 (B). */
  readonly key: number
  readonly scale: ScaleName
  /** Beats per bar. Phase 1 is always 4/4. */
  readonly beatsPerBar: number
  readonly tracks: readonly Track[]
  readonly motifs: readonly Motif[]
  readonly sections: readonly Section[]
}
