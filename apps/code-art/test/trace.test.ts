import { describe, expect, it } from 'vitest'
import { flowOf } from '../src/lib/flow.ts'
import { fromAtlas } from '../src/lib/series.ts'
import { traceHops, traceSummary } from '../src/lib/trace-text.ts'
import { matchFiles, traceOf, type TraceQuery } from '../src/lib/trace.ts'
import { atlas, file } from './fixture.ts'

/** A chain `a → b → c → d`, plus `x → b`, so there is something to follow. */
function chain(): ReturnType<typeof atlas> {
  return {
    ...atlas(),
    files: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'x.ts'].map((p) =>
      file(`src/${p}`),
    ),
    calls: [
      [0, 1, 5],
      [1, 2, 3],
      [2, 3, 1],
      [4, 1, 2],
    ],
    imports: [[0, 3, 1]],
  }
}

const query = (over: Partial<TraceQuery>): TraceQuery => ({
  text: '',
  direction: 'both',
  via: 'calls',
  depth: 2,
  ...over,
})

describe('matchFiles', () => {
  const { files } = atlas()

  it('needs every term, ignoring case', () => {
    expect(matchFiles(files, 'A HUB')).toEqual([0])
    expect(matchFiles(files, 'B/ .TS')).toEqual([2, 3])
    expect(matchFiles(files, '   ')).toEqual([])
  })

  it('ranks a match in the file name ahead of one only in a folder', () => {
    expect(matchFiles(files, 'one')[0]).toBe(2)
    expect(matchFiles(files, 'b')[0]).toBe(0)
  })

  it('takes an exact path alone, so a clicked file traces by itself', () => {
    expect(matchFiles([file('a.ts'), file('a.tsx')], 'a.ts')).toEqual([0])
  })
})

describe('traceOf', () => {
  const series = fromAtlas(chain())

  it('is null when nothing matches', () => {
    expect(traceOf(series, query({ text: 'nope' }))).toBeNull()
  })

  it('follows callees out and callers in, hop by hop', () => {
    const trace = traceOf(series, query({ text: 'src/b.ts' }))!
    expect(trace.roots).toEqual([1])
    expect([...trace.hopOut]).toEqual([-1, 0, 1, 2, -1])
    expect([...trace.hopIn]).toEqual([1, 0, -1, -1, 1])
    expect(trace.focus).toEqual(Float32Array.from([0.6, 1, 0.6, 0.6, 0.6]))
  })

  it('stops at the depth asked for', () => {
    const trace = traceOf(series, query({ text: 'src/a.ts', depth: 1 }))!
    expect([...trace.hopOut]).toEqual([0, 1, -1, -1, -1])
  })

  it('times callers before callees, so the flow arrives and then leaves', () => {
    const trace = traceOf(series, query({ text: 'src/b.ts' }))!
    const slot = (from: number, to: number): number =>
      trace.edges.find((e) => e.from === from && e.to === to)!.slot
    expect(trace.lead).toBe(2)
    expect(slot(0, 1)).toBe(1)
    expect(slot(1, 2)).toBe(2)
    expect(slot(2, 3)).toBe(3)
    expect(trace.slots).toBe(4)
    for (const e of trace.edges) expect(e.slot).toBeLessThan(trace.slots)
  })

  it('follows one direction only when asked', () => {
    const trace = traceOf(series, query({ text: 'src/b.ts', direction: 'in' }))!
    expect(trace.edges.every((e) => e.flow === -1)).toBe(true)
    expect(trace.slots).toBe(2)
  })

  it('can follow imports instead of calls', () => {
    const trace = traceOf(series, query({ text: 'src/a.ts', via: 'imports' }))!
    expect(trace.edges.map((e) => [e.from, e.to])).toEqual([[0, 3]])
  })
})

describe('flowOf', () => {
  const series = fromAtlas(chain())
  const trace = traceOf(series, query({ text: 'src/b.ts' }))!
  const flow = flowOf(trace, {
    anchors: series.merged.files.map((_, i) => [i * 10, 0, 0] as const),
    bow: 0.3,
    size: 1,
    lives: series.fileLife,
  })

  it('draws one marker per touched file, and loops with a beat of rest', () => {
    expect(flow.markers.sizes.length).toBe(5)
    expect(flow.loop).toBe(trace.slots + 1)
  })

  it('bows every arc above its ends', () => {
    const ys = flow.lines.positions.filter((_, i) => i % 3 === 1)
    expect(Math.max(...ys)).toBeGreaterThan(0)
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0)
  })

  it('flashes a callee when its packet lands and a caller when it leaves', () => {
    const at = (fileIndex: number): number => {
      const k = [...trace.focus]
        .flatMap((f, i) => (f > 0 ? [i] : []))
        .indexOf(fileIndex)
      return flow.markers.arrivals[k]!
    }
    expect(at(1)).toBe(trace.lead)
    expect(at(0)).toBe(trace.lead - 1)
    expect(at(3)).toBe(trace.lead + 2)
  })
})

describe('trace text', () => {
  const series = fromAtlas(chain())
  const trace = traceOf(series, query({ text: 'src/b.ts' }))!

  it('says what the search found, or how to start one', () => {
    expect(traceSummary(query({}), null)).toMatch(/Type part of a path/)
    expect(traceSummary(query({ text: 'nope' }), null)).toBe(
      'No file path matches.',
    )
    expect(traceSummary(query({ text: 'src/b.ts' }), trace)).toBe(
      '1 file found · 4 reached · 4 links',
    )
  })

  it('says when a broad search is cut short', () => {
    const many = fromAtlas({
      ...atlas(),
      files: Array.from({ length: 70 }, (_, i) => file(`f${i}.ts`)),
      calls: [],
      imports: [],
    })
    const q = query({ text: '.ts' })
    expect(traceSummary(q, traceOf(many, q))).toBe(
      '70 files found (tracing the first 60) · 0 reached · 0 links',
    )
  })

  it('places a file on the trace in hops', () => {
    expect(traceHops(trace, 1)).toBe('searched')
    expect(traceHops(trace, 0)).toBe('1 hop in')
    expect(traceHops(trace, 3)).toBe('2 hops out')
    expect(traceHops(trace, null)).toBeUndefined()
    expect(traceHops(null, 1)).toBeUndefined()
  })
})
