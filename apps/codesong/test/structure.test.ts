import { describe, expect, it } from 'vitest'
import { depths, pageRank, rankNormalise } from '../src/metrics.ts'
import { dependencyPaths } from '../src/paths.ts'
import { readStructure } from '../src/structure.ts'
import { atlas } from './fixture.ts'

describe('metrics', () => {
  it('ranks the node everything flows into highest, and sums to one', () => {
    const rank = pageRank([[[1, 1]], [[2, 1]], [], [[2, 1]]])
    expect(rank.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
    expect(Math.max(...rank)).toBe(rank[2])
  })

  it('measures depth from entry points, and puts entry-less cycles deepest', () => {
    // 0 → 1 → 2, and 3 ⇄ 4 which nothing reaches.
    expect(
      depths([[[1, 1]], [[2, 1]], [], [[4, 1]], [[3, 1]]], [0, 1, 1, 1, 1]),
    ).toEqual([0, 1, 2, 2, 2])
  })

  it('normalises to ranks with ties sharing their average', () => {
    expect(rankNormalise([10, 30, 20, 30, 0])).toEqual([
      0.25, 0.875, 0.5, 0.875, 0,
    ])
    expect(rankNormalise([7])).toEqual([0.5])
  })
})

describe('readStructure', () => {
  const structure = readStructure(atlas)
  const byPath = new Map(structure.nodes.map((n) => [n.path, n]))

  it('keeps hand-written source only', () => {
    expect(structure.nodes.map((n) => n.path)).not.toContain(
      'src/users.test.ts',
    )
    expect(structure.nodes.map((n) => n.path)).not.toContain(
      'src/schema.gen.ts',
    )
    expect(structure.nodes).toHaveLength(7)
  })

  it('counts distinct neighbours, merging calls and imports', () => {
    // main calls router and imports log; the test's calls into users are dropped.
    expect(byPath.get('src/main.ts')).toMatchObject({
      fanOut: 2,
      fanIn: 0,
      depth: 0,
    })
    expect(byPath.get('src/users.ts')).toMatchObject({ fanIn: 1, fanOut: 3 })
    expect(byPath.get('src/model.ts')).toMatchObject({ fanIn: 3, fanOut: 0 })
  })

  it('makes the shared model the most central file', () => {
    const top = [...structure.nodes].sort(
      (a, b) => b.centrality - a.centrality,
    )[0]
    expect(top?.path).toBe('src/model.ts')
    expect(top?.rank.centrality).toBe(1)
  })

  it('orders edges heaviest first', () => {
    const users = structure.nodes.findIndex((n) => n.path === 'src/users.ts')
    const weights = structure.out[users]!.map(([, w]) => w)
    expect(weights).toEqual([...weights].sort((a, b) => b - a))
  })
})

describe('dependencyPaths', () => {
  const structure = readStructure(atlas)
  const names = (path: number[]): string[] =>
    path.map((i) => structure.nodes[i]!.path)

  it('follows the heaviest edges, skipping chains too short to be a phrase', () => {
    // db is more central than users, but db → model is only two files long.
    const [first] = dependencyPaths(structure, 3)
    expect(names(first!)).toEqual(['src/users.ts', 'src/db.ts', 'src/model.ts'])
  })

  it('drops a path that mostly retraces an earlier one', () => {
    // orders → db → model, router → users → …, main → router → … all share
    // more than half their files with users → db → model.
    expect(dependencyPaths(structure, 6)).toHaveLength(1)
  })

  it('respects the limit and never visits a file twice in one path', () => {
    const paths = dependencyPaths(structure, 2)
    expect(paths.length).toBeLessThanOrEqual(2)
    for (const path of paths) expect(new Set(path).size).toBe(path.length)
  })
})
