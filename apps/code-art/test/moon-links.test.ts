import { describe, expect, it } from 'vitest'
import type { FileDatum, FileSymbols } from '../src/lib/atlas.ts'
import { moonLinksOf, type Place } from '../src/lib/moon-links.ts'
import { orbitsOf, systemsAlong } from '../src/lib/orbits.ts'
import { treeOf } from '../src/lib/symbol-tree.ts'

// `Box` is a class holding `open` and `shut`; `open` holds a local `tmp`.
// `helper` is a top-level function beside it.
const symbols: FileSymbols = {
  names: ['Box', 'open', 'shut', 'tmp', 'helper'],
  kinds: [1, 6, 6, 5, 0],
  parents: [-1, 0, 0, 1, -1],
  peers: ['src/b.ts'],
  // symbol, way, inbound, peer, other, count
  links: [
    [1, 0, 0, -1, 2, 1], // open calls shut
    [2, 0, 1, -1, 1, 1], // …which shut holds as an inbound call
    [1, 0, 0, -1, 4, 3], // open calls helper, three times
    [2, 1, 0, 0, 7, 1], // shut references something in b.ts
    [1, 0, 0, -1, 3, 1], // open calls its own local: nowhere to draw
    [2, 0, 1, -1, 3, 1], // tmp, inside open, calls shut
    [1, 4, 0, -1, 0, 1], // open's type names Box, the body it circles
  ].flat(),
}
const tree = treeOf(symbols)
const file = { path: 'src/a.ts', kinds: [] } as unknown as FileDatum
const planets = orbitsOf(file, tree)

/** A place, by the symbol drawn there or its frame. */
const named = (p: Place): string | number =>
  p.frame === 'moons' || p.frame === 'planets'
    ? p.planet.symbol
    : p.frame === 'file'
      ? p.path
      : p.frame

describe('moonLinksOf', () => {
  it('draws nothing at the star', () => {
    expect(moonLinksOf(symbols, [planets], [])).toEqual([])
  })

  it('runs each moon’s links to where their far ends are drawn', () => {
    const systems = systemsAlong('src/a.ts', tree, planets, [0])
    const lines = moonLinksOf(symbols, systems, [0]).map((l) => [
      named(l.from),
      named(l.to),
      l.via,
      l.count,
    ])
    expect(lines).toEqual([
      // Between two moons: drawn once, not once from each end.
      [1, 2, 0, 1],
      // To a planet round the star.
      [1, 4, 0, 3],
      // Nothing to the body the moons circle.
      [2, 'src/b.ts', 1, 1],
      // Callers drawn from their end: `tmp` is out of view, so from `open`.
      [1, 2, 0, 1],
    ])
  })
})
