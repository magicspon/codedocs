import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { IDLE } from '../src/lib/craft.ts'
import {
  BUGGY_REACH,
  drive,
  park,
  TOP_SPEED,
  type Box,
} from '../src/lib/buggy.ts'
import { hashOf } from '../src/lib/metro-hash.ts'
import { metroLayout, type MetroLayout } from '../src/lib/metro-layout.ts'
import { roadIndexOf } from '../src/lib/metro-road-index.ts'
import { RoadKind, type Road } from '../src/lib/metro-roads.ts'
import { autopilot, type Pilot } from '../src/lib/metro-autopilot.ts'
import { rng } from '../src/lib/rng.ts'
import { lookingAt } from '../src/lib/metro-sight.ts'
import { hopTo } from '../src/lib/metro-hop.ts'
import type { Vec3 } from '../src/lib/metro-sphere.ts'
import { atlas, file } from './fixture.ts'
import { town } from './metro-fixture.ts'
import { fromAtlas } from '../src/lib/series.ts'
import { hidden } from '../src/lib/metro-tags.ts'

describe('drive', () => {
  const radius = 100
  const open = () => {}
  const buggy = () =>
    park(new Vector3(0, radius, 0), new Vector3(0, 0, -1), radius)

  it('drives forward on the ground, no faster than the top speed', () => {
    const b = buggy()
    for (let i = 0; i < 600; i++)
      drive(b, { ...IDLE, thrust: 1 }, 1 / 60, radius, open)
    expect(b.position.length()).toBeCloseTo(radius, 5)
    expect(b.velocity.length()).toBeLessThanOrEqual(TOP_SPEED + 0.5)
    expect(b.forward.dot(b.position.clone().normalize())).toBeCloseTo(0, 5)
  })

  it('does not turn on the spot', () => {
    const b = buggy()
    for (let i = 0; i < 60; i++)
      drive(b, { ...IDLE, turn: 1 }, 1 / 60, radius, open)
    expect(b.forward.z).toBeCloseTo(-1)
  })

  it('turns right when steered right on the move', () => {
    const b = buggy()
    for (let i = 0; i < 60; i++)
      drive(b, { ...IDLE, thrust: 1 }, 1 / 60, radius, open)
    for (let i = 0; i < 30; i++)
      drive(b, { ...IDLE, thrust: 1, turn: 1 }, 1 / 60, radius, open)
    // Seen from above, facing -z, right is +x.
    expect(b.forward.x).toBeGreaterThan(0.2)
  })

  it('stops at a wall', () => {
    const b = buggy()
    const wall: Box = {
      middle: new Vector3(0, radius, -10),
      x: new Vector3(1, 0, 0),
      z: new Vector3(0, 0, 1),
      halfX: 5,
      halfZ: 1,
    }
    for (let i = 0; i < 300; i++)
      drive(b, { ...IDLE, thrust: 1 }, 1 / 60, radius, (_, visit) =>
        visit(wall),
      )
    expect(b.position.z).toBeGreaterThan(-9 - BUGGY_REACH - 0.05)
  })
})

describe('lookingAt', () => {
  // Three buildings on a planet of 100: one dead ahead, one nearer but well
  // off to the side, one behind.
  const radius = 100
  const spot = (x: number, z: number): number[] =>
    new Vector3(x, radius, z).setLength(radius).toArray()
  const foot = new Float32Array([
    ...spot(0, -30),
    ...spot(-15, -10),
    ...spot(0, 20),
  ])
  const layout = {
    place: { foot, heading: new Float32Array(3) },
    blocks: { reach: new Float32Array([3, 3, 3]) },
    near: hashOf(foot, 3, 40),
  } as unknown as MetroLayout
  const at = new Vector3(0, radius, 0)
  const up = new Vector3(0, 1, 0)

  it('names the building straight ahead, not a nearer one to the side', () => {
    expect(lookingAt(layout, at, new Vector3(0, 0, -1), up)).toBe(0)
  })

  it('names the one behind when looking back', () => {
    expect(lookingAt(layout, at, new Vector3(0, 0, 1), up)).toBe(2)
  })

  it('names nothing when looking straight up', () => {
    expect(lookingAt(layout, at, up, up)).toBeNull()
  })
})

