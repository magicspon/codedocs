import { Color } from 'three'
import { describe, expect, it } from 'vitest'
import { rng } from '../src/lib/rng.ts'
import { starLook } from '../src/lib/star-look.ts'

describe('starLook', () => {
  const random = rng(7)
  const looks = Array.from({ length: 2000 }, () =>
    starLook(new Color('#7ad7ff'), 1, random),
  )
  const sizes = looks.map((l) => l.size).sort((a, b) => a - b)

  it('makes most stars small and a few large', () => {
    const median = sizes[sizes.length / 2]!
    const top = sizes[Math.floor(sizes.length * 0.98)]!
    expect(top).toBeGreaterThan(median * 1.8)
    expect(sizes[0]!).toBeGreaterThan(0)
  })

  it('varies the colour of stars of one kind', () => {
    const hues = new Set(looks.map((l) => l.color.getHexString()))
    expect(hues.size).toBeGreaterThan(looks.length / 2)
  })

  it('dims stars in the crowded core', () => {
    const core = starLook(new Color(1, 1, 1), 0, rng(3)).color
    const rim = starLook(new Color(1, 1, 1), 1, rng(3)).color
    expect(core.r).toBeLessThan(rim.r)
  })
})
