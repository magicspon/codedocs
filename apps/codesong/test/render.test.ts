import { describe, expect, it } from 'vitest'
import type { Composition } from '../src/model.ts'
import { toMidi, vlq } from '../src/render/midi.ts'
import { realise } from '../src/render/realise.ts'
import { degreeToMidi, quantise } from '../src/theory.ts'

describe('theory', () => {
  it('turns degrees into pitches in key, wrapping across octaves', () => {
    expect(degreeToMidi(0, 0, 'major', 4)).toBe(60)
    expect(degreeToMidi(7, 0, 'major', 4)).toBe(72)
    expect(degreeToMidi(-1, 0, 'major', 4)).toBe(59)
    expect(degreeToMidi(2, 9, 'minor', 3)).toBe(60) // A minor's third is C
  })

  it('quantises the whole of 0–1 onto the range, ends included', () => {
    expect([0, 0.24, 0.25, 0.99, 1, 7].map((v) => quantise(v, 0, 3))).toEqual([
      0, 0, 1, 3, 3, 3,
    ])
  })
})

/** Two bars of C major: one lead part, inverted and cut short, and one drum hit. */
const piece: Composition = {
  composerVersion: 'test',
  origin: {
    repository: 'r',
    commit: 'c',
    options: {
      seed: 0,
      tempo: 120,
      bars: 8,
      scale: 'major',
      tracks: 2,
      maxMotifs: 1,
    },
  },
  tempo: 120,
  key: 0,
  scale: 'major',
  beatsPerBar: 4,
  sections: [{ name: 'only', start: 0, length: 8, intensity: 1 }],
  motifs: [
    {
      id: 'm',
      length: 4,
      source: { files: ['a.ts'], structure: 'dependency-path' },
      notes: [
        { degree: 0, start: 0, duration: 2, velocity: 90 },
        { degree: 2, start: 2, duration: 3, velocity: 80 },
      ],
    },
    {
      id: 'kick',
      length: 4,
      source: { files: ['b.ts'], structure: 'leaf-files' },
      notes: [{ degree: 0, start: 0, duration: 0.25, velocity: 100 }],
    },
  ],
  tracks: [
    {
      id: 'lead',
      name: 'lead',
      role: 'lead',
      register: 'mid',
      parts: [
        {
          motif: 'm',
          start: 0,
          length: 6,
          transform: { transpose: 1, invert: true, octave: 0 },
        },
      ],
    },
    {
      id: 'drums',
      name: 'drums',
      role: 'percussion',
      register: 'mid',
      parts: [
        {
          motif: 'kick',
          start: 0,
          length: 8,
          transform: { transpose: 0, invert: false, octave: 0 },
        },
      ],
    },
  ],
}

describe('realise', () => {
  const [lead, drums] = realise(piece)

  it('loops the motif, applies the transform and cuts at the part end', () => {
    // Inverted around degree 0 then up one: 0 → 1 (D), 2 → -1 (B3).
    expect(lead!.notes.map((n) => [n.pitch, n.start, n.duration])).toEqual([
      [62, 0, 2],
      [59, 2, 3],
      [62, 4, 2],
    ])
    expect(lead!.notes.every((n) => n.motif === 'm')).toBe(true)
  })

  it('plays percussion as General MIDI drums', () => {
    expect(drums!.notes.map((n) => [n.pitch, n.start])).toEqual([
      [36, 0],
      [36, 4],
    ])
  })
})

describe('midi', () => {
  it('encodes variable-length quantities', () => {
    expect(vlq(0)).toEqual([0])
    expect(vlq(127)).toEqual([0x7f])
    expect(vlq(128)).toEqual([0x81, 0x00])
    expect(vlq(0x3fff)).toEqual([0xff, 0x7f])
  })

  /** The events of one track body, as `[tick, status]`; the writer never uses running status. */
  function events(body: Uint8Array): [number, number][] {
    const out: [number, number][] = []
    let at = 0
    let tick = 0
    const readVlq = (): number => {
      let v = 0
      let b: number
      do {
        b = body[at++]!
        v = (v << 7) | (b & 0x7f)
      } while (b & 0x80)
      return v
    }
    while (at < body.length) {
      tick += readVlq()
      const status = body[at++]!
      out.push([tick, status])
      if (status === 0xff) {
        at++
        // Read first: `at += readVlq()` would add to `at` from before the read.
        const length = readVlq()
        at += length
      } else if ((status & 0xf0) === 0xc0) at += 1
      else at += 2
    }
    return out
  }

  it('writes a format 1 file with a conductor track and one track per part', () => {
    const bytes = toMidi(piece, realise(piece))
    const ascii = (at: number) =>
      String.fromCharCode(...bytes.slice(at, at + 4))
    expect(ascii(0)).toBe('MThd')
    expect(Array.from(bytes.slice(8, 14))).toEqual([0, 1, 0, 3, 0x01, 0xe0])
    const bodies: Uint8Array[] = []
    let at = 14
    while (at < bytes.length) {
      expect(ascii(at)).toBe('MTrk')
      const size =
        (bytes[at + 4]! << 24) |
        (bytes[at + 5]! << 16) |
        (bytes[at + 6]! << 8) |
        bytes[at + 7]!
      bodies.push(bytes.slice(at + 8, at + 8 + size))
      at += 8 + size
    }
    expect(bodies).toHaveLength(3)
    const [, lead, drums] = bodies.map(events)
    const kind = (list: [number, number][], status: number) =>
      list.filter(([, s]) => s === status).map(([t]) => t)
    // Lead on channel 0: three notes, released at 960, 2400 and 2880 ticks.
    expect(kind(lead!, 0x90)).toEqual([0, 960, 1920])
    expect(kind(lead!, 0x80)).toEqual([960, 2400, 2880])
    // Drums on channel 10.
    expect(kind(drums!, 0x99)).toEqual([0, 1920])
    expect(kind(drums!, 0x89)).toEqual([120, 2040])
  })

  it('releases a repeated note before striking it again', () => {
    const [lead] = realise(piece)
    const again = {
      ...lead!,
      notes: [
        { pitch: 60, start: 0, duration: 1, velocity: 90, motif: 'm' },
        { pitch: 60, start: 1, duration: 1, velocity: 90, motif: 'm' },
      ],
    }
    const bytes = toMidi(piece, [again])
    // Header, conductor, then this track: find its body by skipping the first two chunks.
    const skip = (at: number) =>
      at +
      8 +
      ((bytes[at + 4]! << 24) |
        (bytes[at + 5]! << 16) |
        (bytes[at + 6]! << 8) |
        bytes[at + 7]!)
    const start = skip(skip(0))
    const body = bytes.slice(start + 8)
    const at480 = events(body).filter(
      ([t, s]) => t === 480 && (s & 0xe0) === 0x80,
    )
    expect(at480.map(([, s]) => s)).toEqual([0x80, 0x90])
  })
})