describe('autopilot', () => {
  // A road running north from the pole, and one crossing its far end east to west.
  const radius = 200
  const line = (from: Vec3, to: Vec3, n: number): Float32Array => {
    const out = new Float32Array((n + 1) * 3)
    for (let s = 0; s <= n; s++) {
      const t = s / n
      const p = new Vector3(
        from[0] + (to[0] - from[0]) * t,
        radius,
        from[2] + (to[2] - from[2]) * t,
      ).normalize()
      out.set(p.toArray(), s * 3)
    }
    return out
  }
  const road = (points: Float32Array): Road => ({
    kind: RoadKind.avenue,
    width: 6,
    points,
    up: 0,
    down: 0,
    angle: 0,
  })
  const roads = [
    road(line([0, 0, 0], [0, 0, -60], 40)),
    road(line([-40, 0, -60], [40, 0, -60], 54)),
  ]
  const index = roadIndexOf(roads, radius, 16)

  it('follows the road and turns onto the next at its end', () => {
    const b = park(new Vector3(0, radius, -2), new Vector3(0, 0, -1), radius)
    let pilot: Pilot | null = null
    const random = rng(3)
    const onRoad = new Set<number>()
    let across = 0
    for (let i = 0; i < 60 * 8; i++) {
      const out = autopilot(index, roads, b, pilot, random, 1 / 60)
      pilot = out.pilot
      if (pilot) onRoad.add(index.road[pilot.at]!)
      drive(b, out.stick, 1 / 60, radius, () => {})
      across = Math.max(across, Math.abs(b.position.x))
    }
    // It reached the crossing road and drove off along it, one way or the other.
    expect(onRoad.has(1)).toBe(true)
    expect(across).toBeGreaterThan(15)
  })

  it('backs off when wedged against a wall', () => {
    const b = park(new Vector3(0, radius, -2), new Vector3(0, 0, -1), radius)
    const wall: Box = {
      middle: new Vector3(0, radius, -8),
      x: new Vector3(1, 0, 0),
      z: new Vector3(0, 0, 1),
      halfX: 6,
      halfZ: 1,
    }
    let pilot: Pilot | null = null
    let reversed = false
    for (let i = 0; i < 60 * 4; i++) {
      const out = autopilot(index, roads, b, pilot, () => 0.99, 1 / 60)
      pilot = out.pilot
      if (out.stick.thrust < 0 && b.velocity.dot(b.forward) < -0.5)
        reversed = true
      drive(b, out.stick, 1 / 60, radius, (_, visit) => visit(wall))
    }
    expect(reversed).toBe(true)
  })

  it('keeps to the right-hand lane', () => {
    const b = park(new Vector3(0, radius, -2), new Vector3(0, 0, -1), radius)
    let pilot: Pilot | null = null
    for (let i = 0; i < 60 * 2; i++) {
      const out = autopilot(index, roads, b, pilot, () => 0.99, 1 / 60)
      pilot = out.pilot
      drive(b, out.stick, 1 / 60, radius, () => {})
    }
    // Heading -z, right is +x: a quarter of the road's width over.
    expect(b.position.x).toBeGreaterThan(0.5)
    expect(b.position.x).toBeLessThan(3)
  })
})

describe('hopTo', () => {
  it('stops on a road, facing the landmark, and counts round', () => {
    const layout = metroLayout(town(240))
    const count = layout.beacons.files.length
    const hop = hopTo(layout, 0)!
    expect(hop.file).toBe(layout.beacons.files[0])
    expect(hopTo(layout, count)!.file).toBe(hop.file)
    const at = new Vector3(...hop.at)
    const facing = new Vector3(...hop.facing)
    const foot = new Vector3().fromArray(layout.place.foot, hop.file * 3)
    expect(
      facing.normalize().dot(foot.clone().sub(at).normalize()),
    ).toBeCloseTo(1)
  })
})

describe('roadCallsOf', () => {
  it('names the calls crossing an avenue, each in the lane for its way', () => {
    const files = [file('a/x.ts'), file('a/y.ts'), file('b/z.ts')]
    const layout = metroLayout(
      fromAtlas({
        ...atlas(),
        files,
        calls: [
          [0, 2, 9],
          [2, 1, 4],
        ],
        imports: [],
      }),
    )
    // The avenue out to folder `a` carries both calls, one each way.
    const avenue = layout.roadCalls.findIndex(
      (c, i) => layout.roads[i]!.kind === RoadKind.avenue && c.length === 2,
    )
    expect(avenue).toBeGreaterThanOrEqual(0)
    const calls = layout.roadCalls[avenue]!
    expect(calls.map((c) => [c.from, c.to])).toContainEqual([0, 2])
    const out = calls.find((c) => c.from === 0)!
    const back = calls.find((c) => c.from === 2)!
    expect(out.toRoot).not.toBe(back.toRoot)
    expect(calls[0]!.count).toBeGreaterThanOrEqual(calls[1]!.count)
  })

  it('names nothing on a ring road', () => {
    const layout = metroLayout(town(120))
    layout.roads.forEach((r, i) => {
      if (r.kind === RoadKind.ring) expect(layout.roadCalls[i]).toEqual([])
    })
  })
})

describe('hidden', () => {
  it('knows when the planet stands between two points', () => {
    const r = 100
    expect(hidden(new Vector3(0, r + 1, 0), new Vector3(0, -r - 1, 0), r)).toBe(
      true,
    )
    expect(
      hidden(new Vector3(0, r + 1, 0), new Vector3(10, r + 20, 0), r),
    ).toBe(false)
  })
})
