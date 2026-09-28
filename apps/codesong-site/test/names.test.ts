import { realise, type Song } from '@codedocs/codesong/browser'
import { describe, expect, it } from 'vitest'
import { noteNames } from '../src/explain/names.ts'
import nextjs from '../songs/nextjs.song.json' with { type: 'json' }
import router from '../songs/router.song.json' with { type: 'json' }
import { heard } from './heard.ts'

/** Every name shown for one song, with the track each came from. */
function shown(song: Song): { role: string; name: string }[] {
  const tracks = realise(song.composition)
  const names = noteNames(song.composition, tracks, song.evidence)
  return tracks.flatMap((track, t) =>
    names[t]!.map((name) => ({ role: track.role, name })),
  )
}

describe('the names shown as notes sound', () => {
  it('are symbols the playing files declare', () => {
    const song = heard(nextjs)
    const declared = new Set(Object.values(song.evidence.symbols!).flat())
    const names = shown(song).filter((n) => n.name !== '')
    expect(names.length).toBeGreaterThan(0)
    // A few files declare nothing at the top level and show their own name.
    const symbols = names.filter((n) => declared.has(n.name))
    expect(symbols.length / names.length).toBeGreaterThan(0.9)
  })

  it('fall back to file names for a song exported without symbols', () => {
    const names = shown(heard(router)).filter((n) => n.name !== '')
    expect(names.length).toBeGreaterThan(0)
    for (const { name } of names) expect(name).toMatch(/\.[a-z]+$/)
  })

  it('leave drum hits unnamed', () => {
    const drums = shown(heard(nextjs)).filter((n) => n.role === 'percussion')
    expect(drums.every((n) => n.name === '')).toBe(true)
  })
})
