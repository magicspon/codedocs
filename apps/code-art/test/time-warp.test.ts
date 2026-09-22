import { describe, expect, it } from 'vitest'
import type { Atlas } from '../src/lib/atlas.ts'
import { seriesOf } from '../src/lib/series.ts'
import { keyFrames, unwarp, warp } from '../src/lib/time-warp.ts'
import { atlas, file } from './fixture.ts'

const frame = (files: Atlas['files']): Atlas => ({
  ...atlas(),
  files,
  calls: [],
  imports: [],
})

/** Ten commits: `a` is written at 2 and grows at 7; `b` changes every commit. */
function history(): ReturnType<typeof seriesOf> {
  const frames = Array.from({ length: 10 }, (_, f) =>
    frame([
      ...(f >= 2 ? [file('a.ts', { size: f >= 7 ? 2000 : 1000 })] : []),
      file('b.ts', { size: 100 + f }),
    ]),
  )
  return seriesOf({
    name: 'warp',
    commits: frames.map((_, f) => ({ sha: `${f}`, date: '', subject: '' })),
    frames,
  })
}

describe('keyFrames', () => {
  it('keeps the frames a file changes in, the one before, and the last', () => {
    expect(keyFrames(history(), [0])).toEqual([1, 2, 7, 9])
  })

  it('keeps every frame for a file that always changes', () => {
    expect(keyFrames(history(), [1])).toHaveLength(10)
  })
})

describe('warp', () => {
  const keys = [1, 2, 7, 9]

  it('lands on each key at a whole step', () => {
    expect(keys.map((_, i) => warp(keys, i))).toEqual(keys)
  })

  it('skips the quiet frames, playing only the one before the next key', () => {
    expect(warp(keys, 1.5)).toBe(6.5)
    expect(warp(keys, 0.5)).toBe(1.5)
  })

  it('round-trips through unwarp', () => {
    for (const step of [0, 0.25, 1, 1.5, 2.75, 3])
      expect(unwarp(keys, warp(keys, step))).toBeCloseTo(step)
  })

  it('clamps frames outside the keys', () => {
    expect(unwarp(keys, 0)).toBe(0)
    expect(unwarp(keys, 20)).toBe(3)
    expect(unwarp(keys, 4)).toBe(1)
  })
})
