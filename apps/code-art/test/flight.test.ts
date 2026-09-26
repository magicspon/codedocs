import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { along, approach, easeInOut, route } from '../src/lib/flight.ts'
import { orbitsOf } from '../src/lib/orbits.ts'
import { file } from './fixture.ts'

const shot = (target: Vector3, position: Vector3) => ({ target, position })

describe('approach', () => {
  it('keeps the bearing and stands the asked distance away', () => {
    const from = shot(new Vector3(0, 0, 0), new Vector3(10, 5, 0))
    const to = approach(from, new Vector3(3, 1, 3), 4, 0)
    expect(to.target.toArray()).toEqual([3, 1, 3])
    expect(to.position.distanceTo(to.target)).toBeCloseTo(4)
    // Still east of what it looks at, level with it.
    expect(to.position.x).toBeCloseTo(7)
    expect(to.position.y).toBeCloseTo(1)
  })

  it('picks a side when looking straight down', () => {
    const from = shot(new Vector3(0, 0, 0), new Vector3(0, 10, 0))
    const to = approach(from, new Vector3(0, 0, 0), 2, 0.5)
    expect(Number.isFinite(to.position.x)).toBe(true)
    expect(to.position.length()).toBeCloseTo(2)
  })
})

describe('along', () => {
  const a = shot(new Vector3(0, 0, 0), new Vector3(0, 0, 10))
  const b = shot(new Vector3(10, 0, 0), new Vector3(10, 0, 10))
  const out = { target: new Vector3(), position: new Vector3() }

  it('starts at the start and lands on the end', () => {
    along(a, b, 0, 0.5, out)
    expect(out.position.toArray()).toEqual([0, 0, 10])
    along(a, b, 1, 0.5, out)
    expect(out.position.x).toBeCloseTo(10)
    expect(out.position.y).toBeCloseTo(0)
  })

  it('bows upward mid-flight by the lift', () => {
    along(a, b, 0.5, 0.5, out)
    expect(out.position.y).toBeCloseTo(5)
    expect(out.target.x).toBeCloseTo(5)
  })

  it('eases in and out', () => {
    expect(easeInOut(0)).toBe(0)
    expect(easeInOut(1)).toBe(1)
    expect(easeInOut(0.1)).toBeLessThan(0.1)
    expect(easeInOut(2)).toBe(1)
  })
})

describe('route', () => {
  const here = shot(new Vector3(0, 0, 0), new Vector3(0, 0, 9))
  const there = shot(new Vector3(5, 0, 0), new Vector3(5, 0, 3))
  const aim = () => there

  it('flies to a pick and remembers where it left from', () => {
    expect(route(3, here, null, aim)).toEqual({ to: there, home: here })
  })

  it('keeps the first home when picking another file', () => {
    const home = shot(new Vector3(), new Vector3(1, 1, 1))
    expect(route(4, here, home, aim).home).toBe(home)
  })

  it('flies home once the pick is cleared, and forgets it', () => {
    expect(route(null, there, here, aim)).toEqual({ to: here, home: null })
    expect(route(null, there, null, aim)).toEqual({ to: null, home: null })
  })
})

describe('orbitsOf', () => {
  const f = file('src/a.ts', { kinds: [5, 2, 0, 0, 0, 3, 0, 0] })

  it('gives each planet its own orbit, rocky ones innermost, variables a belt', () => {
    const { rings } = orbitsOf(f)
    expect(rings.map((r) => [r.kind, r.form, r.planets.length])).toEqual([
      [0, 'orbit', 1],
      [0, 'orbit', 1],
      [0, 'orbit', 1],
      [0, 'orbit', 1],
      [0, 'orbit', 1],
      [5, 'belt', 3],
      [1, 'orbit', 1],
      [1, 'orbit', 1],
    ])
    expect(rings[0]!.radius).toBeLessThan(rings[5]!.radius)
    // Inner rings run faster.
    expect(rings[0]!.speed).toBeGreaterThan(rings[7]!.speed)
  })

  it('draws the same system for the same file', () => {
    expect(orbitsOf(f)).toEqual(orbitsOf(f))
  })

  it('caps a crowded belt but keeps the true count', () => {
    const big = orbitsOf(file('big.ts', { kinds: [5000, 0, 0, 0, 0, 0, 0, 0] }))
    const belt = big.rings.find((r) => r.form === 'belt')!
    expect(belt.count).toBe(5000 - 6)
    expect(belt.planets.length).toBeLessThan(belt.count)
  })

  it('reaches as far as its outer orbit', () => {
    const { rings, reach } = orbitsOf(f)
    expect(reach).toBe(rings.at(-1)!.radius)
  })
})
