import { describe, expect, it } from 'vitest'
import { cityLayout } from '../src/lib/city-layout.ts'
import { galaxyLayout } from '../src/lib/galaxy-layout.ts'
import { gaussian, hash, rng } from '../src/lib/rng.ts'
import { fromAtlas } from '../src/lib/series.ts'
import { atlas } from './fixture.ts'

describe('rng', () => {
  it('repeats for one seed, so a repository always draws the same picture', () => {
    const a = rng(hash('vscode'))
    const b = rng(hash('vscode'))
    const first = [a(), a(), a()]
    expect([b(), b(), b()]).toEqual(first)
    for (const x of first) expect(x).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(gaussian(rng(1)))).toBe(true)
  })
})

describe('galaxyLayout', () => {
  const layout = galaxyLayout(fromAtlas(atlas()))

  it('draws one core per file, one star per symbol and one line per call', () => {
    expect(layout.cores.sizes.length).toBe(5)
    expect(layout.stars.sizes.length).toBe(8 + 1 + 1 + 1 + 0)
    expect(layout.links.positions.length).toBe(2 * 6)
  })

  it('puts the most-called file nearest the centre', () => {
    const distance = (i: number): number =>
      Math.hypot(
        layout.cores.positions[i * 3]!,
        layout.cores.positions[i * 3 + 2]!,
      )
    for (let i = 1; i < 5; i++) expect(distance(0)).toBeLessThan(distance(i))
  })

  it('hazes only files with unresolved calls', () => {
    expect(layout.nebulae.sizes.length).toBeGreaterThan(0)
    const empty = galaxyLayout(
      fromAtlas({
        ...atlas(),
        files: atlas().files.map((f) => ({ ...f, unresolved: 0 })),
      }),
    )
    expect(empty.nebulae.sizes.length).toBe(0)
  })
})

describe('cityLayout', () => {
  const layout = cityLayout(fromAtlas(atlas()))

  it('builds one settlement per file and lights the most-called roof', () => {
    expect(layout.settlements).toHaveLength(5)
    expect(layout.beacons[0]).toBeGreaterThan(0)
    expect(layout.beacons[4]).toBe(0)
  })

  it('gives a file with more symbols more buildings', () => {
    expect(layout.settlements[0]!.count).toBeGreaterThan(
      layout.settlements[4]!.count,
    )
  })

  it('reads tiers off population: the hub with 8 symbols is at least a town', () => {
    expect(layout.settlements[0]!.tier).toBeGreaterThan(0)
  })

  it('gives a file with nothing declared a plain placeholder, not a run past the last kind', () => {
    // `c/three.ts` has no symbols at all; `a/leaf.ts` has one plain function.
    // Walking zero counts must not fall through to the last kind (namespace).
    const empty = layout.settlements[4]!
    const leaf = layout.settlements[1]!
    expect(empty.count).toBe(1)
    const lampOf = (s: (typeof layout.settlements)[number]): number[] =>
      Array.from(layout.buildings.lamp.subarray(s.offset * 3, s.offset * 3 + 3))
    expect(lampOf(empty)).toEqual(lampOf(leaf))
  })
})
