import { describe, expect, it } from 'vitest'
import type { FileSymbols } from '../src/lib/atlas.ts'
import { GLIMPSES, glimpsesOf } from '../src/lib/glimpses.ts'
import { moonsOf } from '../src/lib/orbits.ts'
import { treeOf } from '../src/lib/symbol-tree.ts'

// `Big` is a class of ten methods; `run` holds one local; `idle` holds nothing.
const methods = Array.from({ length: 10 }, (_, k) => `m${k}`)
const symbols: FileSymbols = {
  names: ['Big', ...methods, 'run', 'x', 'idle'],
  kinds: [1, ...methods.map(() => 6), 0, 5, 0],
  parents: [-1, ...methods.map(() => 0), -1, 11, -1],
}
const tree = treeOf(symbols)
const glimpsed = (symbol: number): number[] =>
  glimpsesOf(moonsOf('src/a.ts', tree, symbol, 0.1)).map((g) => g.planet.symbol)

describe('glimpsesOf', () => {
  it('shows at most a few moons, spread across the crowd', () => {
    const shown = glimpsed(0)
    expect(shown).toHaveLength(GLIMPSES)
    expect(new Set(shown).size).toBe(GLIMPSES)
    // Not the first three neighbours on the belt.
    expect(shown).not.toEqual([1, 2, 3])
  })

  it('shows every moon of a body with few, and none of a body with none', () => {
    expect(glimpsed(11)).toEqual([12])
    expect(glimpsed(13)).toEqual([])
  })

  it('takes its moons from the full system, so zooming in keeps them put', () => {
    const moons = moonsOf('src/a.ts', tree, 0, 0.1)
    for (const g of glimpsesOf(moons)) {
      expect(moons.rings).toContain(g.ring)
      expect(g.ring.planets).toContain(g.planet)
    }
  })
})

describe('glimpsesOf, all', () => {
  it('shows every moon of a body picked out', () => {
    const moons = moonsOf('src/a.ts', tree, 0, 0.1)
    const every = glimpsesOf(moons, true).map((g) => g.planet.symbol)
    expect(every.sort((a, b) => a - b)).toEqual(methods.map((_, k) => k + 1))
  })
})
