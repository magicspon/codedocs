import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import {
  heading,
  IDLE,
  launch,
  nearby,
  faded,
  nearest,
  nearness,
  reslot,
  spent,
  speedLimit,
  steer,
} from '../src/lib/craft.ts'
import { orbitsOf, reachOf } from '../src/lib/orbits.ts'
import { file } from './fixture.ts'

const craft = () => launch(new Vector3(), new Vector3(0, 0, -1))

describe('launch', () => {
  it('points the nose the way it was launched', () => {
    const c = launch(new Vector3(1, 2, 3), new Vector3(1, 0, 0))
    expect(
      heading(c, new Vector3()).distanceTo(new Vector3(1, 0, 0)),
    ).toBeCloseTo(0)
    expect(c.position.toArray()).toEqual([1, 2, 3])
  })

  it('stops short of straight up', () => {
    const c = launch(new Vector3(), new Vector3(0, 1, 0))
    expect(c.pitch).toBeLessThan(Math.PI / 2)
  })
})

describe('steer', () => {
  it('flies forward under thrust, no faster than the limit', () => {
    const c = craft()
    for (let i = 0; i < 120; i++) steer(c, { ...IDLE, thrust: 1 }, 1 / 60, 2)
    expect(c.position.z).toBeLessThan(0)
    expect(c.velocity.length()).toBeCloseTo(2)
  })

  it('goes faster under boost', () => {
    const c = craft()
    for (let i = 0; i < 120; i++)
      steer(c, { ...IDLE, thrust: 1, boost: true }, 1 / 60, 2)
    expect(c.velocity.length()).toBeGreaterThan(2)
  })

  it('coasts to a stop with no keys held', () => {
    const c = craft()
    c.velocity.set(0, 0, -5)
    for (let i = 0; i < 600; i++) steer(c, IDLE, 1 / 60, 10)
    expect(c.velocity.length()).toBeLessThan(0.01)
  })

  it('turns left on A and banks into it', () => {
    const c = craft()
    for (let i = 0; i < 30; i++) steer(c, { ...IDLE, turn: -1 }, 1 / 60, 1)
    expect(heading(c, new Vector3()).x).toBeLessThan(0)
    expect(c.turn).toBeLessThan(0)
  })
})

describe('speedLimit', () => {
  it('is slow near a star and quick in open space, within bounds', () => {
    expect(speedLimit(0)).toBeGreaterThan(0)
    expect(speedLimit(1)).toBeLessThan(speedLimit(10))
    expect(speedLimit(1e6)).toBe(speedLimit(1e7))
  })
})

describe('nearby', () => {
  const anchors = [
    [0, 0, 0],
    [5, 0, 0],
    [20, 0, 0],
  ] as const
  const ranges = [3, 3, 3]

  it('lists stars in range, nearest first', () => {
    expect(nearby(anchors, ranges, new Vector3(4, 0, 0), 3, [])).toEqual([1])
    expect(nearby(anchors, ranges, new Vector3(2.5, 0, 0), 3, [])).toEqual([
      0, 1,
    ])
    expect(nearby(anchors, ranges, new Vector3(2.5, 0, 0), 1, [])).toEqual([0])
  })

  it('holds a shown star a little past its range', () => {
    const at = new Vector3(3.2, 0, 0)
    expect(nearby(anchors, ranges, at, 3, [])).toEqual([1])
    expect(nearby(anchors, ranges, at, 3, [0])).toEqual([1, 0])
  })

  it('keeps a shown star until a newcomer is clearly nearer', () => {
    const wide = [30, 30, 30]
    expect(nearby(anchors, wide, new Vector3(2.8, 0, 0), 1, [])).toEqual([1])
    expect(nearby(anchors, wide, new Vector3(2.8, 0, 0), 1, [0])).toEqual([0])
    expect(nearby(anchors, wide, new Vector3(4.5, 0, 0), 1, [0])).toEqual([1])
  })

  it('passes over stars it is told not to keep', () => {
    const at = new Vector3(2.5, 0, 0)
    expect(nearby(anchors, ranges, at, 3, [], (f) => f !== 0)).toEqual([1])
  })

  it('measures to the nearest star', () => {
    expect(nearest(anchors, new Vector3(18, 0, 0))).toBe(2)
  })
})

describe('nearness', () => {
  it('is nothing at the edge and full halfway in', () => {
    expect(nearness(10, 10)).toBe(0)
    expect(nearness(20, 10)).toBe(0)
    expect(nearness(5, 10)).toBe(1)
    expect(nearness(7.5, 10)).toBeCloseTo(0.5)
  })
})

describe('faded', () => {
  it('fades in slowly and out quickly, within 0 and 1', () => {
    expect(faded(0, true, 0.6)).toBeCloseTo(0.5)
    expect(faded(0.9, true, 1)).toBe(1)
    expect(faded(1, false, 0.2)).toBeCloseTo(0.5)
    expect(faded(0.1, false, 1)).toBe(0)
  })
})

describe('spent', () => {
  it('is done once faded out or out of sight, and only when leaving', () => {
    expect(spent(true, 0, 1)).toBe(true)
    expect(spent(true, 0.5, 0)).toBe(true)
    expect(spent(true, 0.5, 1)).toBe(false)
    expect(spent(false, 0, 0)).toBe(false)
  })
})

describe('reslot', () => {
  it('keeps a shown star in its slot and fills gaps', () => {
    expect(reslot([4, null, 7], [7, 9])).toEqual([9, null, 7])
    expect(reslot([4, null, 7], [4, 7])).toBeNull()
  })
})

describe('reachOf', () => {
  it('matches the laid-out system', () => {
    for (const kinds of [
      [1, 0, 0, 0, 0, 0, 0, 0],
      [5, 1, 0, 0, 0, 2, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
    ]) {
      const f = file('a.ts', { kinds })
      expect(reachOf(f)).toBeCloseTo(orbitsOf(f, null).reach)
    }
  })
})
