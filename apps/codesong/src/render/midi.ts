/**
 * A Standard MIDI File (format 1) writer. Written here rather than taken from
 * npm: the format is small, and a dependency would be one more package for the
 * no-network gate to vet.
 *
 * The MIDI renderer picks General MIDI programs as its instrument palette.
 * That choice belongs here, not in the composer, which only names roles.
 */

import type { Composition, MusicalRole } from '../model.ts'
import type { RealisedTrack } from './realise.ts'

/** Ticks per quarter note. */
const PPQ = 480

/** General MIDI programs (zero-based) per role. */
const PROGRAM: Readonly<Record<MusicalRole, number>> = {
  lead: 80, // Lead 1 (square)
  counter: 11, // Vibraphone
  bass: 38, // Synth Bass 1
  pad: 89, // Pad 2 (warm)
  arp: 84, // Lead 5 (charang)
  percussion: 0, // ignored on the drum channel
}
const DRUM_CHANNEL = 9

/** A number as a MIDI variable-length quantity. */
export function vlq(value: number): number[] {
  let v = Math.max(0, Math.round(value))
  const bytes = [v & 0x7f]
  while ((v >>= 7) > 0) bytes.unshift((v & 0x7f) | 0x80)
  return bytes
}

function text(type: number, value: string): number[] {
  const bytes = [...new TextEncoder().encode(value)]
  return [0xff, type, ...vlq(bytes.length), ...bytes]
}

function chunk(id: string, body: readonly number[]): number[] {
  const n = body.length
  return [
    // Chunk ids are four ASCII letters, so char codes are the bytes.
    ...Array.from({ length: id.length }, (_, i) => id.charCodeAt(i)),
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 8) & 0xff,
    n & 0xff,
    ...body,
  ]
}

/** Timed events as a track chunk, closed with end-of-track. */
function trackChunk(events: [number, number[]][]): number[] {
  // Stable sort keeps note-offs, which are queued first, ahead of note-ons at
  // the same tick, so a repeated note is released before it is struck again.
  events.sort((a, b) => a[0] - b[0])
  const body: number[] = []
  let last = 0
  for (const [tick, bytes] of events) {
    body.push(...vlq(tick - last), ...bytes)
    last = tick
  }
  body.push(0, 0xff, 0x2f, 0x00)
  return chunk('MTrk', body)
}

const ticks = (beats: number): number => Math.round(beats * PPQ)

/** Tempo, 4/4 and one marker per section, which DAWs show as locators. */
function conductor(composition: Composition): number[] {
  const tempo = Math.round(60_000_000 / composition.tempo)
  const events: [number, number[]][] = [
    [0, text(0x03, composition.origin.repository)],
    [
      0,
      [
        0xff,
        0x51,
        0x03,
        (tempo >> 16) & 0xff,
        (tempo >> 8) & 0xff,
        tempo & 0xff,
      ],
    ],
    [0, [0xff, 0x58, 0x04, composition.beatsPerBar, 2, 24, 8]],
    ...composition.sections.map((s): [number, number[]] => [
      ticks(s.start),
      text(0x06, s.name),
    ]),
  ]
  return trackChunk(events)
}

function noteTrack(track: RealisedTrack, channel: number): number[] {
  const events: [number, number[]][] = [[0, text(0x03, track.name)]]
  if (channel !== DRUM_CHANNEL)
    events.push([0, [0xc0 | channel, PROGRAM[track.role]]])
  const offs: [number, number[]][] = []
  const ons: [number, number[]][] = []
  for (const note of track.notes) {
    const on = ticks(note.start)
    const off = Math.max(on + 1, ticks(note.start + note.duration))
    ons.push([on, [0x90 | channel, note.pitch & 0x7f, note.velocity & 0x7f]])
    offs.push([off, [0x80 | channel, note.pitch & 0x7f, 0]])
  }
  return trackChunk([...events, ...offs, ...ons])
}

/** The whole piece as the bytes of a `.mid` file. */
export function toMidi(
  composition: Composition,
  tracks: readonly RealisedTrack[],
): Uint8Array<ArrayBuffer> {
  let channel = 0
  const chunks = tracks.map((track) => {
    if (track.role === 'percussion') return noteTrack(track, DRUM_CHANNEL)
    // Skip the drum channel so a melodic track is never played as drums.
    if (channel === DRUM_CHANNEL) channel++
    return noteTrack(track, channel++)
  })
  const count = chunks.length + 1
  const header = chunk('MThd', [
    0,
    1,
    (count >> 8) & 0xff,
    count & 0xff,
    (PPQ >> 8) & 0xff,
    PPQ & 0xff,
  ])
  return Uint8Array.from([
    ...header,
    ...conductor(composition),
    ...chunks.flat(),
  ])
}
