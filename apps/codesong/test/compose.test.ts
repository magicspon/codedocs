import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Atlas } from '@codedocs/code-art/atlas'
import { describe, expect, it } from 'vitest'
import { fill, sections } from '../src/compose/arrangement.ts'
import { progression } from '../src/compose/harmony.ts'
import { compose, DEFAULT_OPTIONS } from '../src/compose/compose.ts'
import { readStructure } from '../src/structure.ts'
import { atlas } from './fixture.ts'

/** The codedocs repository itself, as code-art exported it: a real small repo. */
const real = JSON.parse(
  readFileSync(
    join(import.meta.dirname, '../../code-art/src/data/codedocs.json'),
    'utf8',
  ),
) as Atlas

describe('compose', () => {
  const structure = readStructure(real)

  it('is deterministic', () => {
    expect(compose(structure, DEFAULT_OPTIONS)).toEqual(
      compose(structure, DEFAULT_OPTIONS),
    )
  })

  it('varies with the seed but keeps what the piece is derived from', () => {
    const a = compose(structure, DEFAULT_OPTIONS)
    const b = compose(structure, { ...DEFAULT_OPTIONS, seed: 1234 })
    expect(b).not.toEqual(a)
    expect(b.motifs.map((m) => m.source)).toEqual(a.motifs.map((m) => m.source))
  })

  it('traces every motif a track plays back to files in the repository', () => {
    const piece = compose(structure, DEFAULT_OPTIONS)
    const files = new Set(real.files.map((f) => f.path))
    const motifs = new Map(piece.motifs.map((m) => [m.id, m]))
    for (const track of piece.tracks) {
      for (const part of track.parts) {
        const motif = motifs.get(part.motif)
        expect(motif?.source.files.length).toBeGreaterThan(0)
        for (const path of motif!.source.files) expect(files).toContain(path)
      }
    }
  })

  it('does not grow with the repository', () => {
    const small = compose(readStructure(atlas), DEFAULT_OPTIONS)
    const large = compose(structure, DEFAULT_OPTIONS)
    expect(small.sections).toEqual(large.sections)
  })

  it('drops roles from the end of the budget', () => {
    const piece = compose(structure, { ...DEFAULT_OPTIONS, tracks: 2 })
    expect(piece.tracks.map((t) => t.role)).toEqual(['lead', 'bass'])
    expect(piece.motifs.map((m) => m.id)).not.toContain('pad-progression')
  })

  it('refuses to invent structure the code does not have', () => {
    const empty: Atlas = { ...atlas, files: [], calls: [], imports: [] }
    expect(() => compose(readStructure(empty), DEFAULT_OPTIONS)).toThrow(
      /no hand-written source/,
    )
    const flat: Atlas = { ...atlas, calls: [], imports: [] }
    expect(() => compose(readStructure(flat), DEFAULT_OPTIONS)).toThrow(
      /no dependency path/,
    )
  })
})

describe('arrangement', () => {
  it('divides the bars 1:2:2:2:1 with no gaps', () => {
    const form = sections(32)
    expect(form.map((s) => s.length / 4)).toEqual([4, 8, 8, 8, 4])
    for (let i = 1; i < form.length; i++) {
      expect(form[i]!.start).toBe(form[i - 1]!.start + form[i - 1]!.length)
    }
  })

  it('fills a section with motifs in turn and cuts the last to fit', () => {
    const motif = (id: string, length: number) => ({
      id,
      length,
      notes: [],
      source: { files: [], structure: 'dependency-path' as const },
    })
    const section = { name: 'x', start: 16, length: 20, intensity: 1 }
    const plain = { transpose: 0, invert: false, octave: 0 }
    const parts = fill([motif('a', 8), motif('b', 4)], section, 1, plain)
    expect(parts.map((p) => [p.motif, p.start, p.length])).toEqual([
      ['b', 16, 4],
      ['a', 20, 8],
      ['b', 28, 4],
      ['a', 32, 4],
    ])
  })
})

describe('progression', () => {
  it('starts home and never repeats a chord back to back', () => {
    const node = (depth: number) =>
      ({ rank: { depth, fanIn: 0, fanOut: 0, centrality: 0 } }) as never
    const roots = progression([node(0.9), node(0.5), node(0.5), node(0.5)])
    expect(roots[0]).toBe(0)
    for (let i = 1; i < roots.length; i++)
      expect(roots[i]).not.toBe(roots[i - 1])
  })
})
