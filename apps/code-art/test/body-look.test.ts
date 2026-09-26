import { Color, Object3D } from 'three'
import { describe, expect, it } from 'vitest'
import type { Ring } from '../src/lib/orbits.ts'
import { bodyColor, poseBody } from '../src/scenes/body-look.ts'

const planet = { phase: 1, drift: 0, lift: 0, symbol: 0 }
const ring = (heat: number | null): Ring => ({
  kind: 0,
  form: 'orbit',
  radius: 2,
  tilt: 0,
  node: 0,
  speed: 1,
  size: 0.1,
  count: 1,
  heat,
  planets: [planet],
})

describe('poseBody', () => {
  it('draws a planet round', () => {
    const out = new Object3D()
    poseBody(ring(null), planet, out)
    expect(out.scale.toArray()).toEqual([0.1, 0.1, 0.1])
  })

  it('turns a disc body to lie along its orbit', () => {
    const out = new Object3D()
    poseBody(ring(0), planet, out)
    // Its long axis, turned to its phase, runs along the orbit's tangent.
    const along = new Object3D().up.set(0, 0, 1).applyEuler(out.rotation)
    expect(along.x).toBeCloseTo(-Math.sin(1))
    expect(along.z).toBeCloseTo(Math.cos(1))
    // Its streak geometry carries its size, so the pose leaves it be.
    expect(out.scale.toArray()).toEqual([1, 1, 1])
  })
})

describe('bodyColor', () => {
  const kind = new Color(0, 0, 1)

  it('keeps a planet its kind colour', () => {
    expect(bodyColor(ring(null), planet, kind)).toBe(kind)
  })

  it('burns a disc body hotter within than at the rim', () => {
    const inner = bodyColor(ring(0), planet, kind)
    const rim = bodyColor(ring(1), planet, kind)
    expect(inner.r).toBeGreaterThan(rim.r)
  })
})
