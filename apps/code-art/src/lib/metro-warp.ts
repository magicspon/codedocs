import { fromDisc, type Vec3 } from './metro-sphere.ts'
import { hash, rng } from './rng.ts'

/**
 * Deals every file a plot, and bends the ground to match.
 *
 * The folder tree packs a folder's files into a narrow fan, far too tight to
 * build on. So the city is cut into bands running round the pole, each about
 * one plot deep, and each band's files are dealt out evenly round it in the
 * order they sat on the disc. The ground fills evenly, and a folder's files
 * stay together.
 *
 * Dealing slides files round their band, so the same slide is kept as a
 * warp: anything else drawn on the disc, such as a road from one folder to
 * the next, is bent through it and still meets the files it served.
 */

/** Maps a disc point, as angle round the pole and share of the planet, to the planet. */
export type Warp = (angle: number, share: number) => Vec3

/** One band's dealing: file angles on the disc, sorted, and where each was dealt. */
interface Band {
  readonly from: readonly number[]
  readonly to: readonly number[]
}

const TURN = Math.PI * 2

/** Where angle `a` slides to in `band`: a straight blend between the dealt files either side. */
function slideIn(band: Band, a: number): number {
  const { from, to } = band
  const n = from.length
  if (n === 0) return a
  // Brought into the turn that starts at the first file, then back out after.
  const base = from[0]!
  const wrapped = base + ((((a - base) % TURN) + TURN) % TURN)
  let lo = 0
  let hi = n
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (from[mid]! <= wrapped) lo = mid + 1
    else hi = mid
  }
  // `lo - 1` is the last file at or before; past the end, the first comes round again.
  const i = lo - 1
  const f0 = from[i]!
  const t0 = to[i]!
  const f1 = i + 1 < n ? from[i + 1]! : from[0]! + TURN
  const t1 = i + 1 < n ? to[i + 1]! : to[0]! + TURN
  const t = f1 > f0 ? (wrapped - f0) / (f1 - f0) : 0
  return t0 + (t1 - t0) * t + (a - wrapped)
}

/**
 * Deals `angles.length` files, each given as its disc angle and ground share,
 * into `count` bands over the first `reach` of the planet.
 */
export function deal(
  angles: readonly number[],
  shares: readonly number[],
  count: number,
  reach: number,
): { plots: Vec3[]; warp: Warp } {
  const n = angles.length
  const plots: Vec3[] = angles.map(() => [0, 1, 0])
  const byShare = angles
    .map((_, i) => i)
    .sort((a, b) => shares[a]! - shares[b]!)
  const depth = reach / count
  const bands: Band[] = []
  for (let b = 0; b < count; b++) {
    const band = byShare.slice(
      Math.floor((b * n) / count),
      Math.floor(((b + 1) * n) / count),
    )
    band.sort((x, y) => angles[x]! - angles[y]!)
    // Each band starts at its first file's own angle, so the dealing keeps
    // the ring's turn instead of sliding every band back to zero.
    const phase = band.length > 0 ? angles[band[0]!]! : 0
    const to = band.map((_, j) => phase + ((j + 0.5) / band.length) * TURN)
    bands.push({ from: band.map((i) => angles[i]!), to })
    // A little jitter, so the bands do not read as rows.
    const random = rng(hash(`band:${b}`))
    band.forEach((file, j) => {
      const a = to[j]! + ((random() - 0.5) * 0.6 * TURN) / band.length
      plots[file] = fromDisc(a, depth * (b + 0.15 + 0.7 * random()))
    })
  }
  const warp: Warp = (angle, share) => {
    // Blended between the two bands whose middles lie either side.
    const u = Math.min(count - 1, Math.max(0, share / depth - 0.5))
    const b = Math.min(count - 2, Math.floor(u))
    if (b < 0) return fromDisc(slideIn(bands[0]!, angle), share)
    const t = u - b
    const a =
      slideIn(bands[b]!, angle) * (1 - t) + slideIn(bands[b + 1]!, angle) * t
    return fromDisc(a, share)
  }
  return { plots, warp }
}
