import type { FileDatum, Link } from './atlas.ts'
import type { Blocks } from './metro-buildings.ts'
import type { Placement } from './metro-relax.ts'
import { arc, slerp, type Vec3 } from './metro-sphere.ts'
import { mostCalled } from './most-called.ts'
import { hash } from './rng.ts'

/**
 * What moves above the streets. The heaviest calls between files fly as sky
 * lanes, roof to roof, arching higher the further apart the two files stand,
 * so a call to the far side of the planet climbs over the horizon. The files
 * the rest of the code calls most send beams of light into the sky, which a
 * driver can steer by from anywhere.
 */

/** How many calls fly, at most, and per file; the rest ride the roads. */
const LANES = 400
const LANES_PER_FILE = 0.08
/** How many files send up a beam. */
const BEACONS = 12

/** Sky lanes as line segments, two points each, with their distance along and weight. */
export interface Lanes {
  readonly positions: Float32Array
  /** World units from the lane's start, plus a per-lane head start. */
  readonly along: Float32Array
  /** `0`–`1` against the heaviest lane. */
  readonly weight: Float32Array
  /** Per lane, the file calling, the file called, and how often: `[from, to, count]`. */
  readonly calls: readonly (readonly [number, number, number])[]
  /** Per lane, `[x, y, z]` of its highest point, where its name floats. */
  readonly apex: Float32Array
}

/** The most-called files, most called first, with the foot and roof of each. */
export interface Beacons {
  readonly files: readonly number[]
  /** `[x, y, z, roof]` per beacon: the foot, and the building's height. */
  readonly spots: Float32Array
  /** `0`–`1` against the most-called file. */
  readonly share: Float32Array
}

function footOf(place: Placement, i: number): Vec3 {
  return [place.foot[i * 3]!, place.foot[i * 3 + 1]!, place.foot[i * 3 + 2]!]
}

/**
 * A lane's points in the world: from roof `h0` over `ua` to roof `h1` over
 * `ub`, arching higher the further apart they are.
 */
function arcOf(
  ua: Vec3,
  ub: Vec3,
  h0: number,
  h1: number,
  distance: number,
  radius: number,
): Vec3[] {
  const steps = Math.min(64, Math.max(12, Math.ceil(distance / 4)))
  const out: Vec3[] = []
  for (let s = 0; s <= steps; s++) {
    const t = s / steps
    const d = slerp(ua, ub, t)
    const lift =
      h0 + (h1 - h0) * t + Math.sin(t * Math.PI) * (10 + distance * 0.3)
    out.push([
      d[0] * (radius + lift),
      d[1] * (radius + lift),
      d[2] * (radius + lift),
    ])
  }
  return out
}

/** Lanes for the heaviest calls between buildings more than a street apart. */
export function lanesOf(
  calls: readonly Link[],
  blocks: Blocks,
  place: Placement,
  radius: number,
): Lanes {
  const positions: number[] = []
  const along: number[] = []
  const weight: number[] = []
  const named: [number, number, number][] = []
  const apex: number[] = []
  const heaviest = Math.log1p(calls[0]?.[2] ?? 1)
  let taken = 0
  const most = Math.min(LANES, Math.ceil(blocks.count * LANES_PER_FILE))
  for (const [from, to, count] of calls) {
    if (taken >= most) break
    if (from === to) continue
    const a = footOf(place, from)
    const b = footOf(place, to)
    const ua: Vec3 = [a[0] / radius, a[1] / radius, a[2] / radius]
    const ub: Vec3 = [b[0] / radius, b[1] / radius, b[2] / radius]
    const distance = arc(ua, ub) * radius
    if (distance < 20) continue
    taken++
    const h0 = blocks.height[from]! + 3
    const h1 = blocks.height[to]! + 3
    const points = arcOf(ua, ub, h0, h1, distance, radius)
    const w = Math.log1p(count) / heaviest
    let run = (hash(`lane:${from}:${to}`) % 1000) / 10
    for (let s = 1; s < points.length; s++) {
      const [p, q] = [points[s - 1]!, points[s]!]
      const step = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2])
      positions.push(...p, ...q)
      along.push(run, run + step)
      weight.push(w, w)
      run += step
    }
    named.push([from, to, count])
    apex.push(...points[points.length >> 1]!)
  }
  return {
    positions: new Float32Array(positions),
    along: new Float32Array(along),
    weight: new Float32Array(weight),
    calls: named,
    apex: new Float32Array(apex),
  }
}

/** Beams over the `BEACONS` files the rest of the code calls most; tests never count. */
export function beaconsOf(
  files: readonly FileDatum[],
  blocks: Blocks,
  place: Placement,
): Beacons {
  const picked = mostCalled(files, BEACONS)
  const most = Math.log1p(picked[0]?.[1] ?? 1)
  const spots = new Float32Array(picked.length * 4)
  const share = new Float32Array(picked.length)
  picked.forEach(([file, calls], n) => {
    spots.set([...footOf(place, file), blocks.height[file]!], n * 4)
    share[n] = Math.log1p(calls) / most
  })
  return { files: picked.map(([i]) => i), spots, share }
}
