import { describe, expect, it } from 'vitest'
import { zonesOf, zonesReach, type Member } from '../src/lib/planet-zones.ts'

/** Members by kind: `counts[kind]` bare symbols, numbered in order; `children` by symbol. */
function members(
  counts: readonly number[],
  children: number[] = [],
): Member[][] {
  let next = 0
  return Array.from({ length: 8 }, (_, kind) =>
    Array.from({ length: counts[kind] ?? 0 }, () => {
      const symbol = next++
      return { symbol, children: children[symbol] ?? 0 }
    }),
  )
}

describe('zonesOf', () => {
  it('lays the zones outward: rocky, gas giants, ice giants, dwarfs', () => {
    // A function, a class, an interface, a type alias.
    const { rings } = zonesOf(members([1, 1, 1, 1]), 'a.ts')
    expect(rings.map((r) => r.kind)).toEqual([0, 1, 2, 3])
    const radii = rings.map((r) => r.radius)
    expect([...radii].sort((a, b) => a - b)).toEqual(radii)
  })

  it('gives each planet its own orbit, and a zone’s smallest its belt', () => {
    const { rings } = zonesOf(members([9]), 'a.ts')
    expect(rings.filter((r) => r.form === 'orbit')).toHaveLength(6)
    const belt = rings.find((r) => r.form === 'belt')!
    expect(belt.planets).toHaveLength(3)
    expect(belt.radius).toBeGreaterThan(rings[5]!.radius)
  })

  it('gives the biggest symbols their own orbits', () => {
    // Symbol 7 declares the most, so it is a planet, not rubble.
    const { rings } = zonesOf(members([8], [0, 0, 0, 0, 0, 0, 0, 12]), 'a.ts')
    const own = rings.filter((r) => r.form === 'orbit')
    expect(own.map((r) => r.planets[0]!.symbol)).toContain(7)
  })

  it('swells a giant with its members', () => {
    const { rings } = zonesOf(members([0, 2], [0, 25]), 'a.ts')
    expect(rings[1]!.size).toBeGreaterThan(rings[0]!.size)
  })

  it('lays variables in the asteroid belt, between rocky planets and giants', () => {
    const { rings } = zonesOf(members([2, 1, 0, 0, 0, 10]), 'a.ts')
    expect(rings.map((r) => [r.kind, r.form])).toEqual([
      [0, 'orbit'],
      [0, 'orbit'],
      [5, 'belt'],
      [1, 'orbit'],
    ])
  })

  it('sends loads of variables on to a Kuiper belt past the dwarfs', () => {
    const { rings } = zonesOf(members([0, 0, 0, 1, 0, 100]), 'a.ts')
    expect(rings.map((r) => [r.kind, r.form, r.count])).toEqual([
      [5, 'belt', 40],
      [3, 'orbit', 1],
      [5, 'belt', 60],
    ])
  })

  it('scatters only the overflow past both belts over a shell', () => {
    expect(
      zonesOf(members([1, 0, 0, 0, 0, 200]), 'a.ts').rings.some(
        (r) => r.form === 'cloud',
      ),
    ).toBe(false)
    const { rings, reach } = zonesOf(members([1, 0, 0, 0, 0, 250]), 'a.ts')
    const cloud = rings.at(-1)!
    expect(cloud.form).toBe('cloud')
    expect(cloud.count).toBe(50)
    expect(cloud.radius).toBeGreaterThan(reach)
    const heights = cloud.planets.map((p) => Math.abs(p.lift) / cloud.radius)
    // Out of the plane, not a ring.
    expect(Math.max(...heights)).toBeGreaterThan(0.5)
  })

  it('reaches as far as zonesReach says, without laying out a body', () => {
    const m = members([3, 2, 4, 7, 1, 9, 0, 1])
    expect(zonesOf(m, 'a.ts').reach).toBe(zonesReach(m))
  })
})
