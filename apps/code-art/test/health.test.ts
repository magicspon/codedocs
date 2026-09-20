import { describe, expect, it } from 'vitest'
import type { Atlas, FileHealth } from '../src/lib/atlas.ts'
import { cityLayout } from '../src/lib/city-layout.ts'
import { galaxyLayout } from '../src/lib/galaxy-layout.ts'
import { healthGlowMaterial, lifeLineMaterial } from '../src/lib/glow.ts'
import {
  blend,
  heatOf,
  healthTracks,
  sampleHealth,
  smogPerFrame,
  trendOf,
  wearOf,
} from '../src/lib/health.ts'
import { healthRows, lensLegend, lensNote } from '../src/lib/health-text.ts'
import { healthTexture } from '../src/lib/health-texture.ts'
import { fromAtlas, seriesOf } from '../src/lib/series.ts'
import { atlas, file } from './fixture.ts'

/** A health reading with nothing wrong, overridden where a test cares. */
function health(over: Partial<FileHealth> = {}): FileHealth {
  return {
    hotspot: 0,
    commits: 0,
    trend: 0,
    duplicated: 0,
    cyclic: false,
    ...over,
  }
}

/** Two frames of one repo: `a.ts` heats up and wears out, `b.ts` becomes unused. */
function frames(deadCode: boolean): Atlas[] {
  const base = { ...atlas(), calls: [], imports: [] }
  return [
    {
      ...base,
      files: [file('a.ts', { health: health() }), file('b.ts')],
      fallow: { version: '1', deadCode },
    },
    {
      ...base,
      files: [
        file('a.ts', {
          health: health({
            hotspot: 64,
            trend: 1,
            score: {
              maintainability: 50,
              density: 0,
              cyclomatic: 0,
              cognitive: 0,
              crap: 0,
            },
          }),
        }),
        file('b.ts', { health: health({ unused: true }) }),
      ],
      clones: [[0, 1, 12]],
      fallow: { version: '1', deadCode },
    },
  ]
}

const timeline = (deadCode: boolean) =>
  seriesOf({
    name: 'fixture',
    commits: [
      { sha: 'a', date: '', subject: '' },
      { sha: 'b', date: '', subject: '' },
    ],
    frames: frames(deadCode),
  })

describe('health readings', () => {
  it('maps hotspot scores on a square root, so small scores still show', () => {
    expect(heatOf(undefined)).toBe(0)
    expect(heatOf(health({ hotspot: 25 }))).toBeCloseTo(0.5)
    expect(heatOf(health({ hotspot: 400 }))).toBe(1)
  })

  it('wears only below sound maintainability, and never a file fallow did not score', () => {
    const scored = (maintainability: number) =>
      wearOf(
        health({
          score: {
            maintainability,
            density: 0,
            cyclomatic: 0,
            cognitive: 0,
            crap: 0,
          },
        }),
      )
    expect(wearOf(health())).toBe(0)
    expect(scored(95)).toBe(0)
    expect(scored(67.5)).toBeCloseTo(0.5)
    expect(scored(10)).toBe(1)
  })

  it('draws a trend only for hotspots', () => {
    expect(trendOf(undefined)).toBe(0)
    expect(trendOf(health({ trend: 1 }))).toBe(0)
    expect(trendOf(health({ hotspot: 5, trend: 1 }))).toBe(1)
    expect(trendOf(health({ hotspot: 5, trend: -1 }))).toBe(-1)
  })

  it('blends between frames, like heights', () => {
    const values = [0, 10, 20, 30]
    expect(blend(values, 1, 3, 0.5)).toBeCloseTo(15)
    expect(blend(values, 0, 4, 9)).toBe(30)
    expect(blend(values, 0, 4, -1)).toBe(0)
  })

  it('tracks each file per frame and blends the playhead between them', () => {
    const tracks = healthTracks(timeline(true))
    const out = { heat: 0, unused: 0, wear: 0, trend: 0 }
    expect(sampleHealth(tracks, 0, 0, out)).toEqual({
      heat: 0,
      unused: 0,
      wear: 0,
      trend: 0,
    })
    sampleHealth(tracks, 0, 0.5, out)
    expect(out.heat).toBeCloseTo(0.4)
    expect(out.wear).toBeCloseTo(0.5)
    expect(out.trend).toBeCloseTo(0.5)
    expect(sampleHealth(tracks, 1, 1, out).unused).toBe(1)
  })

  it('never marks a file unused when dead code was not trusted', () => {
    const tracks = healthTracks(timeline(false))
    expect([...tracks.unused]).toEqual([0, 0, 0, 0])
  })

  it('reads nothing from a series without fallow', () => {
    const tracks = healthTracks(fromAtlas(atlas()))
    expect(tracks.heat.every((h) => h === 0)).toBe(true)
  })
})

