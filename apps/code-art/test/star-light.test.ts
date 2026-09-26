import { describe, expect, it } from 'vitest'
import { starLight } from '../src/lib/star-light.ts'

const always = [0, 10] as const

describe('starLight', () => {
  it('is full with no search, and out before the file exists', () => {
    expect(starLight(always, 5, 0, 0, 0)).toBe(1)
    expect(starLight([6, 10], 3, 0, 0, 0)).toBe(0)
  })

  it('sinks a file a search passes by, but not the searched one', () => {
    expect(starLight(always, 5, 0, 1, 0)).toBeCloseTo(0.06)
    expect(starLight(always, 5, 1, 1, 0)).toBe(1)
    expect(starLight(always, 5, 0.6, 1, 0)).toBeGreaterThan(0.5)
  })

  it('puts out what isolation hides, and only that', () => {
    expect(starLight(always, 5, 0, 1, 1)).toBe(0)
    expect(starLight(always, 5, 0.6, 1, 1)).toBeGreaterThan(0)
  })
})
