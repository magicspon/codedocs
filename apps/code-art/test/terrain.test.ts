import { describe, expect, it } from 'vitest'
import { fromAtlas } from '../src/lib/series.ts'
import { heightAt, ownerAt, terrainField } from '../src/lib/terrain-field.ts'
import { TERRAIN_RADIUS, terrainLayout } from '../src/lib/terrain-layout.ts'
import { mistOf, mistyFiles } from '../src/lib/terrain-mist.ts'
import { ridged, valueNoise } from '../src/lib/terrain-noise.ts'
import { kindBands, strataOf } from '../src/lib/terrain-strata.ts'
import { edgeFlows, riversOf } from '../src/lib/terrain-rivers.ts'
import { radialTree } from '../src/lib/terrain-tree.ts'
import { atlas, file } from './fixture.ts'

describe('radialTree', () => {
  const files = atlas().files
  const tree = radialTree(files, 10)

  it('places every file, inside the disc', () => {
    expect(tree.fileNode.every((n) => n >= 0)).toBe(true)
    for (const n of tree.nodes) expect(n.radius).toBeLessThanOrEqual(10 + 1e-9)
  })

  it('puts the root at the centre and parents before children', () => {
    expect(tree.nodes[0]).toMatchObject({ parent: -1, depth: 0, x: 0, z: 0 })
    tree.nodes.forEach((n, i) => {
      if (i > 0) expect(n.parent).toBeLessThan(i)
    })
  })

  it('gives each top-level folder a branch of its own', () => {
    expect(tree.branches).toBe(3)
    const branchOf = (i: number): number =>
      tree.nodes[tree.fileNode[i]!]!.branch
    expect(branchOf(0)).toBe(branchOf(1))
    expect(branchOf(0)).not.toBe(branchOf(2))
  })

  it('folds away a folder that only holds one other folder', () => {
    const lone = radialTree([file('src/a/x.ts'), file('src/b/y.ts')], 10)
    // Root, then a and b straight off it: `src/` adds no ring.
    expect(lone.nodes[lone.fileNode[0]!]!.depth).toBe(2)
    expect(lone.branches).toBe(2)
  })

  it('lays out the same files the same way every time', () => {
    expect(radialTree(files, 10)).toEqual(tree)
  })
})

describe('edgeFlows', () => {
  it('routes a call up to the shared folder and down again', () => {
    const files = [file('a/x.ts'), file('a/y.ts'), file('b/z.ts')]
    const tree = radialTree(files, 10)
    const flows = edgeFlows(tree, [
      [0, 1, 3],
      [0, 2, 5],
    ])
    const x = tree.fileNode[0]!
    const a = tree.nodes[x]!.parent
    const b = tree.nodes[tree.fileNode[2]!]!.parent
    expect(flows[x]).toEqual({ up: 8, down: 0 })
    expect(flows[tree.fileNode[1]!]).toEqual({ up: 0, down: 3 })
    // Only the call to b leaves a.
    expect(flows[a]).toEqual({ up: 5, down: 0 })
    expect(flows[b]).toEqual({ up: 0, down: 5 })
  })

  it('skips calls within one file', () => {
    const tree = radialTree([file('a/x.ts')], 10)
    expect(edgeFlows(tree, [[0, 0, 9]]).every((f) => f.up + f.down === 0)).toBe(
      true,
    )
  })
})

describe('riversOf', () => {
  const tree = radialTree(atlas().files, 10)
  const rivers = riversOf(tree, edgeFlows(tree, atlas().calls))

  it('draws every edge, with the busiest at full flow and unused ones dry', () => {
    expect(rivers.length).toBe(tree.nodes.length - 1)
    expect(Math.max(...rivers.map((r) => r.flow))).toBe(1)
    expect(rivers.some((r) => r.flow === 0)).toBe(true)
  })

  it('runs each river the way its calls run', () => {
    // a/leaf.ts calls a/hub.ts, so its river leaves the file.
    const leaf = tree.fileNode[1]!
    const river = rivers.find((r) => r.node === leaf)!
    const start = river.path[0]!
    const node = tree.nodes[leaf]!
    expect(Math.hypot(start[0] - node.x, start[1] - node.z)).toBeLessThan(0.5)
    expect(river.spring).toBe(true)
  })
})

