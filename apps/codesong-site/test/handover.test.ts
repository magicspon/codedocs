import { describe, expect, it } from 'vitest'
import type { Section } from '@codedocs/codesong/browser'
import { carry, takeOver, type Resumable } from '../src/audio/handover.ts'

/** Sections of these lengths, back to back. */
function laid(...lengths: number[]): Section[] {
  let start = 0
  return lengths.map((length, i) => {
    const s: Section = {
      name: `s${i}`,
      form: 'verse',
      source: `s${i}`,
      start,
      length,
      intensity: 0.5,
      area: 0,
    }
    start += length
    return s
  })
}

const short = laid(32, 64)
const long = laid(64, 128)

/** A player that records what was asked of it. */
function fake(): Resumable & { calls: string[] } {
  const calls: string[] = []
  const player = {
    calls,
    playing: false,
    mute: (track: string, muted: boolean) =>
      calls.push(`mute ${track} ${muted}`),
    seek: (beats: number) => calls.push(`seek ${beats}`),
    play: async () => {
      calls.push('play')
      player.playing = true
    },
  }
  return player
}

describe('handing over to a new player', () => {
  it('starts a first player from the top, nothing muted', () => {
    const p = fake()
    expect(takeOver(p, null, short, () => {}).size).toBe(0)
    expect(p.calls).toEqual([])
  })

  it('keeps the place and the muted tracks, and plays on if it was playing', async () => {
    const p = fake()
    let playing = false
    const off = takeOver(
      p,
      { beats: 64, sections: short, playing: true, muted: new Set(['bass']) },
      short,
      (now) => (playing = now),
    )
    await Promise.resolve()
    expect([...off]).toEqual(['bass'])
    expect(p.calls).toEqual(['mute bass true', 'seek 64', 'play'])
    expect(playing).toBe(true)
  })

  it('stays paused if the last player was paused', () => {
    const p = fake()
    takeOver(
      p,
      { beats: 8, sections: short, playing: false, muted: new Set() },
      short,
      () => {},
    )
    expect(p.calls).toEqual(['seek 8'])
  })

  it('keeps the same place in the same section when sections are longer', () => {
    // Halfway through the second section, in both.
    expect(carry(64, short, long)).toBe(128)
    expect(carry(16, short, long)).toBe(32)
    // Past the end stays where it was.
    expect(carry(500, short, long)).toBe(500)
  })
})
