import { describe, expect, it } from 'vitest'
import { alarmMaterial } from '../src/lib/alarm.ts'
import { cityLayout } from '../src/lib/city-layout.ts'
import { facadeMaterial } from '../src/lib/facade-material.ts'
import { lampOf, litOf } from '../src/lib/facade.ts'
import { fromAtlas } from '../src/lib/series.ts'
import { skyMaterial } from '../src/lib/sky.ts'
import { atlas, file } from './fixture.ts'

describe('facades', () => {
  it('lights a busy file more than a quiet one', () => {
    const quiet = litOf(file('quiet.ts'))
    const busy = litOf(file('busy.ts', { callsIn: 20, refsIn: 30 }))
    expect(busy).toBeGreaterThan(quiet)
    expect(busy).toBeLessThanOrEqual(1)
  })

  it('leaves a stairwell on in a file nothing reaches', () => {
    const dark = litOf(file('dark.ts'))
    expect(dark).toBeGreaterThan(0)
    expect(dark).toBeLessThan(0.1)
    // A file with no symbols at all has nothing to light either.
    expect(litOf(file('empty.ts', { kinds: [0, 0, 0, 0, 0, 0, 0, 0] }))).toBe(
      dark,
    )
  })

  it('tints the windows by the kind of symbol the file mostly holds', () => {
    const types = lampOf(file('types.ts', { kinds: [0, 0, 9, 0, 0, 0, 0, 0] }))
    const funcs = lampOf(file('funcs.ts', { kinds: [9, 0, 0, 0, 0, 0, 0, 0] }))
    expect(types.b).toBeGreaterThan(funcs.b)
    expect(funcs.r).toBeGreaterThan(funcs.b)
  })
})

describe('city geometry', () => {
  const layout = cityLayout(fromAtlas(atlas()))

  it('gives every settlement at least one building', () => {
    for (const s of layout.settlements) {
      expect(s.count).toBeGreaterThan(0)
      expect(layout.buildings.h[s.landmark]).toBeGreaterThan(0)
    }
    const total = layout.settlements.reduce((sum, s) => sum + s.count, 0)
    expect(layout.buildings.count).toBe(total)
  })

  it('reads the weather once per frame', () => {
    expect(layout.smog).toHaveLength(1)
  })
})

describe('city materials', () => {
  it('gives the facade shader a lens and a clock', () => {
    const { material, uniforms } = facadeMaterial()
    expect(uniforms.uLens.value).toBe(0)
    // The shader is only woven in at compile time, so check it lands.
    const shader = {
      uniforms: {},
      vertexShader: '#include <common>\n#include <begin_vertex>',
      fragmentShader:
        '#include <common>\n#include <color_fragment>\n#include <emissivemap_fragment>',
    }
    material.onBeforeCompile(shader as never, null as never)
    expect(shader.uniforms).toHaveProperty('uLens')
    expect(shader.vertexShader).toContain('instanceMatrix')
    expect(shader.fragmentShader).toContain('totalEmissiveRadiance +=')
    expect(shader.fragmentShader).toContain('alarmBeat()')
  })

  it('hides an alarm pillar until the lens opens', () => {
    const material = alarmMaterial()
    expect(material.uniforms.uLens!.value).toBe(0)
    expect(material.fragmentShader).toContain('vAlarm.x * uLens')
  })

  it('clears the sky of smog and stars together', () => {
    const sky = skyMaterial()
    const clear = sky.horizon.clone()
    sky.setSmog(1)
    expect(sky.horizon.equals(clear)).toBe(false)
    // Smog is sodium-lit, so the horizon warms as it thickens.
    expect(sky.horizon.r).toBeGreaterThan(sky.horizon.b)
    expect(sky.material.uniforms.uStars!.value).toBe(0)
    sky.setSmog(0)
    expect(sky.horizon.equals(clear)).toBe(true)
    expect(sky.material.uniforms.uStars!.value).toBe(1)
  })
})
