import { describe, expect, it } from 'vitest'
import type { FileDatum } from '../src/lib/atlas.ts'
import { galaxyPalette, kindEvenness } from '../src/lib/galaxy-palette.ts'
import { hueOf } from '../src/lib/hue.ts'
import { NEBULA_INKS, pickInks } from '../src/lib/sky-inks.ts'
import { atlas } from './fixture.ts'

/** A file holding `kinds` symbols, and nothing else that matters here. */
const withKinds = (kinds: number[]): FileDatum => ({
  ...atlas().files[0]!,
  kinds,
})

describe('galaxyPalette', () => {
  const files = atlas().files

  it('is the same every time for one dataset', () => {
    const a = galaxyPalette('vscode', files)
    const b = galaxyPalette('vscode', files)
    expect(a.arm(3).getHex()).toBe(b.arm(3).getHex())
    expect(a.kinds.map((c) => c.getHex())).toEqual(
      b.kinds.map((c) => c.getHex()),
    )
  })

  it('is keyed to the hue the landing card glows in', () => {
    expect(galaxyPalette('nuxt', files).hue).toBe(hueOf('nuxt'))
    expect(galaxyPalette('nuxt', files).arm(0).getHex()).not.toBe(
      galaxyPalette('vscode', files).arm(0).getHex(),
    )
  })

  it('fans wider when symbols split evenly across kinds', () => {
    const mono = [withKinds([50, 0, 0, 0, 0, 0, 0, 0])]
    const even = [withKinds([5, 5, 5, 5, 5, 5, 5, 5])]
    expect(kindEvenness(mono)).toBe(0)
    expect(kindEvenness(even)).toBeCloseTo(1)
    expect(galaxyPalette('x', mono).spread).toBeLessThan(
      galaxyPalette('x', even).spread,
    )
  })

  it('keeps arms within the fan round the key hue', () => {
    const p = galaxyPalette('sst', files)
    for (let arm = 0; arm < 8; arm++) {
      const hue = p.arm(arm).getHSL({ h: 0, s: 0, l: 0 }).h * 360
      const gap = Math.abs(((hue - p.hue + 540) % 360) - 180)
      expect(gap).toBeLessThanOrEqual(p.spread / 2 + 1)
    }
  })
})

describe('sky inks', () => {
  const files = atlas().files

  it('picks distinct inks, the same ones for the same seed', () => {
    const a = pickInks(NEBULA_INKS, 4, 7)
    expect(new Set(a).size).toBe(4)
    expect(pickInks(NEBULA_INKS, 4, 7)).toEqual(a)
  })

  it('gives galaxies different mixes of haze', () => {
    const inksOf = (name: string): Set<string> => {
      const p = galaxyPalette(name, files)
      const paths = Array.from({ length: 40 }, (_, i) => `file-${i}.ts`)
      return new Set(paths.map((path) => p.nebula(path).getHexString()))
    }
    // Four inks each, but not the same four everywhere.
    expect(inksOf('nextjs').size).toBe(4)
    const all = new Set(
      ['nextjs', 'nuxt', 'sst', 'vscode', 'router'].flatMap((n) => [
        ...inksOf(n),
      ]),
    )
    expect(all.size).toBeGreaterThan(4)
  })

  it('keeps every haze ink equally faint', () => {
    const p = galaxyPalette('vscode', files)
    for (const path of ['a', 'b', 'c', 'd', 'e']) {
      const { r, g, b } = p.nebula(path)
      expect(r + g + b).toBeCloseTo(0.085)
    }
  })
})
