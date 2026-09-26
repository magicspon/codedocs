import { describe, expect, it } from 'vitest'
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
