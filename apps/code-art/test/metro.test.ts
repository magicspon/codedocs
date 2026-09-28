import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { blocksOf, Flag, heightOf, Shape } from '../src/lib/metro-buildings.ts'
import { framesOf } from '../src/lib/metro-frames.ts'
import { metroLayout } from '../src/lib/metro-layout.ts'
import { jamsOf, ribbonsOf } from '../src/lib/metro-ribbons.ts'
import { RoadKind, type Road } from '../src/lib/metro-roads.ts'
import { signName, signsOf } from '../src/lib/metro-signs.ts'
import {
  facedSymbols,
  posterLines,
  posterSpot,
} from '../src/lib/metro-poster.ts'
import { arc, fromDisc, type Vec3 } from '../src/lib/metro-sphere.ts'
import { deal } from '../src/lib/metro-warp.ts'
import { file } from './fixture.ts'
import { town } from './metro-fixture.ts'

describe('fromDisc', () => {
  it('puts the disc centre at the north pole and its rim at the south', () => {
    expect(fromDisc(1, 0)).toEqual([0, 1, 0])
    expect(fromDisc(1, 1)[1]).toBeCloseTo(-1)
  })

  it('is equal-area: half the disc share is half the planet', () => {
    expect(fromDisc(0, 0.5)[1]).toBeCloseTo(0)
  })
})

describe('deal', () => {
  it('spreads files crowded into one fan evenly round their band', () => {
    const angles = Array.from({ length: 40 }, (_, i) => 0.1 + i * 0.001)
    const shares = angles.map(() => 0.5)
    const { plots } = deal(angles, shares, 1, 1)
    // Neighbours end up a fortieth of a turn apart, give or take the jitter.
    const gaps = plots.slice(1).map((p, i) => arc(plots[i]!, p))
    for (const gap of gaps) expect(gap).toBeGreaterThan(0.05)
  })

  it('bends the ground the way the files were dealt', () => {
    const angles = [0.1, 0.2, 0.3, 0.4]
    const { plots, warp } = deal(angles, [0.5, 0.5, 0.5, 0.5], 1, 1)
    // A file's own disc spot lands within jitter of its plot.
    angles.forEach((a, i) =>
      expect(arc(warp(a, 0.5), plots[i]!)).toBeLessThan(0.9),
    )
  })
})

describe('blocksOf', () => {
  it('builds taller for more symbols', () => {
    expect(heightOf(100)).toBeGreaterThan(heightOf(10))
  })

  it('shapes a building by its main kind, and tests as pods', () => {
    const blocks = blocksOf(
      [
        file('a.ts', { kinds: [0, 5, 0, 0, 0, 0, 0, 0] }),
        file('b.ts', { kinds: [0, 0, 9, 0, 0, 0, 0, 0] }),
        file('c.test.ts', { kinds: [9, 0, 0, 0, 0, 0, 0, 0] }),
      ],
      false,
    )
    expect([...blocks.shape]).toEqual([Shape.setback, Shape.spire, Shape.pod])
    expect(blocks.flags[2]! & Flag.test).toBeTruthy()
  })

  it('leaves a file nothing touches dark, and lights a busy one', () => {
    const blocks = blocksOf(
      [file('quiet.ts'), file('busy.ts', { callsIn: 50, refsIn: 20 })],
      false,
    )
    expect(blocks.lights[0]).toBeLessThan(0.1)
    expect(blocks.lights[1]).toBeGreaterThan(0.5)
  })

  it('marks dead code only where fallow’s findings are trusted', () => {
    const health = {
      hotspot: 0,
      commits: 0,
      trend: 0,
      duplicated: 0,
      cyclic: false,
      unused: true,
    }
    const dead = [file('x.ts', { health })]
    expect(blocksOf(dead, false).health[2]).toBe(0)
    expect(blocksOf(dead, true).health[2]).toBe(1)
  })
})

