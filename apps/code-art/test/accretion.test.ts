import { describe, expect, it } from 'vitest'
import { discStar, tiltOf } from '../src/lib/accretion.ts'
import { isTest } from '../src/lib/atlas.ts'
import { rng } from '../src/lib/rng.ts'

describe('discStar', () => {
  const random = rng(5)
  const tilt = tiltOf(random)
  const stars = Array.from({ length: 1000 }, () => discStar(random, 2, tilt, 1))
  const reach = stars.map((s) => Math.hypot(...s.offset))

  it('leaves the middle dark', () => {
    // The disc's thickness can dip a star a hair inside its edge, no more.
    expect(Math.min(...reach)).toBeGreaterThan(2 * 0.95)
    expect(Math.max(...reach)).toBeLessThan(2 * 2.6 * 1.1)
  })

  it('burns brightest at the inner edge', () => {
    const inner = stars.filter((_, i) => reach[i]! < 2.4)
    const outer = stars.filter((_, i) => reach[i]! > 4.4)
    const mean = (xs: typeof stars): number =>
      xs.reduce((sum, s) => sum + s.color.r, 0) / xs.length
    expect(mean(inner)).toBeGreaterThan(mean(outer))
  })
})

describe('isTest', () => {
  it('knows a test file by its role', () => {
    expect(isTest({ role: 1, path: 'src/a.ts' })).toBe(true)
    expect(isTest({ role: 2, path: 'src/a.ts' })).toBe(false)
  })

  it('knows one by its name where the index has no labels', () => {
    for (const path of [
      'test/monaco/monaco.test.ts',
      'src/a.spec.tsx',
      'lib/b.test.mjs',
      'src/__tests__/c.ts',
    ])
      expect(isTest({ role: 0, path })).toBe(true)
    for (const path of ['src/test.ts', 'src/testing/a.ts', 'src/latest.ts'])
      expect(isTest({ role: 0, path })).toBe(false)
  })
})
