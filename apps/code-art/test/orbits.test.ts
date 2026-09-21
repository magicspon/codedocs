import { describe, expect, it } from 'vitest'
import type { FileDatum, FileSymbols } from '../src/lib/atlas.ts'
import { moonsOf, orbitsOf, systemsAlong } from '../src/lib/orbits.ts'
import { byKind, treeOf } from '../src/lib/symbol-tree.ts'

// `run` is a function holding a local and an inner function; `Box` is a
// class holding a method, which holds a local of its own.
const symbols: FileSymbols = {
  names: ['run', 'count', 'helper', 'Box', 'open', 'handle', 'VERSION'],
  kinds: [0, 5, 0, 1, 6, 5, 5],
  parents: [-1, 0, 0, -1, 3, 4, -1],
}
const tree = treeOf(symbols)
const file = {
  path: 'src/a.ts',
  kinds: [2, 1, 0, 0, 0, 3, 1, 0],
} as unknown as FileDatum

describe('treeOf', () => {
  it('finds the top level and each symbol’s children', () => {
    expect(tree.roots).toEqual([0, 3, 6])
    expect(tree.children[0]).toEqual([1, 2])
    expect(tree.children[4]).toEqual([5])
    expect(tree.children[6]).toEqual([])
  })

  it('splits members by kind, in order', () => {
    expect(byKind(symbols, [0, 3, 6]).slice(0, 2)).toEqual([[0], [3]])
  })
})

describe('orbitsOf', () => {
  it('draws only top-level symbols as planets once the tree is known', () => {
    const planets = orbitsOf(file, tree).rings.flatMap((r) =>
      r.planets.map((p) => p.symbol),
    )
    expect(planets.sort((a, b) => a - b)).toEqual([0, 3, 6])
  })

  it('draws every counted symbol, unnamed, without a tree', () => {
    const rings = orbitsOf(file, null).rings
    expect(rings.map((r) => r.planets.length)).toEqual([2, 1, 3, 1])
    expect(rings.every((r) => r.planets.every((p) => p.symbol === -1))).toBe(
      true,
    )
  })
})

describe('moonsOf', () => {
  it('circles a body clear of its surface, smaller than it', () => {
    const size = 0.1
    const moons = moonsOf('src/a.ts', tree, 0, size)
    expect(moons.rings.map((r) => r.kind)).toEqual([0, 5])
    expect(moons.rings[0]!.radius).toBeGreaterThan(size * 2)
    for (const ring of moons.rings) expect(ring.size).toBeLessThan(size)
  })

  it('is the same every time', () => {
    expect(moonsOf('src/a.ts', tree, 0, 0.1)).toEqual(
      moonsOf('src/a.ts', tree, 0, 0.1),
    )
  })
})

describe('systemsAlong', () => {
  it('walks down the focus, one system per focused body', () => {
    const planets = orbitsOf(file, tree)
    const systems = systemsAlong('src/a.ts', tree, planets, [3, 4])
    expect(systems).toHaveLength(3)
    expect(
      systems[1]!.rings.flatMap((r) => r.planets.map((p) => p.symbol)),
    ).toEqual([4])
    expect(
      systems[2]!.rings.flatMap((r) => r.planets.map((p) => p.symbol)),
    ).toEqual([5])
  })

  it('stops at a symbol no ring draws', () => {
    const planets = orbitsOf(file, tree)
    expect(systemsAlong('src/a.ts', tree, planets, [5])).toHaveLength(1)
  })
})
