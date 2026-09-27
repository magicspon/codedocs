import { describe, expect, it } from 'vitest'
import { placeFiles } from '../src/lib/galaxy-placement.ts'
import {
  galaxyStructure,
  shapeOf,
  type GalaxyShape,
} from '../src/lib/galaxy-shape.ts'
import { rng } from '../src/lib/rng.ts'
import { atlas, file } from './fixture.ts'

describe('shapeOf', () => {
  it('reads the shape from pull and halo', () => {
    expect(shapeOf(0.75, 0.05)).toBe('elliptical')
    expect(shapeOf(0.64, 0.09)).toBe('barred')
    expect(shapeOf(0.4, 0.1)).toBe('spiral')
    expect(shapeOf(0.47, 0.78)).toBe('irregular')
  })

  it('makes a lump elliptical whatever its folders do', () => {
    expect(shapeOf(0.8, 0.9)).toBe('elliptical')
  })
})

describe('galaxyStructure', () => {
  it('measures how much pull the top files hold', () => {
    // One file takes every call: all the pull sits in the top 5%.
    const hub = galaxyStructure({
      files: [
        file('a/hub.ts', { callsIn: 100 }),
        ...Array.from({ length: 30 }, (_, i) => file(`b/${i}.ts`)),
      ],
      imports: [],
    })
    expect(hub.pull).toBe(1)
    expect(hub.shape).toBe('elliptical')
    expect(hub.rank[0]).toBe(0)
  })

  it('counts files outside the eight largest folders as halo', () => {
    const scattered = galaxyStructure({
      files: Array.from({ length: 20 }, (_, i) => file(`d${i}/x.ts`)),
      imports: [],
    })
    expect(scattered.arms.length).toBe(8)
    expect(scattered.halo).toBeCloseTo(12 / 20)
    expect(scattered.shape).toBe('irregular')
  })
})

describe('placeFiles', () => {
  const structure = galaxyStructure(atlas())
  const place = (shape: GalaxyShape): number[][] =>
    placeFiles({ ...structure, shape }, 20, rng(1), rng(2))
  const distance = ([x, y, z]: number[]): number => Math.hypot(x!, y!, z!)

  it('places every file somewhere finite, for every shape', () => {
    for (const shape of [
      'spiral',
      'barred',
      'elliptical',
      'irregular',
    ] as const) {
      const points = place(shape)
      expect(points.length).toBe(5)
      for (const p of points.flat()) expect(Number.isFinite(p)).toBe(true)
    }
  })

  it('is the same every time for one dataset', () => {
    expect(place('irregular')).toEqual(place('irregular'))
  })

  it('keeps the most leaned-on file nearest the middle of an elliptical', () => {
    const points = place('elliptical')
    for (let i = 1; i < 5; i++)
      expect(distance(points[0]!)).toBeLessThan(distance(points[i]!))
  })
})