describe('health in the scenes', () => {
  it('lets only hotspots burn in the city', () => {
    expect(cityLayout(timeline(true)).hot).toEqual([0])
  })

  it('pairs cloned files in the galaxy and tags every point with its file', () => {
    const layout = galaxyLayout(timeline(true))
    expect(layout.clones.positions.length).toBe(6)
    expect([...layout.clones.births]).toEqual([1, 1])
    expect([...layout.cores.files]).toEqual([0, 1])
  })

  it('fills a texel per file at the playhead', () => {
    const series = timeline(true)
    const { texture, update } = healthTexture(healthTracks(series), 2)
    const data = texture.image.data as Float32Array
    expect(data[0]).toBe(0)
    update(1)
    expect(data[0]).toBeCloseTo(0.8)
    expect(data[3]).toBe(1)
    expect(data[5]).toBe(1)
    expect(texture.image.width).toBe(1024)
  })

  it('only follows the playhead while the lens shows', () => {
    const { texture, follow } = healthTexture(healthTracks(timeline(true)), 2)
    const data = texture.image.data as Float32Array
    follow(1, 0)
    expect(data[0]).toBe(0)
    follow(1, 0.5)
    expect(data[0]).toBeCloseTo(0.8)
  })

  it("reads the whole city's trouble as weather, frame by frame", () => {
    const series = timeline(true)
    const smog = smogPerFrame(healthTracks(series), series)
    expect(smog).toHaveLength(2)
    // The fixture's first frame is sound; by the second, one file has gone hot
    // and worn and the other is unreachable, so the air thickens.
    expect(smog[0]!).toBe(0)
    expect(smog[1]!).toBeGreaterThan(0.3)
    for (const air of smog) expect(air).toBeGreaterThanOrEqual(0)
    for (const air of smog) expect(air).toBeLessThan(1)
  })

  it('reads a repository with nothing wrong as clear air', () => {
    const series = fromAtlas(atlas())
    expect(smogPerFrame(healthTracks(series), series)[0]).toBe(0)
  })

  it('gives the shaders a lens to fade and a texture to read', () => {
    const glow = healthGlowMaterial(0.25)
    expect(glow.uniforms.uFlare!.value).toBe(0.25)
    expect(glow.uniforms.uLens!.value).toBe(0)
    expect(glow.vertexShader).toContain('healthOf(file)')
    expect(glow.uniforms.uClock!.value).toBe(0)
    expect(lifeLineMaterial().uniforms.uOpacity!.value).toBe(1)
  })
})

describe('health in words', () => {
  const meta = (deadCode: boolean) => ({ version: '1', deadCode })

  it('reads a cold file fallow did not score plainly', () => {
    expect(healthRows(health(), meta(false))).toEqual([
      ['Maintainability', 'not measured'],
      ['Hotspot', 'no'],
      ['Copied lines', '0'],
    ])
  })

  it('names the trend and adds dead code only where it was trusted', () => {
    const rows = healthRows(
      health({ hotspot: 40, trend: 1, commits: 7, cyclic: true, unused: true }),
      meta(true),
    )
    expect(rows).toContainEqual(['Hotspot', '40 / 100, heating up, 7 commits'])
    expect(rows).toContainEqual(['Import cycle', 'yes'])
    expect(rows).toContainEqual(['Unused file', 'yes'])
    expect(rows).toContainEqual(['Unused exports', '0'])
  })

  it('says when unused files are left out of the lens', () => {
    expect(lensLegend('city', meta(true))).toContain('Unlit, concrete-grey')
    expect(lensLegend('city', meta(false))).toContain('no fallow config')
    expect(lensLegend('nowhere', meta(true))).toBe('')
    expect(lensNote('city', undefined, true)).toContain('fallow on your PATH')
    expect(lensNote('city', meta(true), false)).toBe('')
    expect(lensNote('city', meta(true), true)).toContain(
      'pillar of warning light',
    )
    expect(lensLegend('galaxy', meta(true))).toContain('heating up')
  })
})
