import type { RealisedTrack } from '@codedocs/codesong/browser'
import { describe, expect, it } from 'vitest'
import { due, fly, jumped, readerAt } from '../src/scene/launch.ts'

/** A track with a note starting at each of `starts`. */
const track = (id: string, starts: number[]): RealisedTrack =>
  ({
    id,
    notes: starts.map((start) => ({ start })),
  }) as unknown as RealisedTrack

const arp = track('arp', [0, 0.25, 0.5, 0.75, 1, 1.25])
const names = [['a', 'b', 'c', 'd', 'e', 'f']]

describe('launching symbol names', () => {
  it('launches at most one name a beat from a track', () => {
    const reader = readerAt([arp], 0)
    const launched = due([arp], names, new Set(), reader, 1.5)
    expect(launched).toEqual([
      { track: 0, note: 0 },
      { track: 0, note: 4 },
    ])
    // Read past, so the same notes never launch twice.
    expect(due([arp], names, new Set(), reader, 1.5)).toEqual([])
  })

  it('launches nothing from a muted track, or a note without a name', () => {
    expect(due([arp], names, new Set(['arp']), readerAt([arp], 0), 2)).toEqual(
      [],
    )
    expect(due([arp], [['', '']], new Set(), readerAt([arp], 0), 0.3)).toEqual(
      [],
    )
  })

  it('starts reading from where the viewer seeked to', () => {
    const launched = due([arp], names, new Set(), readerAt([arp], 1), 1.3)
    expect(launched).toEqual([{ track: 0, note: 4 }])
  })

  it('tells playing on from standing still, rewinding or leaping', () => {
    expect(jumped(1, 1.1)).toBe(false)
    expect(jumped(1, 1)).toBe(true)
    expect(jumped(1, 0.5)).toBe(true)
    expect(jumped(1, 8)).toBe(true)
  })
})

describe('names in the air', () => {
  const old = { born: 0 }
  const young = { born: 900 }

  it('keeps the same list when nothing changes, so React can skip a render', () => {
    const flying = [young]
    expect(fly(flying, [], 1000, 500, 16)).toBe(flying)
  })

  it('drops names that have lived their time and keeps the newest', () => {
    const born = { born: 1000 }
    expect(fly([old, young], [born], 1000, 500, 16)).toEqual([young, born])
    expect(fly([young], [born, born], 1000, 500, 2)).toEqual([born, born])
  })
})
