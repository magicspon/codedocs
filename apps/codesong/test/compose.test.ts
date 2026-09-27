import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Atlas } from '@codedocs/code-art/atlas'
import { describe, expect, it } from 'vitest'
import { compose, DEFAULT_OPTIONS, tonic } from '../src/compose/compose.ts'
import type { Composition } from '../src/model.ts'
import { analyse } from '../src/regions.ts'
import { readStructure } from '../src/structure.ts'
import { atlas } from './fixture.ts'

/** A repository as code-art exported it. */
function exported(name: string): Atlas {
  const path = join(import.meta.dirname, `../../code-art/src/data/${name}.json`)
  return JSON.parse(readFileSync(path, 'utf8')) as Atlas
}

const codedocs = analyse(readStructure(exported('codedocs')))
const vscode = analyse(readStructure(exported('vscode')))

const bars = (piece: Composition): number =>
  piece.sections.reduce((n, s) => n + s.length, 0) / 4

/** Whether `role` has a part sounding anywhere in `section`. */
function plays(piece: Composition, role: string, section: number): boolean {
  const s = piece.sections[section]!
  const track = piece.tracks.find((t) => t.role === role)
  return !!track?.parts.some(
    (p) => p.start < s.start + s.length && p.start + p.length > s.start,
  )
}

describe('compose', () => {
  const piece = compose(vscode, DEFAULT_OPTIONS)

  it('is deterministic', () => {
    expect(compose(codedocs, DEFAULT_OPTIONS)).toEqual(
      compose(codedocs, DEFAULT_OPTIONS),
    )
  })

  it('varies with the seed but keeps what the piece is derived from', () => {
    const a = compose(codedocs, DEFAULT_OPTIONS)
    const b = compose(codedocs, { ...DEFAULT_OPTIONS, seed: 1234 })
    expect(b).not.toEqual(a)
    expect(b.sections).toEqual(a.sections)
    expect(b.key).toBe(a.key)
    const sources = (p: Composition) =>
      new Set(p.motifs.map((m) => JSON.stringify(m.source)))
    expect(sources(b)).toEqual(sources(a))
  })

  it('takes the key from how tightly the files are coupled', () => {
    const coupled = (meanFanOut: number) =>
      tonic({ ...codedocs.structure, meanFanOut })
    expect(coupled(0)).toBe(0) // C
    expect(coupled(2)).toBe(9) // A, three fifths up
    expect(coupled(4)).toBe(6) // F#, six fifths up
    expect(coupled(100)).toBe(5) // F: clamped at eleven fifths, not back to C
    expect(piece.key).toBe(tonic(vscode.structure))
  })

  it('builds sections from the subsystems, foundations first, the biggest as chorus', () => {
    expect(piece.sections.map((s) => `${s.form}:${s.name}`)).toEqual([
      'intro:intro',
      'verse:base',
      'verse:platform',
      'verse:editor',
      'chorus:workbench',
      'breakdown:sessions',
      'verse:extensions',
      'outro:outro',
    ])
  })

  it('brings the theme back in every section', () => {
    piece.sections.forEach((_, i) => expect(plays(piece, 'lead', i)).toBe(true))
    const theme = piece.motifs.find((m) => m.id === 'theme')
    expect(theme?.source.structure).toBe('dependency-path')
    expect(piece.tracks[0]!.parts.every((p) => p.motif === 'theme')).toBe(true)
  })

  it('drops the bass and drums for the breakdown', () => {
    const breakdown = piece.sections.findIndex((s) => s.form === 'breakdown')
    expect(plays(piece, 'bass', breakdown)).toBe(false)
    expect(plays(piece, 'percussion', breakdown)).toBe(false)
    expect(plays(piece, 'pad', breakdown)).toBe(true)
  })

  it('traces every motif a track plays back to files in the repository', () => {
    const known = new Set(exported('vscode').files.map((f) => f.path))
    const motifs = new Map(piece.motifs.map((m) => [m.id, m]))
    for (const track of piece.tracks) {
      for (const part of track.parts) {
        const motif = motifs.get(part.motif)
        expect(motif?.source.files.length).toBeGreaterThan(0)
        for (const path of motif!.source.files) expect(known).toContain(path)
      }
    }
  })

  it('does not grow with the repository', () => {
    // vscode has sixty times the files of codedocs.
    const small = bars(compose(codedocs, DEFAULT_OPTIONS))
    const large = bars(piece)
    expect(small).toBeGreaterThanOrEqual(48)
    expect(large).toBeLessThanOrEqual(small * 1.25)
  })

  it('fits a bar budget', () => {
    expect(bars(compose(vscode, { ...DEFAULT_OPTIONS, bars: 48 }))).toBeCloseTo(
      48,
      -1,
    )
    expect(() => compose(vscode, { ...DEFAULT_OPTIONS, bars: 8 })).toThrow(
      /at least 16/,
    )
  })

  it('drops roles from the end of the budget', () => {
    const small = compose(codedocs, { ...DEFAULT_OPTIONS, tracks: 2 })
    expect(small.tracks.map((t) => t.role)).toEqual(['lead', 'bass'])
    expect(small.motifs.some((m) => m.id.startsWith('pad:'))).toBe(false)
  })

  it('refuses to invent structure the code does not have', () => {
    const empty: Atlas = { ...atlas, files: [], calls: [], imports: [] }
    expect(() =>
      compose(analyse(readStructure(empty)), DEFAULT_OPTIONS),
    ).toThrow(/no hand-written source/)
    const flat: Atlas = { ...atlas, calls: [], imports: [] }
    expect(() =>
      compose(analyse(readStructure(flat)), DEFAULT_OPTIONS),
    ).toThrow(/no dependency path/)
  })
})
