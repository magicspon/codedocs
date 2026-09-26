import { describe, expect, it } from 'vitest'
import { treemap, type Rect } from '../src/lib/treemap.ts'

const area = (r: Rect): number => r.w * r.h
const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w - 1e-9 &&
  b.x < a.x + a.w - 1e-9 &&
  a.y < b.y + b.h - 1e-9 &&
  b.y < a.y + a.h - 1e-9

describe('treemap', () => {
  const paths = [
    'src/a.ts',
    'src/b.ts',
    'src/lib/c.ts',
    'test/d.ts',
    'README.ts',
  ]
  const weights = [1, 2, 3, 4, 10]

  it('gives each file an area proportional to its weight when there is no padding', () => {
    const { files } = treemap(paths, weights, 10, 0)
    const total = weights.reduce((a, b) => a + b, 0)
    files.forEach((rect, i) =>
      expect(area(rect)).toBeCloseTo((100 * weights[i]!) / total, 6),
    )
  })

  it('keeps every file inside the square and apart from every other', () => {
    const { files } = treemap(paths, weights, 10, 0.2)
    for (const r of files) {
      expect(r.x).toBeGreaterThanOrEqual(-5 - 1e-9)
      expect(r.y).toBeGreaterThanOrEqual(-5 - 1e-9)
      expect(r.x + r.w).toBeLessThanOrEqual(5 + 1e-9)
      expect(r.y + r.h).toBeLessThanOrEqual(5 + 1e-9)
    }
    for (let i = 0; i < files.length; i++) {
      for (let j = i + 1; j < files.length; j++)
        expect(overlaps(files[i]!, files[j]!)).toBe(false)
    }
  })

  it('collapses a directory that only holds one directory', () => {
    const { regions } = treemap(
      ['x/y/z/a.ts', 'x/y/z/b.ts', 'w/c.ts'],
      [1, 1, 1],
      10,
      0,
    )
    expect(regions.map((r) => r.path).sort()).toEqual(['w', 'x/y/z'])
  })

  it('lays out nothing when every weight is zero', () => {
    const { files } = treemap(['a.ts'], [0], 10, 0)
    expect(area(files[0]!)).toBe(0)
  })
})
