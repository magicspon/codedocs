import {
  add,
  arc,
  cross,
  fromDisc,
  slerp,
  unit,
  type Vec3,
} from './metro-sphere.ts'
import { hash, rng } from './rng.ts'

/**
 * The shapes the metro's roads take, as points along the ground. None runs
 * straight: each bows and wanders a little, held still at its ends so it
 * still meets the roads it joins.
 */

/** Ground distance between points along a road. */
export const STEP = 1.5

/** Packs unit directions into a flat array. */
function pack(dirs: readonly Vec3[]): Float32Array {
  const out = new Float32Array(dirs.length * 3)
  dirs.forEach((d, i) => out.set(d, i * 3))
  return out
}

/**
 * Nudges each point sideways by up to `wander` world units: one gentle bow
 * and a slower sway, both zero at the ends.
 */
function sway(
  dirs: Vec3[],
  radius: number,
  wander: number,
  seed: string,
): Vec3[] {
  const random = rng(hash(seed))
  const phase = random() * Math.PI * 2
  const bow = random() * 2 - 1
  const last = dirs.length - 1
  return dirs.map((p, s) => {
    const t = s / last
    const side = unit(
      cross(
        p,
        add(dirs[Math.min(last, s + 1)]!, dirs[Math.max(0, s - 1)]!, -1),
      ),
    )
    const off =
      Math.sin(t * Math.PI) *
      (bow * 0.6 + Math.sin(t * 5 + phase) * 0.4) *
      wander
    return unit(add(p, side, off / radius))
  })
}

/** A road from `a` to `b`, wandering up to `wander` world units off the straight way; `null` if they meet. */
export function arcPath(
  a: Vec3,
  b: Vec3,
  radius: number,
  wander: number,
  seed: string,
): Float32Array | null {
  const length = arc(a, b) * radius
  if (length < STEP * 2) return null
  const steps = Math.ceil(length / STEP)
  const dirs: Vec3[] = []
  for (let s = 0; s <= steps; s++) dirs.push(slerp(a, b, s / steps))
  return pack(sway(dirs, radius, Math.min(wander, length * 0.18), seed))
}

/** Cuts every corner of a line, keeping its ends: one round of Chaikin's smoothing. */
function chaikin(line: readonly Vec3[]): Vec3[] {
  if (line.length < 3) return [...line]
  const out: Vec3[] = [line[0]!]
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i]!
    const b = line[i + 1]!
    out.push(
      unit(add(add([0, 0, 0], a, 0.75), b, 0.25)),
      unit(add(add([0, 0, 0], a, 0.25), b, 0.75)),
    )
  }
  out.push(line[line.length - 1]!)
  return out
}

/** Evenly spaced points along a line of points, `STEP` apart, running `reach` past each end. */
function resample(
  line: readonly Vec3[],
  radius: number,
  reach: number,
): Vec3[] {
  const lengths = [0]
  for (let i = 1; i < line.length; i++)
    lengths.push(lengths[i - 1]! + arc(line[i - 1]!, line[i]!) * radius)
  const total = lengths[lengths.length - 1]!
  const out: Vec3[] = []
  // Past the ends, the first and last stretch carry on the way they were heading.
  const at = (d: number): Vec3 => {
    if (d <= 0)
      return slerp(line[0]!, line[1]!, d / Math.max(lengths[1]!, 1e-9))
    if (d >= total) {
      const n = line.length - 1
      const span = Math.max(lengths[n]! - lengths[n - 1]!, 1e-9)
      return slerp(line[n - 1]!, line[n]!, 1 + (d - total) / span)
    }
    let i = 1
    while (lengths[i]! < d) i++
    return slerp(
      line[i - 1]!,
      line[i]!,
      (d - lengths[i - 1]!) / Math.max(lengths[i]! - lengths[i - 1]!, 1e-9),
    )
  }
  const steps = Math.max(2, Math.ceil((total + reach * 2) / STEP))
  for (let s = 0; s <= steps; s++)
    out.push(at(-reach + ((total + reach * 2) * s) / steps))
  return out
}

/**
 * A street down the middle of a folder's own buildings, `plots`: they are put
 * in order round the pole, smoothed into a line, and the line runs on a
 * little past the last building at each end. `null` for too few buildings to
 * make a street of.
 */
export function streetPath(
  plots: readonly Vec3[],
  radius: number,
): Float32Array | null {
  if (plots.length < 3) return null
  // Angles round the pole, measured from the buildings' own middle, so a
  // folder astride the zero meridian is not split in two.
  const middle = unit(plots.reduce<Vec3>((s, p) => add(s, p), [0, 0, 0]))
  const base = Math.atan2(middle[2], middle[0])
  const turn = (p: Vec3): number => {
    const a = Math.atan2(p[2], p[0]) - base
    return Math.atan2(Math.sin(a), Math.cos(a))
  }
  const sorted = [...plots].sort((a, b) => turn(a) - turn(b))
  // A running mean over a few neighbours irons out the zigzag between them.
  const k = Math.max(1, Math.min(6, Math.floor(sorted.length / 4)))
  const smooth = sorted.map((_, i) => {
    let s: Vec3 = [0, 0, 0]
    for (
      let j = Math.max(0, i - k);
      j <= Math.min(sorted.length - 1, i + k);
      j++
    )
      s = add(s, sorted[j]!)
    return unit(s)
  })
  // Every few points, with the corners cut twice, so the line is a curve, not a scribble.
  const coarse = chaikin(
    chaikin(smooth.filter((_, i) => i % k === 0 || i === smooth.length - 1)),
  )
  if (arc(coarse[0]!, coarse[coarse.length - 1]!) * radius < STEP * 3)
    return null
  return pack(resample(coarse, radius, 4))
}

/** One loop round the planet at ground share `share`, wandering north and south by `swing` world units. */
export function ringPath(
  share: number,
  radius: number,
  swing: number,
  seed: string,
): Float32Array {
  const random = rng(hash(seed))
  const phases = [random(), random()].map((p) => p * Math.PI * 2)
  const band = Math.sin(Math.acos(1 - 2 * share))
  const steps = Math.max(24, Math.ceil((Math.PI * 2 * radius * band) / STEP))
  // The share step that moves the road one world unit north or south.
  const unitShare = band / (2 * radius)
  const dirs: Vec3[] = []
  for (let s = 0; s <= steps; s++) {
    const a = (s / steps) * Math.PI * 2
    const w = Math.sin(a * 3 + phases[0]!) + 0.5 * Math.sin(a * 7 + phases[1]!)
    dirs.push(fromDisc(a, share + w * swing * unitShare))
  }
  return pack(dirs)
}
