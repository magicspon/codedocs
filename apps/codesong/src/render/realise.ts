/**
 * The composition as concrete notes: parts expanded, motifs transformed and
 * degrees turned into MIDI pitches. Every renderer starts here, so they all
 * hear the same piece.
 */

import type {
  Composition,
  Motif,
  MotifNote,
  Part,
  Register,
  Track,
  Transform,
} from '../model.ts'
import { degreeToMidi } from '../theory.ts'

/** A note ready to play, still naming the motif it came from. */
export interface NoteEvent {
  /** MIDI note number. */
  readonly pitch: number
  /** Beats from the start of the piece. */
  readonly start: number
  readonly duration: number
  readonly velocity: number
  readonly motif: string
}

/** One track's notes, in start order. */
export interface RealisedTrack {
  readonly id: string
  readonly name: string
  readonly role: Composition['tracks'][number]['role']
  readonly notes: readonly NoteEvent[]
}

/** The octave degree 0 sits in, by register; octave 4 holds middle C. */
const OCTAVE: Readonly<Record<Register, number>> = { low: 2, mid: 4, high: 5 }

/** General MIDI drum notes, by `DRUM_VOICES` index. */
export const DRUM_NOTES: readonly number[] = [36, 38, 42, 46]

function transformed(note: MotifNote, first: number, t: Transform): number {
  const degree = t.invert ? 2 * first - note.degree : note.degree
  return degree + t.transpose
}

/** How one track turns a motif note into a pitch. */
type Pitcher = (note: MotifNote, first: number, part: Part) => number

function pitcher(composition: Composition, track: Track): Pitcher {
  if (track.role === 'percussion') {
    return (note) => DRUM_NOTES[note.degree] ?? DRUM_NOTES[0]!
  }
  return (note, first, part) =>
    degreeToMidi(
      transformed(note, first, part.transform),
      composition.key,
      composition.scale,
      OCTAVE[track.register] + part.transform.octave,
    )
}

/**
 * `start` pushed late by `swing` if it falls on an off-beat sixteenth (the
 * "e" or "a" of a beat), which is what makes a straight beat lean.
 */
export function swung(start: number, swing: number): number {
  const within = start % 0.5
  return Math.abs(within - 0.25) < 1e-6 ? start + swing : start
}

/**
 * One part's notes. The motif, stretched and cut to its fragment, loops until
 * the part ends; a note is cut rather than let ring into whatever comes next.
 */
function partNotes(
  part: Part,
  motif: Motif,
  pitch: Pitcher,
  swing: number,
): NoteEvent[] {
  const notes: NoteEvent[] = []
  const { stretch, fragment } = part.transform
  const length = motif.length * stretch
  if (length <= 0) return notes
  const played =
    fragment === undefined ? motif.notes : motif.notes.slice(0, fragment)
  const first = motif.notes[0]?.degree ?? 0
  const end = part.start + part.length
  for (let loop = part.start; loop < end; loop += length) {
    for (const note of played) {
      const start = loop + note.start * stretch
      if (start >= end) continue
      notes.push({
        pitch: pitch(note, first, part),
        start: swung(start, swing),
        duration: Math.min(note.duration * stretch, end - start),
        velocity: note.velocity,
        motif: motif.id,
      })
    }
  }
  return notes
}

/** Every track of `composition` as notes. */
export function realise(composition: Composition): RealisedTrack[] {
  const motifs = new Map(composition.motifs.map((m) => [m.id, m]))
  return composition.tracks.map((track) => {
    const pitch = pitcher(composition, track)
    const notes = track.parts.flatMap((part) => {
      const motif = motifs.get(part.motif)
      return motif ? partNotes(part, motif, pitch, composition.swing) : []
    })
    notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch)
    return { id: track.id, name: track.name, role: track.role, notes }
  })
}
