import { Color } from 'three'
import { describe, expect, it } from 'vitest'
import { dust } from '../src/lib/dust.ts'
import { rng } from '../src/lib/rng.ts'

const centres = [
  [0, 0, 0],
  [10, 0, 0],
  [0, 0, 10],
] as const
const white = (): readonly [Color, Color] => [
  new Color(1, 1, 1),
  new Color(1, 1, 1),
]

describe('dust', () => {
  it('gives a heavier call a thicker lane', () => {
    const lanes = dust(
      [
        [0, 1, 100],
        [0, 2, 1],
      ],
      [
        [0, 3],
        [1, 2],
      ],
      centres,
      white,
      rng(1),
    )
    const heavy = [...lanes.births].filter((b) => b === 0).length
    const light = [...lanes.births].filter((b) => b === 1).length
    expect(heavy).toBeGreaterThan(light)
    expect(light).toBeGreaterThan(0)
  })

  it('keeps each puff alive only as long as its call', () => {
    const lanes = dust([[0, 1, 5]], [[2, 7]], centres, white, rng(1))
    expect(new Set(lanes.births)).toEqual(new Set([2]))
    expect(new Set(lanes.deaths)).toEqual(new Set([7]))
  })

  it('thins every lane rather than exceed its budget', () => {
    const many = Array.from({ length: 5000 }, () => [0, 1, 50] as const)
    const lives = many.map(() => [0, 1] as const)
    const lanes = dust(many, lives, centres, white, rng(1))
    expect(lanes.sizes.length).toBeLessThanOrEqual(60000)
    expect(lanes.sizes.length).toBeGreaterThanOrEqual(5000)
  })

  it('draws no dust for no calls', () => {
    expect(dust([], [], centres, white, rng(1)).sizes.length).toBe(0)
  })
})
