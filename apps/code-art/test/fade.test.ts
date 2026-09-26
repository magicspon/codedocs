import {
  Group,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  MeshStandardMaterial,
} from 'three'
import { describe, expect, it } from 'vitest'
import { fadeAll } from '../src/scenes/fade.ts'

describe('fadeAll', () => {
  it('fades each material against its own full strength', () => {
    const planet = new MeshStandardMaterial()
    const line = new LineBasicMaterial({ transparent: true, opacity: 0.2 })
    const root = new Group()
    root.add(new Mesh(undefined, planet), new LineLoop(undefined, line))
    fadeAll(root, 0.5)
    expect(planet.opacity).toBeCloseTo(0.5)
    expect(planet.transparent).toBe(true)
    expect(line.opacity).toBeCloseTo(0.1)
    // Fading back up restores the original, not the faded, strength.
    fadeAll(root, 1)
    expect(line.opacity).toBeCloseTo(0.2)
  })

  it('handles a mesh with several materials', () => {
    const a = new MeshStandardMaterial()
    const b = new MeshStandardMaterial({ opacity: 0.4 })
    const root = new Group()
    root.add(new Mesh(undefined, [a, b]))
    fadeAll(root, 0.5)
    expect([a.opacity, b.opacity]).toEqual([0.5, 0.2])
  })
})
