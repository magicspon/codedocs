import { BoxGeometry, InstancedMesh, MeshBasicMaterial } from 'three'
import { describe, expect, it } from 'vitest'
import { cityLayout } from '../src/lib/city-layout.ts'
import { fromAtlas } from '../src/lib/series.ts'
import { beaconOf, dress, ready, restack } from '../src/scenes/stack.ts'
import { atlas } from './fixture.ts'

const layout = cityLayout(fromAtlas(atlas()))
const lit = layout.settlements.flatMap((s, i) =>
  layout.beacons[s.file]! > 0 ? [i] : [],
)

/** Two meshes with room for every instance a city could ask for. */
function meshes() {
  const make = (n: number) =>
    new InstancedMesh(
      new BoxGeometry(),
      new MeshBasicMaterial(),
      Math.max(n, 1),
    )
  return {
    shaft: make(layout.buildings.count),
    mast: make(lit.length),
  }
}

describe('dressing the city', () => {
  it('draws only the beacons the city actually has', () => {
    const city = meshes()
    dress(city, layout, lit)
    expect(city.mast.count).toBe(lit.length)
    expect(city.shaft.instanceColor).not.toBeNull()
  })

  it('pulls the brightest beacons well ahead of the rest', () => {
    expect(beaconOf(1).r).toBeGreaterThan(beaconOf(0.5).r * 2)
    expect(beaconOf(0).r).toBeGreaterThan(0)
  })

  it('waits for every mesh before it draws anything', () => {
    expect(ready({ shaft: null, mast: null })).toBe(false)
    expect(ready({ ...meshes(), mast: null })).toBe(false)
    expect(ready(meshes())).toBe(true)
  })
})

describe('stacking the city', () => {
  it('stands every building on the ground and every mast on a roof', () => {
    const city = meshes()
    const health = new Float32Array(layout.buildings.count * 4)
    restack(city, layout, health, lit, 0)
    const at = (mesh: typeof city.shaft, k: number) => {
      const m = mesh.matrix.clone()
      mesh.getMatrixAt(k, m)
      return { y: m.elements[13]!, h: m.elements[5]! }
    }
    for (let k = 0; k < layout.buildings.count; k++) {
      const { y, h } = at(city.shaft, k)
      // A building's centre sits half its own height above the slabs.
      expect(y - h / 2).toBeCloseTo(0.3)
      expect(h).toBeLessThanOrEqual(layout.buildings.h[k]! + 1e-6)
    }
    lit.forEach((settlement, k) => {
      const mast = at(city.mast, k)
      const s = layout.settlements[settlement]!
      expect(mast.y - mast.h / 2).toBeGreaterThan(s.h)
    })
    // Health reaches the shader once per building, not once per settlement.
    expect(health).toHaveLength(layout.buildings.count * 4)
  })
})
