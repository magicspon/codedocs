import { describe, expect, it } from 'vitest'
import { alarmMaterial } from '../src/lib/alarm.ts'
import { cityLayout, shaftOf, tierAt } from '../src/lib/city-layout.ts'
import { facadeOf, lampOf, litOf, tiersOf } from '../src/lib/facade.ts'
import { facadeMaterial } from '../src/lib/facade-material.ts'
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

  it('steps a tall tower back once per extra kind, and never a squat one', () => {
    const mixed = file('mixed.ts', { kinds: [2, 2, 2, 2, 0, 0, 0, 0] })
    expect(tiersOf(mixed, 4)).toBe(3)
    expect(tiersOf(mixed, 1.5)).toBe(1)
    expect(tiersOf(mixed, 0.4)).toBe(0)
    expect(tiersOf(file('plain.ts'), 9)).toBe(0)
  })

  it('keeps the height a file earned, however its setbacks divide it', () => {
    const building = {
      facade: facadeOf(file('a.ts', { kinds: [1, 1, 0, 0, 0, 0, 0, 0] }), 3, 0),
    }
    expect(building.facade.tiers).toBe(1)
    const [base, block] = tierAt({ building: 0, step: 0, of: 1 }, 10)
    expect(shaftOf(building as never, 10) + block).toBeCloseTo(10)
    expect(base).toBeCloseTo(shaftOf(building as never, 10))
  })
})

describe('city geometry', () => {
  const layout = cityLayout(fromAtlas(atlas()))

  it('gives every setback a building to stand on', () => {
    for (const tier of layout.tiers) {
      expect(layout.buildings[tier.building]).toBeDefined()
      expect(tier.step).toBeLessThan(tier.of)
    }
    const stacks = layout.buildings.map((b) => b.facade.tiers)
    expect(layout.tiers).toHaveLength(stacks.reduce((a, b) => a + b, 0))
  })

  it('reads the weather once per frame', () => {
    expect(layout.smog).toHaveLength(1)
  })
})

describe('city materials', () => {
  it('gives the facade shader a window size, a lens and a clock', () => {
    const { material, uniforms } = facadeMaterial(0.8)
    expect(uniforms.uWindow.value).toBe(0.8)
    expect(uniforms.uLens.value).toBe(0)
    // The shader is only woven in at compile time, so check it lands.
    const shader = {
      uniforms: {},
      vertexShader: '#include <common>\n#include <begin_vertex>',
      fragmentShader:
        '#include <common>\n#include <color_fragment>\n#include <emissivemap_fragment>',
    }
    material.onBeforeCompile(shader as never, null as never)
    expect(shader.uniforms).toHaveProperty('uWindow')
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
