import { describe, expect, it } from 'vitest'
import { sequence, shift } from '../src/compose/arrangement.ts'
import { plan, sections } from '../src/compose/form.ts'
import { phrase } from '../src/compose/harmony.ts'
import { euclid, groove } from '../src/compose/rhythm.ts'
import type { Motif } from '../src/model.ts'
import type { Region } from '../src/regions.ts'
import { readStructure } from '../src/structure.ts'
import { atlas } from './fixture.ts'

/** A region with only the measures the form reads. */
function region(
  path: string,
  share: number,
  foundation: number,
  density: number,
): Region {
  return {
    path,
    name: path,
    files: [],
    share,
    weight: share,
    foundation,
    density,
    leafShare: 0.2,
    clusters: [],
    cycles: [],
  }
}

describe('form', () => {
  const regions = [
    region('top', 0.3, 0.05, 1),
    region('base', 0.1, 0.95, 4),
    region('middle', 0.2, 0.5, 3),
    region('loose', 0.15, 0.3, 0.5),
    region('core', 0.25, 0.8, 5),
  ]
  const planned = plan(regions)

  it('plays foundations first, framed by an intro and outro on the deepest one', () => {
    expect(planned.map((p) => `${p.form}:${p.region.path}`)).toEqual([
      'intro:base',
      'verse:base',
      'verse:core',
      'verse:middle',
      'breakdown:loose',
      'chorus:top',
      'outro:base',
    ])
  })

  it('keeps the chorus, intro and outro at home and moves the rest away', () => {
    const areas = new Map(
      planned.map((p) => [`${p.form}:${p.region.path}`, p.area]),
    )
    expect(areas.get('chorus:top')).toBe(0)
    expect(areas.get('intro:base')).toBe(0)
    expect(areas.get('verse:base')).toBe(0)
    expect(areas.get('verse:middle')).not.toBe(0)
  })

  it('places sections back to back in whole four-bar units', () => {
    const form = sections(planned, 'auto')
    for (let i = 1; i < form.length; i++) {
      expect(form[i]!.start).toBe(form[i - 1]!.start + form[i - 1]!.length)
    }
    for (const s of form) expect(s.length % 16).toBe(0)
    expect(form.find((s) => s.form === 'chorus')?.length).toBe(64)
  })

  it('scales to a bar budget without dropping a section', () => {
    const form = sections(planned, 32)
    expect(form).toHaveLength(planned.length)
    for (const s of form) expect(s.length).toBeGreaterThanOrEqual(16)
  })

  it('has no breakdown with too few subsystems to break from', () => {
    expect(plan(regions.slice(0, 3)).some((p) => p.form === 'breakdown')).toBe(
      false,
    )
  })
})

describe('sequence', () => {
  const motif = (id: string, length: number): Motif => ({
    id,
    length,
    notes: [],
    source: { files: [], structure: 'dependency-path' },
  })
  const section = {
    name: 'x',
    form: 'verse' as const,
    source: 'x',
    start: 16,
    length: 20,
    intensity: 1,
    area: 0,
  }

  it('plays motifs in turn from the chosen one and cuts the last to fit', () => {
    const parts = sequence([motif('a', 8), motif('b', 4)], section, 1, shift(0))
    expect(parts.map((p) => [p.motif, p.start, p.length])).toEqual([
      ['b', 16, 4],
      ['a', 20, 8],
      ['b', 28, 4],
      ['a', 32, 4],
    ])
  })

  it('makes room for a stretched motif', () => {
    const parts = sequence(
      [motif('a', 8)],
      section,
      0,
      shift(0, { stretch: 2 }),
    )
    expect(parts.map((p) => [p.start, p.length])).toEqual([
      [16, 16],
      [32, 4],
    ])
  })
})

describe('phrase', () => {
  const node = (depth: number, fanOut = 0.2) =>
    ({ rank: { depth, fanIn: 0.9, fanOut, centrality: 1 } }) as never

  it('starts home and never repeats a chord back to back', () => {
    const { call } = phrase([node(0.9), node(0.5), node(0.5), node(0.5)])
    expect(call[0]).toBe(0)
    for (let i = 1; i < call.length; i++) expect(call[i]).not.toBe(call[i - 1])
  })

  it('uses four different chords and does not end on the tonic', () => {
    const { call } = phrase([node(0.3), node(0.3), node(0.3), node(0.3)])
    expect(new Set(call).size).toBe(4)
    expect(call.at(-1)).not.toBe(0)
  })

  it('finds another call when this one is taken', () => {
    const nodes = [node(0.3), node(0.6), node(0.3), node(0.9)]
    const first = phrase(nodes).call
    const second = phrase(nodes, new Set([first.join()])).call
    expect(second[0]).toBe(0)
    expect(second).not.toEqual(first)
  })

  it('answers with the same opening and a different ending', () => {
    const { call, answer } = phrase([
      node(0.3),
      node(0.6),
      node(0.3),
      node(0.9),
    ])
    expect(answer).toBeDefined()
    expect(answer!.slice(0, 2)).toEqual(call.slice(0, 2))
    expect(answer!.slice(2)).not.toEqual(call.slice(2))
    expect(answer!.at(-1)).not.toBe(0)
  })
})

describe('rhythm', () => {
  it('spreads hits as evenly as it can', () => {
    const text = (p: boolean[]) => p.map((on) => (on ? 'x' : '.')).join('')
    expect(text(euclid(3, 8))).toBe('x..x..x.')
    expect(text(euclid(4, 16))).toBe('x...x...x...x...')
    expect(text(euclid(3, 8, 1))).toBe('.x..x..x')
  })

  const structure = readStructure(atlas)
  const busy = {
    ...region('src', 1, 0.5, 3),
    files: structure.nodes.map((_, i) => i),
  }
  const voices = (form: 'intro' | 'verse' | 'breakdown') =>
    new Set(groove(structure, busy, form, () => 0).notes.map((n) => n.degree))

  it('lets the form be heard in the drums', () => {
    expect(voices('intro')).toEqual(new Set([2]))
    expect(voices('breakdown').has(0)).toBe(false)
    expect(voices('verse')).toEqual(new Set([0, 1, 2]))
  })
})
