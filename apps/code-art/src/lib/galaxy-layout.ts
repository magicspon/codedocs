import { Color } from 'three'
import { isTest, symbolCount } from './atlas.ts'
import { healthTracks, type HealthTracks } from './health.ts'
import { galaxyPalette } from './galaxy-palette.ts'
import { discStar, tiltOf } from './accretion.ts'
import { dust } from './dust.ts'
import { cloud, type PointCloud } from './point-cloud.ts'
import { gaussian, hash, rng } from './rng.ts'
import { placeFiles } from './galaxy-placement.ts'
import { galaxyStructure, type GalaxyShape } from './galaxy-shape.ts'
import { starLook } from './star-look.ts'
import type { Life, Series } from './series.ts'
import { threads, type Threads } from './threads.ts'

/**
 * The galaxy's geometry, computed once per dataset.
 *
 * - **Shape** is how the code is organised (`galaxy-shape.ts`): spiral,
 *   barred, elliptical or irregular.
 * - **Arms** are the largest top-level directories; everything else orbits in
 *   the halo.
 * - **Radius** is gravity: the most-called, most-referenced, most-imported
 *   files sit in the bright core, and leaf code drifts to the rim.
 * - **Stars** are symbols, clustered around their file and coloured by kind.
 * - **Colours** lean to the dataset's own palette (`galaxy-palette.ts`).
 * - **Black holes** are test files: their symbols ring a dark middle as a disc.
 * - **Nebulae** (astrophotography inks) are unresolved calls: where the analysis could not see.
 * - **Dust lanes** are the heaviest calls, bowed the way the arms wind.
 * - **Health** (when fallow ran): hotspots flare, unused files grey out, and
 *   files sharing copied code are drawn as binary pairs joined by a thread.
 *
 * Every point and line carries the frames it lives in, so a timeline plays on
 * the GPU by moving one uniform.
 */

export interface GalaxyLayout {
  /** One bright point per file, in `Atlas.files` order, so a hit's index is the file. */
  readonly cores: PointCloud
  readonly stars: PointCloud
  readonly nebulae: PointCloud
  /** Dust lanes along the heaviest calls. */
  readonly dust: PointCloud
  /** Line segment pairs joining files that share copied code. */
  readonly clones: Threads
  readonly health: HealthTracks
  readonly radius: number
  /** The galaxy's Hubble type, read from how the code is organised. */
  readonly shape: GalaxyShape
  /** How far the files' stars were spread apart, against their points' size. */
  readonly spread: number
}

const MAX_STARS_PER_FILE = 300
const MAX_LINKS = 1800
/**
 * How far apart files' stars sit, against the galaxy's shape. Only the
 * centres spread: each star's cloud of symbols and haze keeps its place
 * round it, so there is open space to fly through between systems. Points
 * keep their size here; the scene draws them larger by `spread` when viewed
 * from afar, so the galaxy still looks the same from its viewing distance.
 */
const SPREAD = 4
const CLONE_COLOR = new Color('#9fd8ff')
/** How far a dust lane leans from its files' colours to its grain. */
const GRAIN_LEAN = 0.6

/**
 * When star `k` of a file lives: while the file has enough symbols that its
 * share of `shown` stars reaches `k`. Stars light up as a file grows.
 */
function starLife(
  series: Series,
  file: number,
  k: number,
  shown: number,
  total: number,
): Life {
  let birth = -1
  let death = 0
  series.at.forEach((row, f) => {
    const datum = row[file]
    if (datum && k < (shown * symbolCount(datum)) / total) {
      if (birth < 0) birth = f
      death = f + 1
    }
  })
  return birth < 0 ? [0, 0] : [birth, death]
}

