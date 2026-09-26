import { describe, expect, it } from 'vitest'
import type { Atlas, FileHealth, Timeline } from '../src/lib/atlas.ts'
import { smogPerFrame } from '../src/lib/city-health.ts'
import { cityLayout } from '../src/lib/city-layout.ts'
import { healthTracks } from '../src/lib/health.ts'
import { fromAtlas, seriesOf } from '../src/lib/series.ts'
import { atlas, file } from './fixture.ts'

/**
 * The city's tests that lived in `layouts`, `series` and `health` tests, cut
 * out when the city was archived. Restored, each goes back to its own file.
 */

// From `series.test.ts`.
const frame = (files: Atlas['files'], calls: Atlas['calls'] = []): Atlas => ({
  ...atlas(),
  files,
  calls,
  imports: [],
})

/** Three commits: `a` is written, then grows and gains a caller `b`, then `a` is deleted. */
function history(): Timeline {
  return {
    name: 'history',
    commits: ['1', '2', '3'].map((sha) => ({ sha, date: '', subject: sha })),
    frames: [
      frame([file('a.ts', { kinds: [2, 0, 0, 0, 0, 0, 0, 0] })]),
      // `b` sorts after `a`, so in this frame `a` is 0 and `b` is 1.
      frame(
        [file('a.ts', { kinds: [9, 0, 0, 0, 0, 0, 0, 0] }), file('b.ts')],
        [[1, 0, 4]],
      ),
      // Here `b` is the only file, so the frame-local index of `b` is 0.
      frame([file('b.ts', { size: 5000 })]),
    ],
  }
}

// From `health.test.ts`.
/** A health reading with nothing wrong, overridden where a test cares. */
function health(over: Partial<FileHealth> = {}): FileHealth {
  return {
    hotspot: 0,
    commits: 0,
    trend: 0,
    duplicated: 0,
    cyclic: false,
    ...over,
  }
}

/** Two frames of one repo: `a.ts` heats up and wears out, `b.ts` becomes unused. */
function frames(deadCode: boolean): Atlas[] {
  const base = { ...atlas(), calls: [], imports: [] }
  return [
    {
      ...base,
      files: [file('a.ts', { health: health() }), file('b.ts')],
      fallow: { version: '1', deadCode },
    },
    {
      ...base,
      files: [
        file('a.ts', {
          health: health({
            hotspot: 64,
            trend: 1,
            score: {
              maintainability: 50,
              density: 0,
              cyclomatic: 0,
              cognitive: 0,
              crap: 0,
            },
          }),
        }),
        file('b.ts', { health: health({ unused: true }) }),
      ],
      clones: [[0, 1, 12]],
      fallow: { version: '1', deadCode },
    },
  ]
}

const timeline = (deadCode: boolean) =>
  seriesOf({
    name: 'fixture',
    commits: [
      { sha: 'a', date: '', subject: '' },
      { sha: 'b', date: '', subject: '' },
    ],
    frames: frames(deadCode),
  })

// From `layouts.test.ts`.
describe('cityLayout', () => {
  const layout = cityLayout(fromAtlas(atlas()))

  it('builds one settlement per file and lights the most-called roof', () => {
    expect(layout.settlements).toHaveLength(5)
    expect(layout.beacons[0]).toBeGreaterThan(0)
    expect(layout.beacons[4]).toBe(0)
  })

  it('gives a file with more symbols more buildings', () => {
    expect(layout.settlements[0]!.count).toBeGreaterThan(
      layout.settlements[4]!.count,
    )
  })

  it('reads tiers off population: the hub with 8 symbols is at least a town', () => {
    expect(layout.settlements[0]!.tier).toBeGreaterThan(0)
  })

  it('gives a file with nothing declared a plain placeholder, not a run past the last kind', () => {
    // `c/three.ts` has no symbols at all; `a/leaf.ts` has one plain function.
    // Walking zero counts must not fall through to the last kind (namespace).
    const empty = layout.settlements[4]!
    const leaf = layout.settlements[1]!
    expect(empty.count).toBe(1)
    const lampOf = (s: (typeof layout.settlements)[number]): number[] =>
      Array.from(layout.buildings.lamp.subarray(s.offset * 3, s.offset * 3 + 3))
    expect(lampOf(empty)).toEqual(lampOf(leaf))
  })
})

describe('the city over a history', () => {
  const series = seriesOf(history())

  it('pops a settlement’s buildings in as its file gains symbols, and clears them once its file is gone', () => {
    const { buildings, settlements } = cityLayout(series)
    const a = settlements[0]!
    const b = settlements[1]!
    // `a.ts` declares 9 symbols at its largest, capped to the settlement's limit.
    expect(a.count).toBeLessThan(9)
    // Some of its buildings exist from the first frame, the rest from the second.
    const aBirths = buildings.births.subarray(a.offset, a.offset + a.count)
    expect([...aBirths].filter((f) => f === 0).length).toBeGreaterThan(0)
    expect([...aBirths].filter((f) => f === 1).length).toBeGreaterThan(0)
    // `a.ts` is deleted in frame 2, so every one of its buildings is gone by then.
    const aDeaths = buildings.deaths.subarray(a.offset, a.offset + a.count)
    expect([...aDeaths].every((f) => f === 2)).toBe(true)
    // `b.ts` exists from frame 1 onward.
    expect(buildings.births[b.offset]).toBe(1)
    expect(buildings.deaths[b.offset]).toBe(3)
  })
})

describe('health in the city', () => {
  it('lets only hotspots burn in the city', () => {
    expect(cityLayout(timeline(true)).hot).toEqual([0])
  })
  it("reads the whole city's trouble as weather, frame by frame", () => {
    const series = timeline(true)
    const smog = smogPerFrame(healthTracks(series), series)
    expect(smog).toHaveLength(2)
    // The fixture's first frame is sound; by the second, one file has gone hot
    // and worn and the other is unreachable, so the air thickens.
    expect(smog[0]!).toBe(0)
    expect(smog[1]!).toBeGreaterThan(0.3)
    for (const air of smog) expect(air).toBeGreaterThanOrEqual(0)
    for (const air of smog) expect(air).toBeLessThan(1)
  })
  it('reads a repository with nothing wrong as clear air', () => {
    const series = fromAtlas(atlas())
    expect(smogPerFrame(healthTracks(series), series)[0]).toBe(0)
  })
})
