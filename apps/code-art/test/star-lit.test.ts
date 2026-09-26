import { Group, Mesh, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { lightFrom, starLitMaterial } from '../src/lib/star-lit.ts'

describe('lightFrom', () => {
  it('aims every star-lit body at the system’s centre, in world space', () => {
    const galaxy = new Group()
    galaxy.position.set(1, 0, 0)
    const system = new Group()
    system.position.set(0, 2, 0)
    const planet = starLitMaterial()
    const moon = starLitMaterial()
    const ring = new Group()
    ring.add(new Mesh(undefined, moon))
    system.add(new Mesh(undefined, planet), ring)
    galaxy.add(system)
    galaxy.updateMatrixWorld()
    lightFrom(system)
    for (const m of [planet, moon])
      expect((m.uniforms.uStar!.value as Vector3).toArray()).toEqual([1, 2, 0])
  })
})
