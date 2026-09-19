import { describe, expect, it } from 'vitest'
import { cityLayout } from '../src/lib/city-layout.ts'
import { galaxyLayout } from '../src/lib/galaxy-layout.ts'
import { fileAt, landscapeLayout } from '../src/lib/landscape-layout.ts'
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

  it('builds one building per file and lights the most-called roof', () => {
    expect(layout.buildings).toHaveLength(5)
    expect(layout.buildings[0]!.beacon).toBeGreaterThan(0)
    expect(layout.buildings[4]!.beacon).toBe(0)
  })

  it('makes a file with more symbols taller', () => {
    expect(layout.buildings[0]!.h).toBeGreaterThan(layout.buildings[4]!.h)
  })
})

describe('landscapeLayout', () => {
  const layout = landscapeLayout(fromAtlas(atlas()))

  it('maps a point on a file’s plot back to that file, and open water to none', () => {
    layout.rects.forEach((r, i) =>
      expect(fileAt(layout.rects, r.x + r.w / 2, r.y + r.h / 2)).toBe(i),
    )
    expect(fileAt(layout.rects, layout.size, layout.size)).toBeNull()
  })

  it('raises land above the water and marks the hub with a lighthouse', () => {
    let top = -Infinity
    for (let i = 1; i < layout.positions.length; i += 3)
      top = Math.max(top, layout.positions[i]!)
    expect(top).toBeGreaterThan(layout.waterLevel)
    expect(layout.lighthouses[0]?.file).toBe(0)
  })
})
