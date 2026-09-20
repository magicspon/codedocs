import { BoxGeometry, InstancedMesh, MeshBasicMaterial } from 'three'
import { describe, expect, it } from 'vitest'
import { cityLayout } from '../src/lib/city-layout.ts'
import { fromAtlas } from '../src/lib/series.ts'
import { beaconOf, dress, ready, restack, runOf } from '../src/scenes/stack.ts'
import { atlas } from './fixture.ts'

const layout = cityLayout(fromAtlas(atlas()))
const lit = layout.buildings.flatMap((b, i) => (b.beacon > 0 ? [i] : []))

/** Three meshes with room for every instance a city could ask for. */
function meshes() {
  const make = (n: number) =>
    new InstancedMesh(
      new BoxGeometry(),
      new MeshBasicMaterial(),
      Math.max(n, 1),
    )
  return {
    shaft: make(layout.buildings.length),
    tier: make(layout.tiers.length),
    mast: make(lit.length),
  }
}

describe('dressing the city', () => {
  it('draws only the setbacks and beacons the city actually has', () => {
    const city = meshes()
    dress(city, layout, lit)
    expect(city.tier.count).toBe(layout.tiers.length)
    expect(city.mast.count).toBe(lit.length)
    expect(city.shaft.instanceColor).not.toBeNull()
  })

  it('pulls the brightest beacons well ahead of the rest', () => {
    expect(beaconOf(1).r).toBeGreaterThan(beaconOf(0.5).r * 2)
    expect(beaconOf(0).r).toBeGreaterThan(0)
  })

  it('waits for every mesh before it draws anything', () => {
    expect(ready({ shaft: null, tier: null, mast: null })).toBe(false)
    expect(ready({ ...meshes(), mast: null })).toBe(false)
    expect(ready(meshes())).toBe(true)
  })
})

describe('stacking the city', () => {
  it('stands every shaft on the ground and every mast on a roof', () => {
    const city = meshes()
    const runs = {
      shaft: runOf(
        layout.buildings,
        layout.buildings.map((_, i) => i),
      ),
      tier: runOf(
        layout.buildings,
        layout.tiers.map((t) => t.building),
      ),
    }
    restack(city, layout, runs, lit, 0)
    const at = (mesh: typeof city.shaft, k: number) => {
      const m = mesh.matrix.clone()
      mesh.getMatrixAt(k, m)
      return { y: m.elements[13]!, h: m.elements[5]! }
    }
    layout.buildings.forEach((b, i) => {
      const { y, h } = at(city.shaft, i)
      // A shaft's centre sits half its own height above the slabs.
      expect(y - h / 2).toBeCloseTo(0.3)
      expect(h).toBeLessThanOrEqual(b.h + 1e-6)
    })
    lit.forEach((i, k) => {
      const mast = at(city.mast, k)
      expect(mast.y - mast.h / 2).toBeGreaterThan(layout.buildings[i]!.h)
    })
    // Health reaches the shader once per instance, not once per building.
    expect(runs.tier.health).toHaveLength(layout.tiers.length * 4)
  })
})
