import { describe, expect, it } from 'vitest'
import type { Atlas, Timeline } from '../src/lib/atlas.ts'
import { cityLayout } from '../src/lib/city-layout.ts'
import { galaxyLayout } from '../src/lib/galaxy-layout.ts'
import { fromAtlas, seriesOf, visibility } from '../src/lib/series.ts'
import { atlas, file } from './fixture.ts'

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

describe('seriesOf', () => {
  const series = seriesOf(history())

  it('merges every file that ever existed, each at its largest', () => {
    expect(series.merged.files.map((f) => f.path)).toEqual(['a.ts', 'b.ts'])
    expect(series.merged.files[0]!.kinds[0]).toBe(9)
    expect(series.merged.files[1]!.size).toBe(5000)
  })

  it('records the frames each file and call lives in', () => {
    expect(series.fileLife).toEqual([
      [0, 2],
      [1, 3],
    ])
    expect(series.merged.calls).toEqual([[1, 0, 4]])
    expect(series.callLife).toEqual([[1, 2]])
  })

  it('re-keys each frame by the merged index', () => {
    expect(series.at[2]![0]).toBeNull()
    expect(series.at[2]![1]!.path).toBe('b.ts')
  })

  it('keeps clone links through history, keyed like calls', () => {
    const base = history()
    const copied: Timeline = {
      ...base,
      frames: [
        base.frames[0]!,
        // `a` and `b` share 12 lines, then 30 once `b` grows.
        { ...base.frames[1]!, clones: [[0, 1, 12]] },
        {
          ...frame([file('a.ts'), file('b.ts'), file('c.ts')]),
          clones: [[0, 1, 30]],
          fallow: { version: '3.22.0', deadCode: false },
        },
      ],
    }
    const series = seriesOf(copied)
    expect(series.merged.clones).toEqual([[0, 1, 30]])
    expect(series.cloneLife).toEqual([[1, 3]])
    expect(series.merged.fallow?.version).toBe('3.22.0')
  })

  it('treats a single export as one frame', () => {
    const one = fromAtlas(atlas())
    expect(one.commits).toHaveLength(1)
    expect(one.fileLife.every(([b, d]) => b === 0 && d === 1)).toBe(true)
  })
})

describe('visibility', () => {
  it('fades in over the frame before birth and out over the frame after death', () => {
    expect(visibility([2, 4], 0.5)).toBe(0)
    expect(visibility([2, 4], 1.5)).toBe(0.5)
    expect(visibility([2, 4], 3)).toBe(1)
    expect(visibility([2, 4], 3.5)).toBe(0.5)
    expect(visibility([2, 4], 4)).toBe(0)
  })
})

describe('layouts over a history', () => {
  const series = seriesOf(history())

  it('lights more of a file’s stars as it gains symbols', () => {
    const { stars } = galaxyLayout(series)
    // `a` shows 9 stars: 2 exist from the first frame, 7 more from the second.
    const births = stars.births.slice(0, 9)
    expect(births.filter((b) => b === 0)).toHaveLength(2)
    expect(births.filter((b) => b === 1)).toHaveLength(7)
    expect(stars.deaths.slice(0, 9).every((d) => d === 2)).toBe(true)
  })

  it('gives a building no height in frames its file does not exist', () => {
    const [a, b] = cityLayout(series).buildings
    expect(a!.heights[2]).toBe(0)
    expect(b!.heights[0]).toBe(0)
    expect(a!.heights[1]).toBeGreaterThan(a!.heights[0]!)
  })
})
