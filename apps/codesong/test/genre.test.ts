import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Atlas } from '@codedocs/code-art/atlas'
import { describe, expect, it } from 'vitest'
import { compose, DEFAULT_OPTIONS } from '../src/compose/compose.ts'
import { GENRE_NAMES, GENRES, suggest } from '../src/compose/genre.ts'
import type { Composition, GenreName } from '../src/model.ts'
import { analyse } from '../src/regions.ts'
import { realise, swung } from '../src/render/realise.ts'
import { readStructure } from '../src/structure.ts'

function exported(name: string) {
  const path = join(import.meta.dirname, `../../code-art/src/data/${name}.json`)
  return analyse(readStructure(JSON.parse(readFileSync(path, 'utf8')) as Atlas))
}

const vscode = exported('vscode')
const inGenre = (genre: GenreName): Composition =>
  compose(vscode, { ...DEFAULT_OPTIONS, genre })

/** The drum notes of `piece` that start in the first bar of `section`. */
function firstBar(piece: Composition, section: number) {
  const s = piece.sections[section]!
  const drums = realise(piece).find((t) => t.role === 'percussion')!
  return drums.notes.filter((n) => n.start >= s.start && n.start < s.start + 4)
}

describe('genres', () => {
  it('lets the code suggest the genre unless one is named', () => {
    const suggested = suggest(vscode)
    expect(suggested.genre).toBe('techno')
    expect(compose(vscode, DEFAULT_OPTIONS).genre).toBe(suggested.genre)
    expect(inGenre('ambient').genre).toBe('ambient')
  })

  it('suggests from how busy and how tangled the code is', () => {
    expect(suggest(exported('sentry')).genre).toBe('ambient')
    expect(suggest(exported('typescript')).genre).toBe('dnb')
  })

  it('plays the same code-derived material in every genre', () => {
    const pieces = GENRE_NAMES.map(inGenre)
    for (const piece of pieces) {
      expect(piece.key).toBe(pieces[0]!.key)
      expect(piece.sections).toEqual(pieces[0]!.sections)
      expect(piece.motifs.find((m) => m.id === 'theme')).toEqual(
        pieces[0]!.motifs.find((m) => m.id === 'theme'),
      )
    }
  })

  it('takes tempo and scale from the genre unless the caller names them', () => {
    expect(inGenre('dnb').tempo).toBe(GENRES.dnb.tempo)
    expect(inGenre('lofi').scale).toBe('dorian')
    const named = compose(vscode, {
      ...DEFAULT_OPTIONS,
      genre: 'dnb',
      tempo: 90,
      scale: 'phrygian',
    })
    expect([named.tempo, named.scale]).toEqual([90, 'phrygian'])
  })

  it('puts a techno kick on every beat, from the intro on', () => {
    const kicks = firstBar(inGenre('techno'), 0).filter((n) => n.pitch === 36)
    expect(kicks.map((n) => n.start % 4)).toEqual([0, 1, 2, 3])
  })

  it('keeps ambient drums to quiet hats', () => {
    const verse = inGenre('ambient').sections.findIndex(
      (s) => s.form === 'verse',
    )
    const hits = firstBar(inGenre('ambient'), verse)
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.every((n) => n.pitch === 42 && n.velocity < 50)).toBe(true)
  })

  it('plays drum and bass snares on two and four over a two-step kick', () => {
    const piece = inGenre('dnb')
    const chorus = piece.sections.findIndex((s) => s.form === 'chorus')
    const bar = firstBar(piece, chorus)
    const at = (pitch: number) =>
      bar
        .filter((n) => n.pitch === pitch && n.velocity >= 100)
        .map((n) => n.start % 4)
    expect(at(38)).toEqual([1, 3])
    expect(at(36)).toContain(2.5)
  })

  it('slows the melody where the genre floats it', () => {
    const lead = (p: Composition) =>
      p.tracks
        .find((t) => t.role === 'lead')!
        .parts.map((x) => x.transform.stretch)
    expect(lead(inGenre('ambient'))).toEqual(
      lead(inGenre('lofi')).map((s) => s * 2),
    )
  })

  it('swings off-beat sixteenths late and leaves the rest alone', () => {
    expect(swung(1.25, 0.08)).toBeCloseTo(1.33)
    expect(swung(1.75, 0.08)).toBeCloseTo(1.83)
    expect(swung(1.5, 0.08)).toBe(1.5)
    const lofi = realise(inGenre('lofi')).flatMap((t) => t.notes)
    expect(lofi.some((n) => Math.abs((n.start % 0.5) - 0.33) < 1e-6)).toBe(true)
  })
})
