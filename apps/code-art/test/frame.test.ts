import { describe, expect, it } from 'vitest'
import type { Atlas, Timeline } from '../src/lib/atlas.ts'
import { detailFile, frameSummary, hoveredFile } from '../src/lib/frame.ts'
import { fromAtlas, seriesOf } from '../src/lib/series.ts'
import { atlas, file } from './fixture.ts'

const frame = (files: Atlas['files']): Atlas => ({
  ...atlas(),
  files,
  calls: [],
  imports: [],
})

/** Two commits: `a` alone, then `a` deleted and `b` written. */
function history(): Timeline {
  return {
    name: 'history',
    commits: ['1', '2'].map((sha) => ({ sha, date: '', subject: sha })),
    frames: [frame([file('a.ts')]), frame([file('b.ts')])],
  }
}

const series = seriesOf(history())

describe('hoveredFile', () => {
  it('reads the merged index against the frame on show', () => {
    expect(hoveredFile(series, 0, 0)?.path).toBe('a.ts')
    // `b` exists only in the second frame, so hovering it in the first is nothing.
    expect(hoveredFile(series, 0, 1)).toBeUndefined()
    expect(hoveredFile(series, 1, 1)?.path).toBe('b.ts')
  })

  it('is nothing when there is no series or no pointer', () => {
    expect(hoveredFile(null, 0, 0)).toBeUndefined()
    expect(hoveredFile(series, 0, null)).toBeUndefined()
  })

  it('clamps a frame past the end rather than falling off it', () => {
    expect(hoveredFile(series, 9, 1)?.path).toBe('b.ts')
  })
})

describe('frameSummary', () => {
  it('counts the files that existed then, at that commit', () => {
    expect(frameSummary(series, 0)).toEqual({
      present: 1,
      commit: { sha: '1', date: '', subject: '1' },
    })
  })

  it('clamps past the end', () => {
    expect(frameSummary(series, 9).commit?.sha).toBe('2')
  })

  it('reads a single export as its one frame', () => {
    expect(frameSummary(fromAtlas(atlas()), 0).present).toBe(5)
  })
})

describe('detailFile', () => {
  it('shows the hovered file first', () => {
    expect(detailFile(2, [5])).toBe(2)
  })

  it('falls back to the one file a search selects', () => {
    expect(detailFile(null, [5])).toBe(5)
  })

  it('shows nothing when the search matches several files, or none', () => {
    expect(detailFile(null, [5, 6])).toBeNull()
    expect(detailFile(null, undefined)).toBeNull()
  })
})