describe('metroLayout', () => {
  const layout = metroLayout(town(120))
  const { blocks, place, radius } = layout

  it('stands every building on the planet', () => {
    for (let i = 0; i < blocks.count; i++) {
      const r = Math.hypot(
        place.foot[i * 3]!,
        place.foot[i * 3 + 1]!,
        place.foot[i * 3 + 2]!,
      )
      expect(r).toBeCloseTo(radius, 3)
    }
  })

  it('keeps buildings from standing on one another', () => {
    let clashes = 0
    for (let i = 0; i < blocks.count; i++)
      layout.near.near(
        place.foot[i * 3]!,
        place.foot[i * 3 + 1]!,
        place.foot[i * 3 + 2]!,
        (j) => {
          if (j <= i) return
          const d = Math.hypot(
            place.foot[i * 3]! - place.foot[j * 3]!,
            place.foot[i * 3 + 1]! - place.foot[j * 3 + 1]!,
            place.foot[i * 3 + 2]! - place.foot[j * 3 + 2]!,
          )
          if (d < (blocks.reach[i]! + blocks.reach[j]!) * 0.6) clashes++
        },
      )
    expect(clashes).toBe(0)
  })

  it('paves a ring road, and avenues out of the root at the north pole', () => {
    expect(layout.roads.some((r) => r.kind === RoadKind.ring)).toBe(true)
    const fromRoot = layout.roads.filter(
      (r) => r.kind === RoadKind.avenue && r.points[1]! > 0.9999,
    )
    expect(fromRoot.length).toBeGreaterThan(0)
  })

  it('starts the buggy near the pole, facing down an avenue', () => {
    const { at, facing } = layout.start
    // A few road points in: within fifteen world units of the pole.
    expect(arc(at, [0, 1, 0]) * radius).toBeLessThan(15)
    // Facing away from the pole, along the ground.
    expect(facing[1]).toBeLessThan(0)
    expect(
      Math.abs(facing[0] * at[0] + facing[1] * at[1] + facing[2] * at[2]),
    ).toBeLessThan(0.05)
  })

  it('lays out the same files the same way every time', () => {
    expect(metroLayout(town(120)).place.foot).toEqual(place.foot)
  })

  it('gives each building a square frame, up out of the planet', () => {
    const frames = framesOf(place)
    const v = (a: Float32Array, i: number): Vec3 => [
      a[i * 3]!,
      a[i * 3 + 1]!,
      a[i * 3 + 2]!,
    ]
    for (let i = 0; i < blocks.count; i += 17) {
      const x = v(frames.x, i)
      const y = v(frames.y, i)
      expect(x[0] * y[0] + x[1] * y[1] + x[2] * y[2]).toBeCloseTo(0, 5)
      // Stored as 32-bit floats, so only close to a thousandth of a radian.
      expect(
        arc(y, v(place.foot, i).map((c) => c / radius) as Vec3),
      ).toBeCloseTo(0, 3)
    }
  })
})

describe('ribbonsOf', () => {
  it('lays each road as a strip, kerb to kerb, just above the ground', () => {
    const layout = metroLayout(town(60))
    const road = layout.roads[0]!
    const r = ribbonsOf([road], layout.radius, () => [1, 0, 0])
    const points = road.points.length / 3
    expect(r.positions.length).toBe(points * 6)
    expect(r.index.length).toBe((points - 1) * 6)
    const lift =
      Math.hypot(r.positions[0]!, r.positions[1]!, r.positions[2]!) -
      layout.radius
    expect(lift).toBeGreaterThan(0)
    expect(lift).toBeLessThan(0.2)
    // The two sides of the first point are a road's width apart.
    const width = Math.hypot(
      r.positions[0]! - r.positions[3]!,
      r.positions[1]! - r.positions[4]!,
      r.positions[2]! - r.positions[5]!,
    )
    expect(width).toBeCloseTo(road.width, 1)
  })
})

