import { describe, expect, it } from 'vitest'
import type { Anchor } from '../src/lib/flow.ts'
import { gather, hopOf, isolatedFiles } from '../src/lib/isolate.ts'
import { fromAtlas } from '../src/lib/series.ts'
import { traceOf, type TraceQuery } from '../src/lib/trace.ts'
import { atlas, file } from './fixture.ts'

/** `x → a → b → c`, and `y` on its own: something to isolate, and something to hide. */
function series(): ReturnType<typeof fromAtlas> {
  return fromAtlas({
    ...atlas(),
    files: ['a', 'b', 'c', 'x', 'y'].map((p) => file(`src/${p}.ts`)),
    calls: [
      [3, 0, 1],
      [0, 1, 1],
      [1, 2, 1],
    ],
    imports: [],
  })
}

const query = (text: string): TraceQuery => ({
  text,
  direction: 'both',
  via: 'calls',
  depth: 2,
})

/** Spread far apart, as the galaxy would have them. */
const anchors: Anchor[] = [
  [0, 0, 0],
  [40, 0, 0],
  [-30, 5, 20],
  [0, 0, -50],
  [10, 10, 10],
]

/** Where `file` ends up: its anchor plus its offset. */
const at = (offsets: Float32Array, file: number): number[] =>
  [0, 1, 2].map((k) => anchors[file]![k]! + offsets[file * 3 + k]!)

const distance = (p: number[], q: readonly number[]): number =>
  Math.hypot(p[0]! - q[0]!, p[2]! - q[2]!)

describe('isolation', () => {
  const trace = traceOf(series(), query('src/a.ts'))!

  it('keeps the searched file and whatever the trace reaches', () => {
    expect(isolatedFiles(trace)).toEqual([0, 1, 2, 3])
    expect(hopOf(trace, 0)).toBe(0)
    expect(hopOf(trace, 2)).toBe(2)
    expect(hopOf(trace, 4)).toBe(-1)
  })

  it('leaves one searched file, and untouched ones, where they are', () => {
    const offsets = gather(trace, anchors, 3)
    expect(at(offsets, 0)).toEqual([0, 0, 0])
    expect(at(offsets, 4)).toEqual([10, 10, 10])
  })

  it('draws each hop in on its own ring, farther hops wider', () => {
    const offsets = gather(trace, anchors, 3)
    expect(distance(at(offsets, 1), [0, 0, 0])).toBeCloseTo(3)
    expect(distance(at(offsets, 3), [0, 0, 0])).toBeCloseTo(3)
    expect(distance(at(offsets, 2), [0, 0, 0])).toBeCloseTo(6)
  })

  it('lifts callers above the searched file and sinks callees below', () => {
    const offsets = gather(trace, anchors, 3)
    expect(at(offsets, 3)[1]).toBeGreaterThan(0)
    expect(at(offsets, 1)[1]).toBeLessThan(0)
  })

  it('rings several searched files round their middle', () => {
    const both = traceOf(series(), query('src/ .ts'))!
    const offsets = gather(both, anchors, 3)
    const ring = both.roots.map((r) => at(offsets, r))
    const middle = [0, 1, 2].map(
      (k) => both.roots.reduce((s, r) => s + anchors[r]![k]!, 0) / 5,
    )
    for (const p of ring)
      expect(distance(p, middle)).toBeCloseTo(
        (ring.length * 0.9) / (Math.PI * 2),
      )
  })
})
