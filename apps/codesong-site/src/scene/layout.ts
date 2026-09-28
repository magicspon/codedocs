import type {
  Composition,
  MusicalRole,
  NoteEvent,
  RealisedTrack,
} from '@codedocs/codesong/browser'

/**
 * Where the piece sits in the scene. Time runs along x, one bar per
 * `BAR_WIDTH`; each track is a lane along z; a note floats above its lane at
 * a height set by its pitch, so a melody reads as a skyline.
 */

/** World units per beat. */
const BEAT = 0.6
/** Depth of one track's lane. */
export const LANE = 3
/** Height per semitone above a lane's lowest note. */
const SEMITONE = 0.07
/** How thick a note's block is, up and across the lane. */
export const NOTE_HEIGHT = 0.16
export const NOTE_DEPTH = 1.6

/** A colour per role, readable on the dark stage. */
export const ROLE_COLOUR: Readonly<Record<MusicalRole, string>> = {
  lead: '#ffb547',
  counter: '#f47fb7',
  bass: '#4fa3ff',
  pad: '#9d8cff',
  arp: '#3fd6c6',
  percussion: '#d7dde9',
}

/** Section bands on the floor, by form. */
export const FORM_COLOUR: Readonly<
  Record<Composition['sections'][number]['form'], string>
> = {
  intro: '#2a3040',
  verse: '#1e3350',
  chorus: '#4a2f1c',
  breakdown: '#33224a',
  outro: '#2a3040',
}

/** Beats as a distance along x. */
export const xOf = (beats: number): number => beats * BEAT

/** A distance along x as beats. */
export const beatsAt = (x: number): number => x / BEAT

/** Centre of lane `index` along z: the first track is farthest from the camera. */
export const zOf = (index: number, lanes: number): number =>
  (index - (lanes - 1) / 2) * LANE

/** One note's block: centre and size in world units. */
export interface Block {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly width: number
}

/**
 * Every note of `track` as a block. Heights are relative to the track's own
 * lowest note, so a bass line and a lead sit at the same scale.
 */
export function blocks(
  track: RealisedTrack,
  lane: number,
  lanes: number,
): Block[] {
  const low = Math.min(...track.notes.map((n) => n.pitch))
  const z = zOf(lane, lanes)
  return track.notes.map((note: NoteEvent) => ({
    x: xOf(note.start + note.duration / 2),
    y: 0.3 + (note.pitch - low) * SEMITONE,
    z,
    // A small gap, so repeated notes read as separate blocks.
    width: Math.max(0.05, note.duration * BEAT - 0.06),
  }))
}

/** How long the piece is, in beats. */
export function length(composition: Composition): number {
  return composition.sections.reduce(
    (end, s) => Math.max(end, s.start + s.length),
    0,
  )
}
