import { describe, expect, it } from 'vitest'
import { clusters, cycles } from '../src/clusters.ts'
import { displayName, subsystems } from '../src/hierarchy.ts'
import type { Adjacency } from '../src/metrics.ts'
import { analyse } from '../src/regions.ts'
import { readStructure } from '../src/structure.ts'
import { atlas } from './fixture.ts'

/** `count` files named `dir/fN.ts`. */
const files = (dir: string, count: number): string[] =>
  Array.from({ length: count }, (_, i) => `${dir}/f${i}.ts`)

const paths = (found: ReturnType<typeof subsystems>): string[] =>
  found.map((s) => s.path)

describe('subsystems', () => {
  it('walks down through a directory that holds nearly everything', () => {
    const repo = [
      ...files('src/vs/base', 30),
      ...files('src/vs/editor', 30),
      'README.ts',
    ]
    expect(paths(subsystems(repo))).toEqual(['src/vs/base', 'src/vs/editor'])
  })

  it('splits the largest part until the parts are balanced', () => {
    const repo = [
      ...files('src/workbench/contrib', 40),
      ...files('src/workbench/services', 40),
      ...files('src/platform', 40),
      ...files('src/base', 30),
      ...files('extensions/git', 50),
    ]
    expect(paths(subsystems(repo))).toEqual([
      'extensions/git',
      'src/base',
      'src/platform',
      'src/workbench/contrib',
      'src/workbench/services',
    ])
  })

  it('keeps small leftovers together under their parent rather than dropping them', () => {
    const repo = [
      ...files('lib/a', 40),
      ...files('lib/b', 40),
      ...files('lib/c', 2),
      ...files('lib/d', 2),
      ...files('lib', 3),
    ]
    const found = subsystems(repo)
    expect(paths(found)).toEqual(['lib', 'lib/a', 'lib/b'])
    expect(found.find((s) => s.path === 'lib')?.files).toHaveLength(7)
  })

  it('never makes more than seven', () => {
    const repo = Array.from({ length: 12 }, (_, i) =>
      files(`pkg/m${i}`, 10),
    ).flat()
    expect(subsystems(repo).length).toBeLessThanOrEqual(7)
  })

  it('names a subsystem by what the code is, not where it lives', () => {
    expect(displayName('packages/ui/src')).toBe('ui')
    expect(displayName('src/vs/workbench')).toBe('workbench')
    expect(displayName('src')).toBe('src')
    expect(displayName('')).toBe('root')
  })
})

/** Undirected-looking adjacency from `[a, b]` pairs, one direction each. */
function graph(n: number, edges: [number, number][]): Adjacency {
  const out: [number, number][][] = Array.from({ length: n }, () => [])
  for (const [a, b] of edges) out[a]!.push([b, 1])
  return out
}

describe('clusters', () => {
  it('finds two tight groups joined by one edge', () => {
    // 0-1-2 all linked, 3-4-5 all linked, one bridge 2 → 3.
    const out = graph(6, [
      [0, 1],
      [1, 2],
      [2, 0],
      [3, 4],
      [4, 5],
      [5, 3],
      [2, 3],
    ])
    expect(clusters(out)).toEqual([0, 0, 0, 1, 1, 1])
  })

  it('does not let a hub swallow everything', () => {
    // Two triangles, and a hub every file depends on.
    const out = graph(7, [
      [0, 1],
      [1, 2],
      [2, 0],
      [3, 4],
      [4, 5],
      [5, 3],
      ...[0, 1, 2, 3, 4, 5].map((i): [number, number] => [i, 6]),
    ])
    const label = clusters(out)
    expect(label[0]).toBe(label[2])
    expect(label[3]).toBe(label[5])
    expect(label[0]).not.toBe(label[3])
  })
})

describe('cycles', () => {
  it('finds each loop of two or more files, largest first', () => {
    // 0 → 1 → 2 → 0, 3 ⇄ 4, and 5 on its own pointing into the first loop.
    const out = graph(6, [
      [0, 1],
      [1, 2],
      [2, 0],
      [3, 4],
      [4, 3],
      [5, 0],
    ])
    expect(cycles(out)).toEqual([
      [0, 1, 2],
      [3, 4],
    ])
  })

  it('survives a chain deep enough to overflow a recursive walk', () => {
    const n = 50_000
    const edges = Array.from({ length: n - 1 }, (_, i): [number, number] => [
      i,
      i + 1,
    ])
    expect(cycles(graph(n, [...edges, [n - 1, 0]]))[0]).toHaveLength(n)
  })
})

describe('analyse', () => {
  it('measures each region of the fixture', () => {
    const [region] = analyse(readStructure(atlas)).regions
    expect(region).toMatchObject({ path: 'src', name: 'src', share: 1 })
    // Nothing crosses its border, so it is neither foundation nor top.
    expect(region!.foundation).toBe(0.5)
    expect(region!.files[0]).toBe(
      readStructure(atlas).nodes.findIndex((n) => n.path === 'src/model.ts'),
    )
  })
})