describe('terrainField', () => {
  const files = [
    file('a/big.ts', { kinds: [40, 0, 0, 0, 0, 0, 0, 0] }),
    file('b/small.ts'),
    file('c/one.test.ts', { role: 1 }),
  ]
  const tree = radialTree(files, TERRAIN_RADIUS)
  const field = terrainField({
    tree,
    files,
    rivers: [],
    colorOf: () => [1, 0, 0],
    seed: 1,
    size: 120,
  })
  const at = (i: number): [number, number] => {
    const n = tree.nodes[tree.fileNode[i]!]!
    return [n.x, n.z]
  }

  it('raises bigger files higher and sinks tests', () => {
    expect(heightAt(field, ...at(0))).toBeGreaterThan(heightAt(field, ...at(1)))
    expect(heightAt(field, ...at(2))).toBeLessThan(0)
  })

  it('knows which file each peak belongs to', () => {
    expect(ownerAt(field, ...at(0))).toBe(0)
    expect(ownerAt(field, field.extent * 0.99, field.extent * 0.99)).toBe(-1)
    expect(ownerAt(field, field.extent * 2, 0)).toBe(-1)
  })

  it('carves a river into the ground', () => {
    const [x, z] = at(0)
    const carved = terrainField({
      tree,
      files,
      rivers: [{ node: 1, path: [[x, z]], flow: 1, spring: false }],
      colorOf: () => [1, 0, 0],
      seed: 1,
      size: 120,
    })
    expect(heightAt(carved, x, z)).toBeLessThan(heightAt(field, x, z))
    expect(Math.max(...carved.wet)).toBeGreaterThan(0.5)
  })
})

describe('terrainLayout', () => {
  const layout = terrainLayout(fromAtlas(atlas()), 60)

  it('builds finite buffers of matching sizes', () => {
    const { surface, skirt, water } = layout
    expect(surface.positions.length).toBe(60 * 60 * 3)
    expect(surface.index.length).toBe(59 * 59 * 6)
    expect(skirt.positions.length).toBe(skirt.drop.length * 3)
    expect(water.positions.length).toBe(water.along.length * 3)
    for (const buffer of [surface.positions, skirt.positions, water.positions])
      expect(buffer.every(Number.isFinite)).toBe(true)
  })

  it('finds each called file as a hub, the most called at full share', () => {
    expect(layout.hubs.files).toEqual([0])
    expect(layout.hubs.spots[2]).toBe(1)
  })
})

describe('noise', () => {
  it('is seeded and stays in range', () => {
    expect(valueNoise(1.3, 2.7, 5)).toBe(valueNoise(1.3, 2.7, 5))
    expect(valueNoise(1.3, 2.7, 5)).not.toBe(valueNoise(1.3, 2.7, 6))
    for (let i = 0; i < 50; i++) {
      const r = ridged(i * 0.37, i * 0.19, 3)
      expect(r).toBeGreaterThanOrEqual(0)
      expect(r).toBeLessThanOrEqual(1)
    }
  })
})

describe('strata', () => {
  it('stacks each kind by its share of the file', () => {
    // 2 functions, 1 class, 1 variable.
    const bands = kindBands(file('a.ts', { kinds: [2, 1, 0, 0, 0, 1, 0, 0] }))
    expect(bands).toEqual([0.5, 0.75, 0.75, 0.75, 0.75, 1, 1, 1])
    expect(
      kindBands(file('b.ts', { kinds: [0, 0, 0, 0, 0, 0, 0, 0] })),
    ).toEqual(Array.from({ length: 8 }, () => 1))
  })

  it('measures each vertex up its own peak, and leaves open ground without bands', () => {
    const files = [file('a/big.ts', { kinds: [9, 3, 0, 0, 0, 0, 0, 0] })]
    const tree = radialTree(files, TERRAIN_RADIUS)
    const field = terrainField({
      tree,
      files,
      rivers: [],
      colorOf: () => [1, 1, 1],
      seed: 1,
      size: 80,
    })
    const strata = strataOf(field, files)
    const rises = [...strata.rise].filter((r) => r >= 0)
    expect(Math.max(...rises)).toBeCloseTo(1)
    expect(Math.min(...strata.rise)).toBe(-1)
    const v = strata.rise.indexOf(Math.max(...rises))
    expect(strata.lower[v * 4]).toBeCloseTo(0.75)
  })
})

describe('mist', () => {
  const files = Array.from({ length: 20 }, (_, i) =>
    file(`d${i % 3}/f${i}.ts`, { unresolved: i === 7 ? 500 : i }),
  )

  it('only clouds the blindest tenth of files', () => {
    expect(mistyFiles(files)).toEqual([7, 19])
    expect(mistyFiles([file('a.ts')])).toEqual([])
  })

  it('settles puffs near their file, above the ground', () => {
    const tree = radialTree(files, TERRAIN_RADIUS)
    const field = terrainField({
      tree,
      files,
      rivers: [],
      colorOf: () => [1, 1, 1],
      seed: 1,
      size: 80,
    })
    const mist = mistOf(field, tree, files)
    expect(mist.positions.length).toBe(mist.sizes.length * 3)
    expect(mist.sizes.length).toBeGreaterThan(0)
    const x = mist.positions[0]!
    const y = mist.positions[1]!
    const z = mist.positions[2]!
    expect(y).toBeGreaterThan(heightAt(field, x, z))
  })
})
