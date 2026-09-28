import { realise } from '@codedocs/codesong/browser'
import { describe, expect, it } from 'vitest'
import {
  fileOf,
  genreReason,
  keyName,
  keyReason,
  motifKind,
  noteIndex,
  partOf,
  sectionReason,
  transformReason,
} from '../src/explain/explain.ts'
import router from '../songs/router.song.json' with { type: 'json' }
import { heard } from './heard.ts'

const { composition, evidence } = heard(router)
const tracks = realise(composition)
const motifs = new Map(composition.motifs.map((m) => [m.id, m]))

describe('tracing a note back to the code', () => {
  it('finds the part and motif note behind every note played', () => {
    for (const [t, track] of tracks.entries()) {
      for (const note of track.notes) {
        const part = partOf(composition.tracks[t]!.parts, note)
        expect(part, `${track.id} at ${note.start}`).toBeDefined()
        expect(
          noteIndex(motifs.get(note.motif)!, part!, note),
        ).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('names a measured file for every melody note', () => {
    const lead = tracks.find((t) => t.role === 'lead')!
    const parts = composition.tracks.find((t) => t.role === 'lead')!.parts
    for (const note of lead.notes) {
      const motif = motifs.get(note.motif)!
      if (!['theme', 'phrase'].includes(motifKind(motif))) continue
      const file = fileOf(motif, noteIndex(motif, partOf(parts, note)!, note))
      expect(file).toBeDefined()
      expect(evidence.measures[file!]).toBeDefined()
    }
  })
})

describe('explaining', () => {
  const plain = { transpose: 0, invert: false, octave: 0, stretch: 1 }
  const part = (transform: Partial<typeof plain & { fragment: number }>) => ({
    motif: 'theme',
    start: 0,
    length: 16,
    transform: { ...plain, ...transform },
  })

  it('says nothing of a part played as written', () => {
    expect(transformReason(part({}))).toBeUndefined()
  })

  it('lists every change a part makes', () => {
    expect(
      transformReason(
        part({
          transpose: 4,
          invert: true,
          octave: -2,
          stretch: 0.5,
          fragment: 3,
        }),
      ),
    ).toBe(
      'Here it is moved 4 scale steps, turned upside down, 2 octaves lower, 2 times faster, only its first 3 notes.',
    )
    expect(transformReason(part({ octave: 1, stretch: 2 }))).toBe(
      'Here it is 1 octave higher, 2 times slower.',
    )
  })

  it('gives the key from the coupling', () => {
    // Router's code suggests ambient, which plays in major.
    expect(keyName(composition)).toBe('D major')
    expect(keyReason({ composition, evidence })).toContain('2 steps')
  })

  it('says why the code suggested its genre, and when another is playing', () => {
    const suggested = genreReason({ composition, evidence })
    expect(suggested.join(' ')).toContain('suggests ambient')
    expect(suggested).toHaveLength(2)
    const picked = genreReason(heard(router, 'techno'))
    expect(picked.at(-1)).toContain('hearing it as techno')
  })

  it('gives every section a reason for its place', () => {
    for (const section of composition.sections) {
      expect(sectionReason(evidence, section)).toHaveLength(4)
    }
  })
})