/** Builds every buffer the galaxy scene draws. */
export function galaxyLayout(series: Series): GalaxyLayout {
  const atlas = series.merged
  const { files } = atlas
  const n = files.length
  const random = rng(hash(atlas.name))
  const radius = 18 + Math.sqrt(n) * 0.9

  const structure = galaxyStructure(atlas)
  const { keys, rank } = structure
  const armOf = new Map(structure.arms.map((k, i) => [k, i]))
  const centres = placeFiles(
    structure,
    radius,
    random,
    rng(hash(`${atlas.name}:clumps`)),
  )

  for (const c of centres) {
    c[0] *= SPREAD
    c[1] *= SPREAD
    c[2] *= SPREAD
  }

  const palette = galaxyPalette(atlas.name, files)
  // An irregular galaxy is all clumps and no arms, so every folder gets a colour.
  const groups = new Map([...new Set(keys)].sort().map((k, i) => [k, i]))
  const tint = files.map((f, i) =>
    structure.shape === 'irregular'
      ? palette.arm(groups.get(keys[i]!)!)
      : armOf.has(keys[i]!)
        ? palette.arm(armOf.get(keys[i]!)!)
        : palette.halo(f.project),
  )

  const cores = cloud(n)
  files.forEach((f, i) => {
    cores.positions.set(centres[i]!, i * 3)
    // Brighter with gravity, but the core is where points pile up, so dim by density too.
    const crowd = Math.sqrt(Math.min(1, 200 / n))
    const glow = new Color()
      .lerpColors(tint[i]!, new Color('#ffffff'), 0.4)
      .multiplyScalar((0.35 + (1 - rank[i]!) * 0.9) * (0.4 + 0.6 * crowd))
    // A test file is a black hole: its middle stays all but dark, though it still answers the pointer.
    if (isTest(f)) glow.multiplyScalar(0.06)
    cores.colors.set([glow.r, glow.g, glow.b], i * 3)
    cores.sizes[i] = 0.35 + Math.log1p(f.callsIn + f.refsIn) * 0.18
    ;[cores.births[i], cores.deaths[i]] = series.fileLife[i]!
    cores.files[i] = i
  })

  const starCount = files.reduce(
    (sum, f) => sum + Math.min(MAX_STARS_PER_FILE, symbolCount(f)),
    0,
  )
  const stars = cloud(starCount)
  let s = 0
  files.forEach((f, i) => {
    const total = symbolCount(f)
    const shown = Math.min(MAX_STARS_PER_FILE, total)
    const sigma = 0.25 + Math.sqrt(total) * 0.07
    const [cx, cy, cz] = centres[i]!
    const hole = isTest(f) ? tiltOf(random) : null
    // Walk the kind counts so each star takes the kind its share says it should.
    let kind = 0
    let seen = 0
    for (let k = 0; k < shown; k++, s++) {
      const at = (k / shown) * total
      while (kind < 7 && seen + f.kinds[kind]! <= at) seen += f.kinds[kind++]!
      if (hole) {
        // A test's symbols are swept into the disc round its hole.
        const star = discStar(random, sigma * 1.1, hole, 0.4 + 0.6 * rank[i]!)
        stars.positions.set(
          [cx + star.offset[0], cy + star.offset[1], cz + star.offset[2]],
          s * 3,
        )
        stars.colors.set([star.color.r, star.color.g, star.color.b], s * 3)
        stars.sizes[s] = star.size
      } else {
        const { color, size } = starLook(palette.kinds[kind]!, rank[i]!, random)
        stars.positions.set(
          [
            cx + gaussian(random) * sigma,
            cy + gaussian(random) * sigma * 0.5,
            cz + gaussian(random) * sigma,
          ],
          s * 3,
        )
        stars.colors.set([color.r, color.g, color.b], s * 3)
        stars.sizes[s] = size
      }
      stars.files[s] = i
      ;[stars.births[s], stars.deaths[s]] = starLife(series, i, k, shown, total)
    }
  })

  // Only the blindest tenth of files get haze; where every file has some, haze everywhere says nothing.
  const blindness = files
    .map((f) => f.unresolved)
    .filter((u) => u > 0)
    .sort((a, b) => b - a)
  const cutoff = blindness[Math.floor(blindness.length * 0.1)] ?? Infinity
  const hazy = files
    .map((_, i) => i)
    .filter((i) => files[i]!.unresolved >= Math.max(cutoff, 1))
  const nebulaCount = hazy.reduce(
    (sum, i) => sum + Math.min(6, Math.ceil(Math.log1p(files[i]!.unresolved))),
    0,
  )
  const nebulae = cloud(nebulaCount)
  let b = 0
  for (const i of hazy) {
    const puffs = Math.min(6, Math.ceil(Math.log1p(files[i]!.unresolved)))
    const [cx, cy, cz] = centres[i]!
    // Colour from the path, not `random`, so the stream (and every later draw) is unchanged.
    const { r: hr, g: hg, b: hb } = palette.nebula(files[i]!.path)
    for (let k = 0; k < puffs; k++, b++) {
      nebulae.positions.set(
        [
          cx + gaussian(random) * 1.2,
          cy + gaussian(random) * 0.4,
          cz + gaussian(random) * 1.2,
        ],
        b * 3,
      )
      const glow = 0.75 + random() * 0.45
      nebulae.colors.set([hr * glow, hg * glow, hb * glow], b * 3)
      nebulae.sizes[b] = 2.5 + random() * 4
      ;[nebulae.births[b], nebulae.deaths[b]] = series.fileLife[i]!
    }
  }

  const lanes = dust(
    atlas.calls.slice(0, MAX_LINKS),
    series.callLife,
    centres,
    (from, to) => {
      // Dust is starlight on grains: the two files' colours, leant to the lane's grain.
      const grain = palette.grain(from, to)
      return [
        tint[from]!.clone().lerp(grain, GRAIN_LEAN),
        tint[to]!.clone().lerp(grain, GRAIN_LEAN),
      ]
    },
    random,
  )
  // Pale blue-white, like a pair of hot young stars; the copy is the bond.
  const clones = threads(
    (atlas.clones ?? []).slice(0, MAX_LINKS),
    series.cloneLife,
    centres,
    () => [CLONE_COLOR, CLONE_COLOR],
    (share) => 0.015 + 0.1 * share,
  )

  return {
    cores,
    stars,
    nebulae,
    dust: lanes,
    clones,
    health: healthTracks(series),
    radius: radius * SPREAD,
    shape: structure.shape,
    spread: SPREAD,
  }
}
