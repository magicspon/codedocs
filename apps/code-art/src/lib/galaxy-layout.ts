import { Color } from 'three'
import { symbolCount } from './atlas.ts'
import { KIND_COLORS, projectColor } from './palette.ts'
import { gaussian, hash, rng } from './rng.ts'
import type { Life, Series } from './series.ts'

/**
 * The galaxy's geometry, computed once per dataset.
 *
 * - **Arms** are the largest top-level directories; everything else orbits in
 *   the halo.
 * - **Radius** is gravity: the most-called, most-referenced, most-imported
 *   files sit in the bright core, and leaf code drifts to the rim.
 * - **Stars** are symbols, clustered around their file and coloured by kind.
 * - **Red nebulae** are unresolved calls: where the analysis could not see.
 *
 * Every point and line carries the frames it lives in, so a timeline plays on
 * the GPU by moving one uniform.
 */

/** Point buffers ready for a `bufferGeometry`. */
export interface PointCloud {
  readonly positions: Float32Array
  readonly colors: Float32Array
  readonly sizes: Float32Array
  /** Per point: the frame it appears in. */
  readonly births: Float32Array
  /** Per point: the frame it is gone by. */
  readonly deaths: Float32Array
}

export interface GalaxyLayout {
  /** One bright point per file, in `Atlas.files` order, so a hit's index is the file. */
  readonly cores: PointCloud
  readonly stars: PointCloud
  readonly nebulae: PointCloud
  /** Line segment pairs for the heaviest calls. */
  readonly links: {
    readonly positions: Float32Array
    readonly colors: Float32Array
    readonly births: Float32Array
    readonly deaths: Float32Array
  }
  readonly radius: number
}

const MAX_STARS_PER_FILE = 300
const MAX_LINKS = 1800
const MAX_ARMS = 8

/**
 * Finds the shallowest directory depth that splits the repo into at least
 * three sizeable groups, none holding most of the files — otherwise vscode's
 * `src/` would be one arm and the spiral would read as a disc.
 */
function armKeys(paths: readonly string[]): string[] {
  for (let depth = 1; depth <= 5; depth++) {
    const keys = paths.map((p) => p.split('/').slice(0, depth).join('/'))
    const counts = new Map<string, number>()
    for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1)
    const sizeable = [...counts.values()].filter(
      (n) => n >= paths.length * 0.02,
    )
    const largest = Math.max(...counts.values())
    if (sizeable.length >= 3 && largest <= paths.length * 0.45) return keys
  }
  return paths.map((p) => p.split('/')[0]!)
}

