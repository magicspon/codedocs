import { describe, expect, it } from 'vitest'
import { interval, pathMotif } from '../src/compose/melody.ts'
import type { Structure, StructureNode } from '../src/structure.ts'

/** A file with the measures the melody reads; every rank near the top, like a hub. */
function file(path: string, fanIn: number, fanOut = 0.5): StructureNode {
  return {
    path,
    fanIn,
    fanOut: 3,
    depth: 1,
    centrality: 1,
    rank: { fanIn: 0.98, fanOut, depth: 0.3, centrality: 1 },
  }
}

function structure(nodes: StructureNode[]): Structure {
  return {
    name: 'test',
    commit: 'abc',
    nodes,
    out: nodes.map(() => []),
    meanFanOut: 1,
    leafShare: 0,
  }
}

describe('melody', () => {
  it('moves up to a more used file and down to a less used one', () => {
    expect(interval(file('a', 10), file('b', 40))).toBeGreaterThan(0)
    expect(interval(file('a', 40), file('b', 10))).toBeLessThan(0)
    expect(interval(file('a', 10), file('b', 10))).toBe(0)
  })

  it('leaps further the bigger the difference', () => {
    const near = interval(file('a', 10), file('b', 15))
    const far = interval(file('a', 10), file('b', 200))
    expect(far).toBeGreaterThan(near)
  })

  it('gives hub paths a contour that does not only climb', () => {
    const nodes = [
      file('src/a.ts', 50),
      file('src/b.ts', 12),
      file('src/c.ts', 90),
      file('src/d.ts', 20),
    ]
    const motif = pathMotif(structure(nodes), [0, 1, 2, 3], 'theme')
    const moves = motif.notes
      .slice(1)
      .map((n, i) => n.degree - motif.notes[i]!.degree)
    expect(moves.some((m) => m > 0)).toBe(true)
    expect(moves.some((m) => m < 0)).toBe(true)
  })

  it('breathes where the path crosses into another folder', () => {
    const nodes = [file('src/a/x.ts', 10), file('src/b/y.ts', 10)]
    const [first, second] = pathMotif(structure(nodes), [0, 1], 'p').notes
    expect(second!.start).toBeGreaterThan(first!.start + first!.duration)
  })

  it('ends on a note of the home chord', () => {
    const nodes = [file('src/a.ts', 10), file('src/b.ts', 20)]
    const last = pathMotif(structure(nodes), [0, 1], 'p').notes.at(-1)!
    expect([0, 2, 4]).toContain(((last.degree % 7) + 7) % 7)
  })
})