describe('signs', () => {
  it('shows a file by its own name, without folders or extension', () => {
    expect(signName('src/vs/base/common/uri.ts')).toBe('uri')
    expect(signName('a/b/next-test-utils.d.ts')).toBe('next-test-utils')
    expect(signName('x/a-very-long-file-name-indeed-yes.ts')).toHaveLength(22)
  })

  it('puts the busiest files up in lights, roofs above, blades up the side', () => {
    const series = town(240)
    const layout = metroLayout(series)
    const frames = framesOf(layout.place)
    const signs = signsOf(
      series.merged.files,
      layout.blocks,
      layout.place,
      frames,
    )
    expect(signs.files.length).toBeGreaterThan(0)
    signs.files.forEach((file, s) => {
      const foot = new Vector3().fromArray(layout.place.foot, file * 3)
      const middle = new Vector3().fromArray(signs.middle, s * 3)
      const rise = middle.clone().sub(foot).dot(foot.clone().normalize())
      // A roof sign stands above the roof; a blade starts partway up.
      if (signs.blade[s]) expect(rise).toBeLessThan(layout.blocks.height[file]!)
      else expect(rise).toBeGreaterThan(layout.blocks.height[file]!)
    })
  })
})

describe('jamsOf', () => {
  const road = (kind: RoadKind, up: number, down: number): Road => ({
    kind,
    width: 6,
    points: new Float32Array(6),
    up,
    down,
    angle: 0,
    node: 0,
  })

  it('queues busy lanes harder than quiet ones', () => {
    const [busy] = jamsOf(road(RoadKind.avenue, 1, 0))
    const [quiet] = jamsOf(road(RoadKind.avenue, 0.2, 0))
    expect(busy).toBeGreaterThan(quiet)
  })

  it('never queues on a ring road, nor at a street’s dead end', () => {
    expect(jamsOf(road(RoadKind.ring, 1, 1))).toEqual([0, 0])
    expect(jamsOf(road(RoadKind.street, 1, 1))[1]).toBe(0)
  })
})

describe('posters', () => {
  it('lists a file’s own symbols, top level first, with their kinds', () => {
    const symbols = {
      names: ['inner', 'Outer', 'main'],
      kinds: [6, 1, 0],
      parents: [1, -1, -1],
    }
    const lines = posterLines(file('a.ts'), symbols)
    expect(lines.map((l) => l.text)).toEqual(['Outer', 'main', 'inner'])
    expect(lines[0]).toMatchObject({ kind: 1, note: 'class' })
  })

  it('waits for names, and knows when there are none', () => {
    const names = { 'a.ts': { names: ['x'], kinds: [0], parents: [-1] } }
    expect(facedSymbols(undefined, 'a.ts')).toBeUndefined()
    expect(facedSymbols(names, undefined)).toBeUndefined()
    expect(facedSymbols(null, 'a.ts')).toBeNull()
    expect(facedSymbols(names, 'a.ts')?.names).toEqual(['x'])
  })

  it('counts kinds instead when the names were not exported', () => {
    const lines = posterLines(
      file('a.ts', { kinds: [3, 1, 0, 0, 0, 0, 0, 0] }),
      null,
    )
    expect(lines.map((l) => l.text)).toEqual(['3 functions', '1 class'])
  })

  it('pastes it on the wall facing the driver, standing on the pavement', () => {
    const layout = metroLayout(town(120))
    const frames = framesOf(layout.place)
    const foot = new Vector3().fromArray(layout.place.foot, 5 * 3)
    const up = foot.clone().normalize()
    const out = new Vector3().fromArray(frames.x, 5 * 3)
    const from = foot.clone().addScaledVector(out, 30)
    const spot = posterSpot(layout, frames, 5, from.toArray(), 0.5)
    const middle = new Vector3(...spot.middle)
    // On the near side of the building, low down, and no taller than it.
    expect(middle.clone().sub(foot).dot(out)).toBeGreaterThan(0)
    expect(middle.clone().sub(foot).dot(up)).toBeLessThan(
      layout.blocks.height[5]!,
    )
    expect(spot.height).toBeLessThanOrEqual(layout.blocks.height[5]!)
  })
})
