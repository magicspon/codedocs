import { describe, expect, it } from 'vitest'
import type { Link } from '../src/lib/atlas.ts'
import {
  cursorFile,
  firstCursor,
  moveCursor,
  pathsOf,
  type Paths,
} from '../src/lib/paths.ts'

/** File 0 is called by 1 and 2, and calls 3 and 4; 5 calls itself. */
const LINKS: Link[] = [
  [1, 0, 2],
  [2, 0, 9],
  [0, 3, 1],
  [0, 4, 7],
  [0, 0, 5],
  [5, 6, 1],
]
const all = (): boolean => true

describe('pathsOf', () => {
  it('lists callers and callees, heaviest first, skipping self-calls', () => {
    expect(pathsOf(LINKS, 0, 'both', all)).toEqual({ in: [2, 1], out: [4, 3] })
  })

  it('leaves out the side the search does not follow', () => {
    expect(pathsOf(LINKS, 0, 'in', all)).toEqual({ in: [2, 1], out: [] })
    expect(pathsOf(LINKS, 0, 'out', all)).toEqual({ in: [], out: [4, 3] })
  })

  it('drops files absent from the frame on show', () => {
    expect(pathsOf(LINKS, 0, 'both', (f) => f !== 4).out).toEqual([3])
  })
})

describe('moveCursor', () => {
  const paths: Paths = { in: [2, 1], out: [4, 3, 7] }

  it('starts on the callees, or the callers when there are none', () => {
    expect(firstCursor(paths)).toEqual({ side: 'out', index: 0 })
    expect(firstCursor({ in: [1], out: [] })).toEqual({ side: 'in', index: 0 })
  })

  it('wraps up and down within a side', () => {
    const top = { side: 'out', index: 0 } as const
    expect(moveCursor(paths, top, 'up')).toEqual({ side: 'out', index: 2 })
    expect(moveCursor(paths, top, 'down')).toEqual({ side: 'out', index: 1 })
  })

  it('crosses sides, keeping the place where the other side is long enough', () => {
    const last = { side: 'out', index: 2 } as const
    expect(moveCursor(paths, last, 'left')).toEqual({ side: 'in', index: 1 })
    expect(moveCursor(paths, { side: 'in', index: 1 }, 'right')).toEqual({
      side: 'out',
      index: 1,
    })
  })

  it('stays put when moving onto an empty side', () => {
    const only: Paths = { in: [], out: [4] }
    const at = { side: 'out', index: 0 } as const
    expect(moveCursor(only, at, 'left')).toBe(at)
  })

  it('reads the file under the cursor', () => {
    expect(cursorFile(paths, { side: 'in', index: 1 })).toBe(1)
    expect(cursorFile({ in: [], out: [] }, firstCursor(paths))).toBeNull()
  })
})
