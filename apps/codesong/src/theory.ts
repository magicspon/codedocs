/**
 * Scales and pitch arithmetic. The composer works in scale degrees so graph
 * values can never land on a note outside the key.
 */

import type { ScaleName } from './model.ts'

/** Semitone offsets from the tonic. */
export const SCALES: Readonly<Record<ScaleName, readonly number[]>> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
}

/** Pitch-class names for display. */
export const NOTE_NAMES: readonly string[] = [
  'C',
  'C#',
  'D',
  'Eb',
  'E',
  'F',
  'F#',
  'G',
  'Ab',
  'A',
  'Bb',
  'B',
]

/**
 * The MIDI note for a scale degree. Degree 0 is the tonic in `octave`, where
 * octave 4 holds middle C (MIDI 60). Degrees past the scale wrap into the
 * octaves either side.
 */
export function degreeToMidi(
  degree: number,
  key: number,
  scale: ScaleName,
  octave: number,
): number {
  const steps = SCALES[scale]
  const size = steps.length
  const wrapped = ((degree % size) + size) % size
  const octaves = Math.floor(degree / size)
  return 12 * (octave + 1 + octaves) + key + steps[wrapped]!
}

/**
 * A value in 0–1 as a whole number in `[low, high]`: the one place a graph
 * measure turns into a discrete musical choice.
 */
export function quantise(value: number, low: number, high: number): number {
  const clamped = Math.min(1, Math.max(0, value))
  return Math.min(high, low + Math.floor(clamped * (high - low + 1)))
}
