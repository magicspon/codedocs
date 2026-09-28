import { describe, expect, it } from 'vitest'
import { takeOver, type Resumable } from '../src/audio/handover.ts'

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
    expect(takeOver(p, null, () => {}).size).toBe(0)
    expect(p.calls).toEqual([])
  })

  it('keeps the place and the muted tracks, and plays on if it was playing', async () => {
    const p = fake()
    let playing = false
    const off = takeOver(
      p,
      { beats: 64, playing: true, muted: new Set(['bass']) },
      (now) => (playing = now),
    )
    await Promise.resolve()
    expect([...off]).toEqual(['bass'])
    expect(p.calls).toEqual(['mute bass true', 'seek 64', 'play'])
    expect(playing).toBe(true)
  })

  it('stays paused if the last player was paused', () => {
    const p = fake()
    takeOver(p, { beats: 8, playing: false, muted: new Set() }, () => {})
    expect(p.calls).toEqual(['seek 8'])
  })
})
