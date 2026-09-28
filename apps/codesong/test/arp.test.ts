import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Atlas } from '@codedocs/code-art/atlas'
import { describe, expect, it } from 'vitest'
import { compose, DEFAULT_OPTIONS } from '../src/compose/compose.ts'
import { GENRE_NAMES } from '../src/compose/genre.ts'
import { phrasing } from '../src/compose/odd.ts'
import type { Composition, GenreName, Motif } from '../src/model.ts'
import { analyse } from '../src/regions.ts'
import { realise } from '../src/render/realise.ts'
import { readStructure } from '../src/structure.ts'

const path = join(import.meta.dirname, '../../code-art/src/data/vscode.json')
const vscode = analyse(
  readStructure(JSON.parse(readFileSync(path, 'utf8')) as Atlas),
)
const inGenre = (genre: GenreName): Composition =>
  compose(vscode, { ...DEFAULT_OPTIONS, genre })

const arps = (piece: Composition): Motif[] =>
  piece.motifs.filter((m) => m.id.startsWith('arp:'))

/** A figure's first bar as steps from its first note, with their times. */
const shape = (m: Motif): string => {
  const first = m.notes[0]!.degree
  return m.notes
    .filter((n) => n.start < 4)
    .map((n) => `${n.degree - first}@${n.start.toFixed(2)}`)
    .join()
}

describe('arpeggios', () => {
  it('gives a loop of files more than one note in every genre', () => {
    for (const genre of GENRE_NAMES) {
      for (const m of arps(inGenre(genre))) {
        expect(new Set(m.notes.map((n) => n.degree)).size).toBeGreaterThan(2)
      }
    }
  })

  it('plays a different figure for each loop', () => {
    for (const genre of GENRE_NAMES) {
      const figures = arps(inGenre(genre)).map(shape)
      expect(new Set(figures).size / figures.length).toBeGreaterThan(0.75)
    }
  })

  it('plays the same loop differently in each genre', () => {
    const figures = GENRE_NAMES.map((g) => shape(arps(inGenre(g))[0]!))
    expect(new Set(figures).size).toBe(GENRE_NAMES.length)
  })

  it('plays jazz arpeggios in triplets', () => {
    const [m] = arps(inGenre('jazz'))
    const off = m!.notes.map((n) =>
      Math.abs(n.start * 3 - Math.round(n.start * 3)),
    )
    expect(Math.max(...off)).toBeLessThan(1e-6)
    expect(m!.notes.some((n) => n.start % 1 !== 0)).toBe(true)
  })
})

describe('math rock', () => {
  const piece = inGenre('mathrock')

  it('taps an odd-length figure, so each bar starts somewhere new', () => {
    const [m] = arps(piece)
    const bars = [0, 1].map((b) =>
      m!.notes
        .filter((n) => n.start >= b * 4 && n.start < b * 4 + 4)
        .map((n) => n.degree - m!.notes[0]!.degree),
    )
    expect(bars[0]).not.toEqual(bars[1])
  })

  const drums = realise(piece).find((t) => t.role === 'percussion')!
  const chorus = piece.sections.find((s) => s.form === 'chorus')!
  /** Sixteenths into the chorus where `pitch` hits hard, over its first four bars. */
  const hits = (pitch: number) =>
    drums.notes
      .filter(
        (n) =>
          n.pitch === pitch &&
          n.velocity >= 100 &&
          n.start >= chorus.start &&
          n.start < chorus.start + 16,
      )
      .map((n) => Math.round((n.start - chorus.start) * 4))

  it('phrases the drums over four bars, not one', () => {
    const kicks = hits(36)
    const bars = [0, 1, 2, 3].map((b) =>
      kicks.filter((k) => k >= b * 16 && k < b * 16 + 16).map((k) => k % 16),
    )
    expect(new Set(bars.map((b) => b.join())).size).toBeGreaterThan(2)
  })

  it('cracks the snare two from the end of each group, never on the backbeat', () => {
    const groups = phrasing(
      vscode.regions.find((r) => r.path === chorus.source)!,
    )
    const snares = hits(38).filter((t) => t < groups.at(-1)!.start)
    expect(snares).toEqual(
      groups
        .filter((g) => !g.stop && g.length >= 4)
        .map((g) => g.start + g.length - 2),
    )
  })

  it('never lets a phrase repeat bar by bar, in any region', () => {
    for (const region of vscode.regions) {
      const starts = phrasing(region)
        .filter((g) => !g.stop)
        .map((g) => g.start)
      const bar = (b: number) =>
        starts.filter((t) => t >= b * 16 && t < b * 16 + 16).map((t) => t % 16)
      expect(bar(0)).not.toEqual(bar(1))
    }
  })

  it('ends each phrase on a stop: every drum at once, then silence', () => {
    const groove = piece.motifs.find((m) => m.id.startsWith('groove:'))!
    const last = Math.max(...groove.notes.map((n) => n.start))
    expect(groove.notes.filter((n) => n.start === last)).toHaveLength(3)
    expect(groove.length - last).toBeGreaterThanOrEqual(1)
  })

  it('pulls the bass across the groups into the next root', () => {
    const bass = piece.motifs.find((m) => m.id.startsWith('bass:'))!
    const bar = bass.notes.filter((n) => n.start < 4)
    expect(bar.length).toBeGreaterThan(4)
    expect(new Set(bar.map((n) => n.degree)).size).toBeGreaterThan(2)
    expect(bar.some((n) => n.start % 1 !== 0 && n.start % 0.5 !== 0)).toBe(true)
  })
})