function cloud(n: number): PointCloud {
  return {
    positions: new Float32Array(n * 3),
    colors: new Float32Array(n * 3),
    sizes: new Float32Array(n),
    births: new Float32Array(n),
    deaths: new Float32Array(n),
  }
}

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

  // Gravity: how much of the rest of the codebase leans on this file.
  const importsIn = Array.from({ length: n }, () => 0)
  for (const [, to] of atlas.imports) importsIn[to]!++
  const gravity = files.map(
    (f, i) => f.callsIn + f.refsIn * 0.5 + importsIn[i]! * 2,
  )
  const order = files.map((_, i) => i).sort((a, b) => gravity[b]! - gravity[a]!)
  const rank: number[] = Array.from({ length: n }, () => 0)
  order.forEach((file, r) => (rank[file] = r / Math.max(1, n - 1)))

  const keys = armKeys(files.map((f) => f.path))
  const counts = new Map<string, number>()
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1)
  const arms = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_ARMS)
    .map(([k]) => k)
  const armOf = new Map(arms.map((k, i) => [k, i]))

  const centres: [number, number, number][] = files.map((_, i) => {
    const arm = armOf.get(keys[i]!)
    const r = radius * (0.04 + 0.96 * Math.pow(rank[i]!, 0.75))
    if (arm === undefined) {
      // Halo: a loose flattened shell for code outside the main arms.
      const theta = random() * Math.PI * 2
      const phi = Math.acos(2 * random() - 1)
      const shell = radius * (0.5 + random() * 0.8)
      return [
        shell * Math.sin(phi) * Math.cos(theta),
        shell * Math.cos(phi) * 0.45,
        shell * Math.sin(phi) * Math.sin(theta),
      ]
    }
    const t = r / radius
    const theta =
      (arm / arms.length) * Math.PI * 2 + t * 4.2 + gaussian(random) * 0.13
    const spread = gaussian(random) * radius * 0.018
    const thickness = 0.35 + 3 * Math.exp(-t * t * 10)
    return [
      Math.cos(theta) * r + spread,
      gaussian(random) * thickness,
      Math.sin(theta) * r + spread,
    ]
  })

  const tint = files.map((f, i) =>
    armOf.has(keys[i]!)
      ? projectColor(armOf.get(keys[i]!)!, 0.55, 0.7)
      : projectColor(f.project, 0.2, 0.6),
  )

  const cores = cloud(n)
  files.forEach((f, i) => {
    cores.positions.set(centres[i]!, i * 3)
    // Brighter with gravity, but the core is where points pile up, so dim by density too.
    const crowd = Math.sqrt(Math.min(1, 200 / n))
    const glow = new Color()
      .lerpColors(tint[i]!, new Color('#ffffff'), 0.4)
      .multiplyScalar((0.35 + (1 - rank[i]!) * 0.9) * (0.4 + 0.6 * crowd))
    cores.colors.set([glow.r, glow.g, glow.b], i * 3)
    cores.sizes[i] = 0.35 + Math.log1p(f.callsIn + f.refsIn) * 0.18
    ;[cores.births[i], cores.deaths[i]] = series.fileLife[i]!
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
    // Walk the kind counts so each star takes the kind its share says it should.
    let kind = 0
    let seen = 0
    for (let k = 0; k < shown; k++, s++) {
      const at = (k / shown) * total
      while (kind < 7 && seen + f.kinds[kind]! <= at) seen += f.kinds[kind++]!
      const color = KIND_COLORS[kind]!.clone().multiplyScalar(
        (0.2 + random() * 0.5) * (0.4 + 0.6 * rank[i]!),
      )
      stars.positions.set(
        [
          cx + gaussian(random) * sigma,
          cy + gaussian(random) * sigma * 0.5,
          cz + gaussian(random) * sigma,
        ],
        s * 3,
      )
      stars.colors.set([color.r, color.g, color.b], s * 3)
      stars.sizes[s] = 0.12 + random() * 0.22
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
    for (let k = 0; k < puffs; k++, b++) {
      nebulae.positions.set(
        [
          cx + gaussian(random) * 1.2,
          cy + gaussian(random) * 0.4,
          cz + gaussian(random) * 1.2,
        ],
        b * 3,
      )
      nebulae.colors.set([0.05 + random() * 0.03, 0.004, 0.012], b * 3)
      nebulae.sizes[b] = 2.5 + random() * 4
      ;[nebulae.births[b], nebulae.deaths[b]] = series.fileLife[i]!
    }
  }

  const calls = atlas.calls.slice(0, MAX_LINKS)
  const heaviest = Math.log1p(calls[0]?.[2] ?? 1)
  const links = {
    positions: new Float32Array(calls.length * 6),
    colors: new Float32Array(calls.length * 6),
    births: new Float32Array(calls.length * 2),
    deaths: new Float32Array(calls.length * 2),
  }
  calls.forEach(([from, to, weight], i) => {
    links.positions.set([...centres[from]!, ...centres[to]!], i * 6)
    const [birth, death] = series.callLife[i]!
    links.births.set([birth, birth], i * 2)
    links.deaths.set([death, death], i * 2)
    const k = 0.015 + 0.12 * (Math.log1p(weight) / heaviest)
    const a = tint[from]!
    const c = tint[to]!
    links.colors.set(
      [a.r * k, a.g * k, a.b * k, c.r * k, c.g * k, c.b * k],
      i * 6,
    )
  })

  return { cores, stars, nebulae, links, radius }
}
