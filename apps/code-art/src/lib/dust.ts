import { Color } from 'three'
import type { Link } from './atlas.ts'
import { cloud, type PointCloud } from './point-cloud.ts'
import { gaussian } from './rng.ts'
import type { Life } from './series.ts'

/** Puffs across every lane together; heavy repos thin out rather than slow down. */
const MAX_DUST = 60000
/** Puffs per unit of lane on the lightest and the heaviest call. */
const THINNEST = 0.6
const THICKEST = 2.4
/** How far a lane bows along the galaxy's turn, against its length. */
const BOW = 0.18
/** Lanes this long are half as bright; far-flung calls stay a whisper. */
const REACH = 25
/** Dust is starlight on grains: the two files' colours, reddened towards rust. */
const GRAIN = new Color('#b0502a')

/**
 * Calls as dust lanes. Each link scatters many small, faint puffs along a
 * path between its two files, bowed the way the arms wind and settled into
 * the disc, so the lanes read as spiral dust, not a wire web. Puffs are laid
 * per unit of length, so a long lane is no sparser than a short one, and a
 * heavier call lays them thicker. Long lanes fade, leaving the dust where
 * related files sit close: along the arms. Each puff lives as long as its call.
 *
 * `ends` gives the colours at the two ends, which blend along the lane.
 */
export function dust(
  links: readonly Link[],
  lives: readonly Life[],
  centres: readonly (readonly [number, number, number])[],
  ends: (from: number, to: number) => readonly [Color, Color],
  random: () => number,
): PointCloud {
  const heaviest = Math.log1p(links[0]?.[2] ?? 1)
  const shares = links.map(([, , w]) => Math.log1p(w) / heaviest)
  const lengths = links.map(([from, to]) => {
    const a = centres[from]!
    const b = centres[to]!
    return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  })
  const wanted = shares.map(
    (s, i) => (THINNEST + (THICKEST - THINNEST) * s) * (2 + lengths[i]!),
  )
  const total = wanted.reduce((a, b) => a + b, 0)
  const thin = Math.min(1, MAX_DUST / Math.max(1, total))
  const counts = wanted.map((w) => Math.max(1, Math.floor(w * thin)))

  const out = cloud(counts.reduce((a, b) => a + b, 0))
  const colour = new Color()
  let p = 0
  links.forEach(([from, to], i) => {
    const a = centres[from]!
    const b = centres[to]!
    const length = lengths[i]!
    // The galaxy's turn at the lane's middle: the way the arms wind.
    const mx = (a[0] + b[0]) / 2
    const mz = (a[2] + b[2]) / 2
    const round = Math.hypot(mx, mz) || 1
    const bow = length * BOW
    const width = 0.3 + length * 0.03
    const [ca, cb] = ends(from, to)
    // Thinned lanes lay fewer puffs, so each burns a little brighter to keep the lane's weight.
    const k =
      (0.006 + 0.014 * shares[i]!) / (1 + length / REACH) / Math.sqrt(thin)
    const [birth, death] = lives[i]!
    for (let n = 0; n < counts[i]!; n++, p++) {
      const t = random()
      // Thin at the stars, billowing between them.
      const swell = Math.sin(Math.PI * t)
      const spread = width * (0.25 + swell)
      // Dust settles into the disc: a lane to a halo file dips to the plane between.
      const y = (a[1] + (b[1] - a[1]) * t) * (1 - 0.85 * swell)
      out.positions.set(
        [
          a[0] +
            (b[0] - a[0]) * t +
            (-mz / round) * bow * swell +
            gaussian(random) * spread,
          y + gaussian(random) * (0.15 + spread * 0.08),
          a[2] +
            (b[2] - a[2]) * t +
            (mx / round) * bow * swell +
            gaussian(random) * spread,
        ],
        p * 3,
      )
      colour.lerpColors(ca, cb, t).lerp(GRAIN, 0.6).multiplyScalar(k)
      out.colors.set([colour.r, colour.g, colour.b], p * 3)
      out.sizes[p] = (0.5 + width * 0.25) * (0.5 + random() * (0.5 + swell))
      out.births[p] = birth
      out.deaths[p] = death
      out.files[p] = from
    }
  })
  return out
}
